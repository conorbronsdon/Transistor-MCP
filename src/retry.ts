/**
 * Request resilience for the Transistor API client.
 *
 * Transistor rate-limits at 10 requests per 10 seconds; on breach it returns
 * HTTP 429 and blocks further requests for 10 seconds, and it sends no
 * Retry-After (or any rate-limit) header. Tools like compare_episodes and
 * get_all_episode_analytics fan out concurrent requests, so 429s are expected
 * in normal use. This module adds a small, dependency-free retry layer (an
 * axios response interceptor):
 *   - 429: wait a flat delay (default 10s, matching the documented block),
 *     since exponential backoff from ~1s would just retry inside the window.
 *   - transient 5xx, timeouts, and network errors (GET/HEAD only): exponential
 *     backoff. Writes are never retried, so a create is not sent twice.
 *   - a server-sent Retry-After, if any, always takes precedence.
 * A random jitter proportional to the delay is added so a burst of concurrent
 * 429s from one fan-out doesn't retry in lockstep and stampede the limit again.
 *
 * Configurable via environment variables (all optional):
 *   TRANSISTOR_TIMEOUT_MS          request timeout in ms (default 30000, 0 disables)
 *   TRANSISTOR_MAX_RETRIES         retry attempts per request (default 3, 0 disables)
 *   TRANSISTOR_RETRY_DELAY_MS      base 5xx backoff delay in ms (default 1000)
 *   TRANSISTOR_RATE_LIMIT_DELAY_MS flat 429 wait in ms (default 10000)
 */

import axios, { AxiosInstance } from "axios";

export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_RETRY_DELAY_MS = 1_000;
export const DEFAULT_RATE_LIMIT_DELAY_MS = 10_000;

// Never sleep longer than this between retries, even if Retry-After asks.
const MAX_RETRY_DELAY_MS = 30_000;
// Random jitter added to each retry, as a fraction of the (capped) delay.
const JITTER_RATIO = 0.25;

export interface ResilienceOptions {
  /** Request timeout in ms (0 disables the timeout). */
  timeoutMs: number;
  /** Maximum number of retries after the initial attempt (0 disables retry). */
  maxRetries: number;
  /** Base delay for 5xx exponential backoff: base * 2^attempt. */
  retryDelayMs: number;
  /** Flat wait applied on a 429 (Transistor's documented block duration). */
  rateLimitDelayMs: number;
  /** Injectable sleep for tests; defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable [0,1) source for jitter; defaults to Math.random. */
  jitter?: () => number;
}

/**
 * Parse a non-negative integer from an env var, falling back to the default
 * for missing, non-numeric, or negative values.
 */
function envInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  // Strictly a non-negative integer: reject blanks/whitespace, floats, and
  // hex/exponent forms rather than silently coercing them (e.g. Number(" ")
  // is 0, which would otherwise disable a timeout by accident).
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : fallback;
}

/**
 * Read resilience settings from the environment (or a provided env object,
 * for tests), applying defaults.
 */
export function resolveResilienceOptions(
  env: Record<string, string | undefined> = process.env
): ResilienceOptions {
  return {
    timeoutMs: envInt(env.TRANSISTOR_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    maxRetries: envInt(env.TRANSISTOR_MAX_RETRIES, DEFAULT_MAX_RETRIES),
    retryDelayMs: envInt(env.TRANSISTOR_RETRY_DELAY_MS, DEFAULT_RETRY_DELAY_MS),
    rateLimitDelayMs: envInt(
      env.TRANSISTOR_RATE_LIMIT_DELAY_MS,
      DEFAULT_RATE_LIMIT_DELAY_MS
    ),
  };
}

/**
 * Parse a Retry-After header into milliseconds. Supports both forms from
 * RFC 9110: delay-seconds ("2") and an HTTP-date. Returns undefined when
 * absent or unparseable.
 */
function retryAfterMs(header: unknown): number | undefined {
  if (typeof header !== "string" || header === "") return undefined;
  if (/^\d+$/.test(header)) return Number(header) * 1000;
  const date = Date.parse(header);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - Date.now());
}

/**
 * Decide whether a failed request is worth retrying:
 * - 429 (rate limit) is always retryable — the request was rejected, not run.
 * - Transient 5xx is retried only for GET/HEAD, so non-idempotent calls
 *   (e.g. create_episode) are never sent twice after an ambiguous failure.
 */
function isRetryable(error: unknown): boolean {
  if (!axios.isAxiosError(error) || !error.config) return false;
  const status = error.response?.status;
  // A rate-limited request was rejected, not run, so retrying it is safe
  // regardless of method.
  if (status === 429) return true;
  // Everything else is retried only for idempotent reads, so a write is never
  // sent twice after an ambiguous failure.
  const method = (error.config.method ?? "get").toLowerCase();
  if (method !== "get" && method !== "head") return false;
  // Never revive a user-cancelled request.
  if (error.code === "ERR_CANCELED") return false;
  // No response means a timeout or network error (ECONNABORTED, ECONNRESET,
  // …) — worth retrying on a read. Otherwise retry only transient 5xx.
  if (!error.response) return true;
  return status !== undefined && status >= 500 && status < 600;
}

/**
 * Compute the delay before the next retry. A server-sent Retry-After wins;
 * otherwise a 429 waits the flat rate-limit delay (the block is a fixed
 * window, so backoff would just under-wait it) and a 5xx uses exponential
 * backoff. The base is capped, then a small jitter is added to de-sync
 * concurrent retries.
 */
function retryDelay(
  attempt: number,
  status: number | undefined,
  header: unknown,
  options: ResilienceOptions
): number {
  const fromHeader = retryAfterMs(header);
  let base: number;
  if (fromHeader !== undefined) {
    base = fromHeader;
  } else if (status === 429) {
    base = options.rateLimitDelayMs;
  } else {
    base = options.retryDelayMs * 2 ** attempt;
  }
  const capped = Math.min(base, MAX_RETRY_DELAY_MS);
  const jitter = Math.floor((options.jitter ?? Math.random)() * capped * JITTER_RATIO);
  return Math.min(capped + jitter, MAX_RETRY_DELAY_MS);
}

/**
 * Install the retry interceptor on an axios instance. Retries run through
 * the same instance, so headers, baseURL, and this interceptor all apply
 * again; the attempt counter is carried on the request config.
 */
export function applyRetry(
  instance: AxiosInstance,
  options: ResilienceOptions
): void {
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  instance.interceptors.response.use(undefined, async (error: unknown) => {
    if (!axios.isAxiosError(error) || !error.config) throw error;
    const config = error.config as typeof error.config & {
      __retryCount?: number;
    };
    const attempt = config.__retryCount ?? 0;
    if (attempt >= options.maxRetries || !isRetryable(error)) throw error;

    config.__retryCount = attempt + 1;
    await sleep(
      retryDelay(
        attempt,
        error.response?.status,
        error.response?.headers?.["retry-after"],
        options
      )
    );
    return instance.request(config);
  });
}
