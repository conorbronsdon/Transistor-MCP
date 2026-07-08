import { describe, it, expect, afterEach } from "vitest";
import nock from "nock";
import { TransistorApiClient } from "../api-client.js";
import {
  AuthenticationError,
  RateLimitError,
  ValidationError,
  NotFoundError,
  ServerError,
  TransistorError,
} from "../errors.js";

/**
 * These tests exercise the actual axios response interceptor registered in
 * `TransistorApiClient`'s constructor (see ../api-client.ts), not just the
 * pure `mapHttpStatusToError`/`extractErrorDetail` functions it calls. That
 * distinction matters: the interceptor is the thing that reads
 * `error.response?.status` / `error.response?.data` off a *real* Axios
 * error and decides whether `axios.isAxiosError` gates correctly. A unit
 * test on the mapping functions alone can't catch a wiring bug (e.g. the
 * interceptor never firing, or reading the wrong field off the Axios
 * error object) — only a request that actually goes through axios can.
 *
 * `nock` intercepts at the Node http layer, so these calls never leave the
 * process; axios still runs its full request/response/interceptor pipeline
 * against the mocked response.
 */
describe("TransistorApiClient response interceptor (end-to-end through axios)", () => {
  afterEach(() => nock.cleanAll());

  it("maps a 401 response to AuthenticationError", async () => {
    nock("https://api.transistor.fm").get("/v1").reply(401, { message: "Invalid API key" });
    const client = new TransistorApiClient("bad-key");
    await expect(client.getAuthenticatedUser()).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("maps a 403 response to AuthenticationError", async () => {
    nock("https://api.transistor.fm").get("/v1").reply(403, { message: "Forbidden" });
    const client = new TransistorApiClient("revoked-key");
    await expect(client.getAuthenticatedUser()).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("maps a 429 response to RateLimitError and preserves the detail", async () => {
    nock("https://api.transistor.fm")
      .get("/v1")
      .reply(429, { errors: [{ detail: "Too many requests" }] });
    const client = new TransistorApiClient("key");
    try {
      await client.getAuthenticatedUser();
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitError);
      expect((err as RateLimitError).message).toContain("Too many requests");
    }
  });

  it("maps a 400 response to ValidationError and preserves the detail", async () => {
    nock("https://api.transistor.fm")
      .get("/v1/episodes/authorize_upload")
      .query(true)
      .reply(400, { message: "filename is required" });
    const client = new TransistorApiClient("key");
    try {
      await client.authorizeUpload({ filename: "" });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).message).toContain("filename is required");
    }
  });

  it("maps a 404 response to NotFoundError and preserves the detail", async () => {
    nock("https://api.transistor.fm")
      .get("/v1")
      .reply(404, { errors: [{ detail: "no such user" }] });
    const client = new TransistorApiClient("key");
    try {
      await client.getAuthenticatedUser();
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(NotFoundError);
      expect((err as NotFoundError).message).toContain("no such user");
    }
  });

  it("maps a 500 response to ServerError", async () => {
    nock("https://api.transistor.fm").get("/v1").reply(500, "Internal Server Error");
    const client = new TransistorApiClient("key");
    await expect(client.getAuthenticatedUser()).rejects.toBeInstanceOf(ServerError);
  });

  it("maps a network failure (no HTTP response at all) to the base TransistorError", async () => {
    nock("https://api.transistor.fm").get("/v1").replyWithError("connect ECONNREFUSED");
    const client = new TransistorApiClient("key");
    try {
      await client.getAuthenticatedUser();
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TransistorError);
      expect(err).not.toBeInstanceOf(AuthenticationError);
      expect(err).not.toBeInstanceOf(ServerError);
    }
  });

  it("does not double-wrap: the thrown error's message is the fully-formatted typed message, not a generic axios message", async () => {
    nock("https://api.transistor.fm").get("/v1").reply(404, { errors: [{ detail: "no such user" }] });
    const client = new TransistorApiClient("key");
    try {
      await client.getAuthenticatedUser();
      throw new Error("should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("Not found (404)");
      expect(message).toContain("no such user");
      // A double-wrap would produce something like
      // "API error (undefined): Not found (404): no such user" — assert
      // the typed prefix appears exactly once.
      expect(message.match(/Not found \(404\)/g)?.length).toBe(1);
    }
  });
});
