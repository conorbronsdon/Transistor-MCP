import { test } from "node:test";
import assert from "node:assert/strict";
import { AxiosError, AxiosInstance } from "axios";
import { TransistorApiClient } from "../src/api-client.js";

/** Reach the private axios instance the client builds in its constructor. */
function axiosOf(client: TransistorApiClient): AxiosInstance {
  return (client as unknown as { api: AxiosInstance }).api;
}

test("constructor applies the configured timeout to the axios instance", () => {
  // Guards against a wiring typo (e.g. reading `.timeout` instead of
  // `.timeoutMs`), which would compile and pass every retry-unit test.
  const client = new TransistorApiClient("secret", {
    timeoutMs: 12_345,
    maxRetries: 0,
    retryDelayMs: 1,
    rateLimitDelayMs: 1,
  });
  const api = axiosOf(client);
  assert.equal(api.defaults.timeout, 12_345);
  assert.equal(api.defaults.baseURL, "https://api.transistor.fm");
  assert.equal(api.defaults.headers["x-api-key"], "secret");
});

test("constructor wires the retry interceptor end-to-end (429 then success)", async () => {
  const client = new TransistorApiClient("secret", {
    timeoutMs: 0,
    maxRetries: 2,
    retryDelayMs: 1,
    rateLimitDelayMs: 1,
    sleep: async () => {}, // no real waiting
    jitter: () => 0,
  });
  const api = axiosOf(client);

  let attempts = 0;
  // Swap the adapter (the retry interceptor is already installed) so the real
  // client path — method → interceptor → retry — is exercised without network.
  api.defaults.adapter = async (config) => {
    attempts += 1;
    if (attempts === 1) {
      throw new AxiosError(
        "rate limited",
        "429",
        config,
        {},
        { status: 429, statusText: "", headers: {}, data: {}, config } as never
      );
    }
    return {
      data: { data: { id: "show-1", type: "show" } },
      status: 200,
      statusText: "",
      headers: {},
      config,
    };
  };

  const show = await client.getShow({ show_id: "show-1" });
  assert.equal(attempts, 2); // one 429, retried once, then 200
  assert.deepEqual(show, { data: { id: "show-1", type: "show" } });
});
