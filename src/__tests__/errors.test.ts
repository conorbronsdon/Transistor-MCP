import { describe, it, expect } from "vitest";
import {
  TransistorError,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  NotFoundError,
  ServerError,
  mapHttpStatusToError,
  extractErrorDetail,
} from "../errors.js";

describe("typed error hierarchy", () => {
  it("every subclass extends TransistorError, which extends Error", () => {
    expect(new AuthenticationError("bad key", 401)).toBeInstanceOf(TransistorError);
    expect(new RateLimitError("slow down", 429)).toBeInstanceOf(TransistorError);
    expect(new ValidationError("bad param", 400)).toBeInstanceOf(TransistorError);
    expect(new NotFoundError("no such show", 404)).toBeInstanceOf(TransistorError);
    expect(new ServerError("oops", 500)).toBeInstanceOf(TransistorError);
    expect(new TransistorError("generic")).toBeInstanceOf(Error);
  });

  it("each subclass sets a distinct .name", () => {
    expect(new AuthenticationError("x", 401).name).toBe("AuthenticationError");
    expect(new RateLimitError("x", 429).name).toBe("RateLimitError");
    expect(new ValidationError("x", 400).name).toBe("ValidationError");
    expect(new NotFoundError("x", 404).name).toBe("NotFoundError");
    expect(new ServerError("x", 500).name).toBe("ServerError");
    expect(new TransistorError("x").name).toBe("TransistorError");
  });

  it("carries the status code on .status", () => {
    expect(new AuthenticationError("x", 403).status).toBe(403);
    expect(new RateLimitError("x", 429).status).toBe(429);
    expect(new ValidationError("x", 400).status).toBe(400);
    expect(new NotFoundError("x", 404).status).toBe(404);
    expect(new ServerError("x", 500).status).toBe(500);
  });
});

describe("mapHttpStatusToError", () => {
  it("maps 401 and 403 to AuthenticationError", () => {
    expect(mapHttpStatusToError(401, "bad key")).toBeInstanceOf(AuthenticationError);
    expect(mapHttpStatusToError(403, "forbidden")).toBeInstanceOf(AuthenticationError);
  });

  it("includes API-key guidance in the AuthenticationError message", () => {
    const err = mapHttpStatusToError(401, "Invalid auth");
    expect(err.message).toContain("Authentication error (401)");
    expect(err.message).toContain("Invalid auth");
    expect(err.message).toContain("TRANSISTOR_API_KEY");
  });

  it("maps 429 to RateLimitError", () => {
    const err = mapHttpStatusToError(429, "too many requests");
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.message).toContain("Rate limit error (429)");
    expect(err.message).toContain("too many requests");
  });

  it("maps 400 to ValidationError", () => {
    const err = mapHttpStatusToError(400, "missing show_id");
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.message).toContain("Validation error (400)");
    expect(err.message).toContain("missing show_id");
  });

  it("maps 404 to NotFoundError", () => {
    const err = mapHttpStatusToError(404, "no such episode");
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.message).toContain("Not found (404)");
    expect(err.message).toContain("no such episode");
  });

  it("maps 500-599 to ServerError", () => {
    expect(mapHttpStatusToError(500, "boom")).toBeInstanceOf(ServerError);
    expect(mapHttpStatusToError(502, "bad gateway")).toBeInstanceOf(ServerError);
    expect(mapHttpStatusToError(503, "unavailable")).toBeInstanceOf(ServerError);
    const err = mapHttpStatusToError(500, "boom");
    expect(err.message).toContain("Server error (500)");
    expect(err.message).toContain("boom");
  });

  it("falls back to base TransistorError for unmapped status codes", () => {
    const err = mapHttpStatusToError(418, "teapot");
    expect(err).toBeInstanceOf(TransistorError);
    expect(err).not.toBeInstanceOf(AuthenticationError);
    expect(err).not.toBeInstanceOf(RateLimitError);
    expect(err).not.toBeInstanceOf(ValidationError);
    expect(err).not.toBeInstanceOf(NotFoundError);
    expect(err).not.toBeInstanceOf(ServerError);
    expect(err.message).toContain("API error (418)");
    expect(err.message).toContain("teapot");
  });

  it("falls back to base TransistorError when status is undefined (network failure)", () => {
    const err = mapHttpStatusToError(undefined, "ECONNREFUSED");
    expect(err).toBeInstanceOf(TransistorError);
    expect(err.status).toBeUndefined();
    expect(err.message).toContain("API error (unknown)");
    expect(err.message).toContain("ECONNREFUSED");
  });
});

describe("extractErrorDetail", () => {
  it("returns a bare string response body as-is", () => {
    expect(extractErrorDetail("Not authorized.", "fallback")).toBe("Not authorized.");
  });

  it("returns the message field from an object response body (legacy shape)", () => {
    expect(extractErrorDetail({ message: "Invalid show_id" }, "fallback")).toBe("Invalid show_id");
  });

  it("returns and joins detail fields from a JSON:API errors array", () => {
    expect(
      extractErrorDetail({ errors: [{ status: "404", detail: "Episode not found" }] }, "fallback")
    ).toBe("Episode not found");
    expect(
      extractErrorDetail(
        {
          errors: [
            { detail: "Episode not found" },
            { detail: "Show not found" },
          ],
        },
        "fallback"
      )
    ).toBe("Episode not found; Show not found");
  });

  it("falls back to title when a JSON:API error entry has no detail", () => {
    expect(extractErrorDetail({ errors: [{ title: "Not Found" }] }, "fallback")).toBe("Not Found");
  });

  it("falls back when response data is undefined (network failure, no response)", () => {
    expect(extractErrorDetail(undefined, "ECONNREFUSED")).toBe("ECONNREFUSED");
  });

  it("falls back when response data is an object with no message or errors field", () => {
    expect(extractErrorDetail({ status: "false" }, "fallback")).toBe("fallback");
  });

  it("falls back when response data is an empty string", () => {
    expect(extractErrorDetail("", "fallback")).toBe("fallback");
  });

  it("falls back when errors array is empty or entries have no usable fields", () => {
    expect(extractErrorDetail({ errors: [] }, "fallback")).toBe("fallback");
    expect(extractErrorDetail({ errors: [{ status: "500" }] }, "fallback")).toBe("fallback");
  });
});
