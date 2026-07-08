/**
 * Typed error hierarchy for the Transistor.fm API client.
 *
 * `TransistorApiClient` maps every HTTP failure to one of these classes based
 * on status code (see `mapHttpStatusToError`) via a single axios response
 * interceptor registered in its constructor, so callers can branch on error
 * type with `instanceof` instead of parsing status codes out of a generic
 * message. `ToolHandlers` catches `TransistorError` and surfaces
 * `error.message` directly in the MCP `isError` response — each subclass
 * builds its own fully-formatted, human-readable message so that formatting
 * logic lives in one place.
 *
 * Ported from the same pattern in conorbronsdon/podcastindex-mcp (v0.3.0).
 */

export class TransistorError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "TransistorError";
    this.status = status;
    Object.setPrototypeOf(this, TransistorError.prototype);
  }
}

/** HTTP 401/403 — bad, missing, or expired API credentials. */
export class AuthenticationError extends TransistorError {
  constructor(detail: string, status: number) {
    super(
      `Authentication error (${status}): ${detail}. Check that TRANSISTOR_API_KEY is correct and has not been revoked in the Transistor.fm dashboard.`,
      status
    );
    this.name = "AuthenticationError";
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/** HTTP 429 — too many requests against the Transistor.fm API. */
export class RateLimitError extends TransistorError {
  constructor(detail: string, status: number) {
    super(
      `Rate limit error (${status}): ${detail}. Slow down requests to the Transistor.fm API and try again shortly.`,
      status
    );
    this.name = "RateLimitError";
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/** HTTP 400 — malformed or invalid request parameters. */
export class ValidationError extends TransistorError {
  constructor(detail: string, status: number) {
    super(
      `Validation error (${status}): ${detail}. Check the arguments passed to this tool.`,
      status
    );
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/** HTTP 404 — the requested show, episode, subscriber, or webhook does not exist. */
export class NotFoundError extends TransistorError {
  constructor(detail: string, status: number) {
    super(`Not found (${status}): ${detail}.`, status);
    this.name = "NotFoundError";
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/** HTTP 5xx — failure on Transistor.fm's side. */
export class ServerError extends TransistorError {
  constructor(detail: string, status: number) {
    super(
      `Server error (${status}): ${detail}. The Transistor.fm API may be experiencing issues — try again later.`,
      status
    );
    this.name = "ServerError";
    Object.setPrototypeOf(this, ServerError.prototype);
  }
}

/**
 * Maps an HTTP status code + error detail string to the appropriate typed
 * error. Falls back to the base `TransistorError` (preserving the original
 * "API error (<status>): <detail>" wording) for status codes outside the
 * mapped classes, or when no status is available (e.g. network failures).
 */
export function mapHttpStatusToError(status: number | undefined, detail: string): TransistorError {
  if (status === 401 || status === 403) return new AuthenticationError(detail, status);
  if (status === 429) return new RateLimitError(detail, status);
  if (status === 400) return new ValidationError(detail, status);
  if (status === 404) return new NotFoundError(detail, status);
  if (status !== undefined && status >= 500) return new ServerError(detail, status);
  return new TransistorError(`API error (${status ?? "unknown"}): ${detail}`, status);
}

/**
 * Pulls a human-readable detail string out of an Axios error response body.
 *
 * Unlike podcastindex-mcp, we have not been able to hit the live Transistor
 * API to confirm the exact shape of its error bodies, so this is a best
 * effort built from two signals already in this codebase: (1) the
 * pre-existing (pre-typed-errors) catch block in tool-handlers.ts read a flat
 * `error.response?.data?.message` field, which may have been an incomplete
 * guess rather than a confirmed shape; (2) every *successful* response
 * shape used throughout api-client.ts and `trimEpisodeResponse` in
 * tool-handlers.ts follows the JSON:API convention (`{ data: { attributes:
 * ... } }`), and JSON:API's own spec defines errors as `{ errors: [ { status,
 * title, detail } ] }` — a strong signal Transistor's error bodies plausibly
 * follow the same convention elsewhere in the API surface, even though we
 * have not observed it directly.
 *
 * To stay safe against both possibilities (and anything else), this checks,
 * in priority order:
 *   1. A plain string body (mirrors podcastindex-mcp, in case Transistor also
 *      sends bare-text bodies for some error class).
 *   2. An object with a `.message` string field (preserves the exact
 *      behavior of the pre-typed-errors code at tool-handlers.ts ~line 1105).
 *   3. An object with an `.errors` array (JSON:API shape) where each entry
 *      may carry `.detail` or `.title`; multiple entries are joined into one
 *      string.
 *   4. The provided fallback (e.g. Axios's generic "Request failed with
 *      status code NNN") if none of the above match.
 * It never throws on an unexpected shape — an unrecognized body degrades to
 * the fallback rather than crashing the error-mapping path itself.
 */
export function extractErrorDetail(responseData: unknown, fallback: string): string {
  if (typeof responseData === "string" && responseData.length > 0) return responseData;

  if (responseData && typeof responseData === "object") {
    const message = (responseData as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) return message;

    const errors = (responseData as { errors?: unknown }).errors;
    if (Array.isArray(errors) && errors.length > 0) {
      const parts = errors
        .map((e) => {
          if (e && typeof e === "object") {
            const detail = (e as { detail?: unknown }).detail;
            if (typeof detail === "string" && detail.length > 0) return detail;
            const title = (e as { title?: unknown }).title;
            if (typeof title === "string" && title.length > 0) return title;
          }
          return undefined;
        })
        .filter((part): part is string => Boolean(part));
      if (parts.length > 0) return parts.join("; ");
    }
  }

  return fallback;
}
