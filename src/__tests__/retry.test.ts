import { test, expect } from "vitest";
import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import {
  applyRetry,
  resolveResilienceOptions,
  ResilienceOptions,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RETRY_DELAY_MS,
  DEFAULT_RATE_LIMIT_DELAY_MS,
} from "../retry.js";

interface FakeResponse {
  status: number; // use 0 to simulate a response-less network/timeout error
  headers?: Record<string, string>;
  data?: unknown;
  code?: string; // axios error code for the status-0 case (e.g. ECONNABORTED)
}

/**
 * Build an axios instance whose adapter replays a scripted sequence of
 * responses (no network). Error statuses reject with a real AxiosError,
 * matching what axios's built-in adapters do. Sleeps are recorded instead
 * of actually waiting, and jitter is pinned to 0, so tests run instantly
 * and deterministically.
 */
function makeClient(
  responses: FakeResponse[],
  overrides: Partial<ResilienceOptions> = {}
) {
  const calls: InternalAxiosRequestConfig[] = [];
  const sleeps: number[] = [];

  const instance = axios.create({
    adapter: async (config) => {
      calls.push(config);
      const next = responses[Math.min(calls.length - 1, responses.length - 1)];
      if (next.status === 0) {
        // Response-less failure: a timeout or network error carries a code
        // (e.g. ECONNABORTED) and no `.response`, like axios's real adapters.
        throw new AxiosError(
          next.code ?? "ECONNABORTED",
          next.code ?? "ECONNABORTED",
          config,
          {}
        );
      }
      const response = {
        data: next.data ?? {},
        status: next.status,
        statusText: "",
        headers: next.headers ?? {},
        config,
      };
      if (next.status >= 400) {
        throw new AxiosError(
          `Request failed with status code ${next.status}`,
          String(next.status),
          config,
          {},
          response as never
        );
      }
      return response;
    },
  });

  applyRetry(instance, {
    timeoutMs: 0,
    maxRetries: 3,
    retryDelayMs: 100,
    rateLimitDelayMs: 500,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    jitter: () => 0,
    ...overrides,
  });

  return { instance, calls, sleeps };
}

test("retries a 429 and succeeds on the second attempt", async () => {
  const { instance, calls, sleeps } = makeClient([
    { status: 429 },
    { status: 200, data: { ok: true } },
  ]);
  const res = await instance.get("/v1/analytics/1");
  expect(res.status).toBe(200);
  expect(res.data).toEqual({ ok: true });
  expect(calls.length).toBe(2);
  expect(sleeps).toEqual([500]); // flat rate-limit delay
});

test("waits a flat delay across consecutive 429s (not exponential)", async () => {
  // Transistor blocks for a fixed 10s window, so every 429 waits the same
  // flat delay rather than backing off exponentially.
  const { instance, calls, sleeps } = makeClient([
    { status: 429 },
    { status: 429 },
    { status: 429 },
    { status: 200 },
  ]);
  await instance.get("/v1/shows");
  expect(calls.length).toBe(4);
  expect(sleeps).toEqual([500, 500, 500]);
});

test("backs off exponentially across consecutive 5xx on GET", async () => {
  const { instance, calls, sleeps } = makeClient([
    { status: 503 },
    { status: 503 },
    { status: 503 },
    { status: 200 },
  ]);
  await instance.get("/v1/episodes");
  expect(calls.length).toBe(4);
  expect(sleeps).toEqual([100, 200, 400]); // 100 * 2^attempt
});

test("honors Retry-After (delay-seconds) over the flat wait", async () => {
  const { instance, sleeps } = makeClient([
    { status: 429, headers: { "retry-after": "2" } },
    { status: 200 },
  ]);
  await instance.get("/v1/shows");
  expect(sleeps).toEqual([2000]);
});

test("caps an excessive Retry-After at 30s", async () => {
  const { instance, sleeps } = makeClient([
    { status: 429, headers: { "retry-after": "120" } },
    { status: 200 },
  ]);
  await instance.get("/v1/shows");
  expect(sleeps).toEqual([30_000]);
});

test("treats a past HTTP-date Retry-After as retry-now", async () => {
  const { instance, sleeps } = makeClient([
    { status: 429, headers: { "retry-after": "Wed, 21 Oct 2015 07:28:00 GMT" } },
    { status: 200 },
  ]);
  await instance.get("/v1/shows");
  expect(sleeps).toEqual([0]);
});

test("adds jitter proportional to the delay to de-sync retries", async () => {
  const { instance, sleeps } = makeClient(
    [{ status: 429 }, { status: 200 }],
    { jitter: () => 0.4 } // floor(0.4 * 500 * 0.25) = +50ms
  );
  await instance.get("/v1/shows");
  expect(sleeps).toEqual([550]); // 500 flat + 50 jitter
});

test("never sleeps past the cap even with jitter", async () => {
  const { instance, sleeps } = makeClient(
    [{ status: 429, headers: { "retry-after": "120" } }, { status: 200 }],
    { jitter: () => 1 } // would add 25% on top of the 30s cap without the clamp
  );
  await instance.get("/v1/shows");
  expect(sleeps).toEqual([30_000]);
});

test("retries a timed-out GET (no response) with backoff", async () => {
  const { instance, calls, sleeps } = makeClient([
    { status: 0, code: "ECONNABORTED" },
    { status: 200, data: { ok: true } },
  ]);
  const res = await instance.get("/v1/analytics/1");
  expect(res.data.ok).toBe(true);
  expect(calls.length).toBe(2);
  expect(sleeps).toEqual([100]); // 5xx/network base backoff, attempt 0
});

test("does not retry a cancelled request", async () => {
  const { instance, calls } = makeClient([{ status: 0, code: "ERR_CANCELED" }]);
  await expect(instance.get("/v1/shows")).rejects.toThrow();
  expect(calls.length).toBe(1);
});

test("does not retry a network error on POST (non-idempotent)", async () => {
  const { instance, calls } = makeClient([{ status: 0, code: "ECONNRESET" }]);
  await expect(instance.post("/v1/episodes", {})).rejects.toThrow();
  expect(calls.length).toBe(1);
});

test("gives up after maxRetries and rethrows the last error", async () => {
  const { instance, calls } = makeClient([{ status: 429 }], { maxRetries: 3 });
  const gaveUp = await instance.get("/v1/shows").catch((e: unknown) => e);
  if (!axios.isAxiosError(gaveUp))
    throw new Error("expected an AxiosError after retries exhausted");
  expect(gaveUp.response?.status).toBe(429);
  expect(calls.length).toBe(4); // 1 initial + 3 retries
});

test("maxRetries 0 disables retry entirely", async () => {
  const { instance, calls } = makeClient([{ status: 429 }, { status: 200 }], {
    maxRetries: 0,
  });
  await expect(instance.get("/v1/shows")).rejects.toThrow();
  expect(calls.length).toBe(1);
});

test("retries a transient 503 on GET", async () => {
  const { instance, calls } = makeClient([
    { status: 503 },
    { status: 200, data: { ok: true } },
  ]);
  const res = await instance.get("/v1/episodes");
  expect(res.data.ok).toBe(true);
  expect(calls.length).toBe(2);
});

test("does not retry a 5xx on POST (non-idempotent)", async () => {
  const { instance, calls } = makeClient([{ status: 500 }, { status: 200 }]);
  await expect(instance.post("/v1/episodes", {})).rejects.toThrow();
  expect(calls.length).toBe(1);
});

test("does not retry non-retryable client errors like 404", async () => {
  const { instance, calls } = makeClient([{ status: 404 }, { status: 200 }]);
  await expect(instance.get("/v1/episodes/missing")).rejects.toThrow();
  expect(calls.length).toBe(1);
});

test("resolveResilienceOptions applies defaults and env overrides", () => {
  expect(resolveResilienceOptions({})).toEqual({
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxRetries: DEFAULT_MAX_RETRIES,
    retryDelayMs: DEFAULT_RETRY_DELAY_MS,
    rateLimitDelayMs: DEFAULT_RATE_LIMIT_DELAY_MS,
  });
  expect(resolveResilienceOptions({
      TRANSISTOR_TIMEOUT_MS: "5000",
      TRANSISTOR_MAX_RETRIES: "1",
      TRANSISTOR_RETRY_DELAY_MS: "250",
      TRANSISTOR_RATE_LIMIT_DELAY_MS: "8000",
    })).toEqual({ timeoutMs: 5000, maxRetries: 1, retryDelayMs: 250, rateLimitDelayMs: 8000 });
  // Garbage values — including whitespace and exponent/hex forms that Number()
  // would otherwise coerce — fall back to defaults rather than breaking the
  // client (a blank must not silently disable the timeout).
  expect(resolveResilienceOptions({
      TRANSISTOR_TIMEOUT_MS: " ",
      TRANSISTOR_MAX_RETRIES: "-2",
      TRANSISTOR_RETRY_DELAY_MS: "1e3",
      TRANSISTOR_RATE_LIMIT_DELAY_MS: "0x10",
    })).toEqual({
      timeoutMs: DEFAULT_TIMEOUT_MS,
      maxRetries: DEFAULT_MAX_RETRIES,
      retryDelayMs: DEFAULT_RETRY_DELAY_MS,
      rateLimitDelayMs: DEFAULT_RATE_LIMIT_DELAY_MS,
    });
});
