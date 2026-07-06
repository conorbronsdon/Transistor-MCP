import { test } from "node:test";
import assert from "node:assert/strict";
import { ToolHandlers } from "../src/tool-handlers.js";
import { TransistorApiClient } from "../src/api-client.js";

/**
 * Build a ToolHandlers instance backed by a stub API client — no network.
 * Only the methods a given test exercises need to be provided.
 */
function makeHandlers(stub: Partial<Record<string, unknown>>) {
  return new ToolHandlers(stub as unknown as TransistorApiClient, true);
}

/** Unwrap the JSON payload from an MCP tool result. */
function parseResult(result: { content: { text: string }[] }) {
  return JSON.parse(result.content[0].text);
}

/** Wrap per-day downloads in the shape the Transistor analytics API returns. */
function analyticsResponse(downloads: { date: string; downloads: number }[]) {
  return { data: { attributes: { downloads } } };
}

// 14 days spanning a month boundary, deliberately out of order, using the
// API's dd-mm-yyyy format. Chronologically: 21-27 June (prev week, total 65)
// then 28 June - 4 July (last week, total 110).
const FOURTEEN_DAYS = [
  { date: "01-07-2025", downloads: 20 }, // best day (last week)
  { date: "22-06-2025", downloads: 10 },
  { date: "04-07-2025", downloads: 15 },
  { date: "25-06-2025", downloads: 5 }, // worst day (prev week)
  { date: "28-06-2025", downloads: 15 },
  { date: "21-06-2025", downloads: 10 },
  { date: "30-06-2025", downloads: 15 },
  { date: "23-06-2025", downloads: 10 },
  { date: "03-07-2025", downloads: 15 },
  { date: "26-06-2025", downloads: 10 },
  { date: "29-06-2025", downloads: 15 },
  { date: "24-06-2025", downloads: 10 },
  { date: "02-07-2025", downloads: 15 },
  { date: "27-06-2025", downloads: 10 },
];

test("get_download_summary sorts chronologically and computes week-over-week", async () => {
  const handlers = makeHandlers({
    getAnalytics: async () => analyticsResponse(FOURTEEN_DAYS),
  });
  const summary = parseResult(
    await handlers.handleToolCall("get_download_summary", { show_id: "1" })
  );

  assert.equal(summary.total_downloads, 175);
  assert.equal(summary.days_in_range, 14);
  assert.equal(summary.daily_average, 12.5);
  assert.deepEqual(summary.best_day, { date: "2025-07-01", downloads: 20 });
  assert.deepEqual(summary.worst_day, { date: "2025-06-25", downloads: 5 });

  // Input order was shuffled and crosses a month boundary — a naive
  // slice(-7) without a chronological sort would get this wrong.
  assert.deepEqual(summary.week_over_week_trend, {
    current_week: 110,
    previous_week: 65,
    change_pct: 69.2, // (110 - 65) / 65 * 100, rounded to 1 decimal
  });
});

test("get_download_summary omits the trend when fewer than 14 days", async () => {
  const tenDays = FOURTEEN_DAYS.slice(0, 10);
  const handlers = makeHandlers({
    getAnalytics: async () => analyticsResponse(tenDays),
  });
  const summary = parseResult(
    await handlers.handleToolCall("get_download_summary", { show_id: "1" })
  );

  assert.equal(summary.days_in_range, 10);
  assert.equal(
    summary.total_downloads,
    tenDays.reduce((s, d) => s + d.downloads, 0)
  );
  assert.equal(summary.week_over_week_trend, null);
});

test("get_download_summary handles an empty range", async () => {
  const handlers = makeHandlers({
    getAnalytics: async () => analyticsResponse([]),
  });
  const summary = parseResult(
    await handlers.handleToolCall("get_download_summary", { show_id: "1" })
  );

  assert.deepEqual(summary, {
    total_downloads: 0,
    daily_average: 0,
    days_in_range: 0,
    best_day: null,
    worst_day: null,
    week_over_week_trend: null,
  });
});

test("list_episodes strips heavy fields but keeps description and summary", async () => {
  const episode = {
    attributes: {
      title: "Episode 1",
      description: "keep me",
      summary: "keep me too",
      formatted_description: "<p>heavy</p>",
      formatted_summary: "<p>heavy</p>",
      embed_html: "<iframe></iframe>",
      embed_html_dark: "<iframe></iframe>",
    },
  };
  const handlers = makeHandlers({
    listEpisodes: async () => ({ data: [episode] }),
  });
  const result = parseResult(
    await handlers.handleToolCall("list_episodes", { show_id: "1" })
  );

  const attrs = result.data[0].attributes;
  assert.equal(attrs.title, "Episode 1");
  assert.equal(attrs.description, "keep me");
  assert.equal(attrs.summary, "keep me too");
  assert.equal("formatted_description" in attrs, false);
  assert.equal("formatted_summary" in attrs, false);
  assert.equal("embed_html" in attrs, false);
  assert.equal("embed_html_dark" in attrs, false);
});

test("update_episode trims a single-episode (non-array) response too", async () => {
  const handlers = makeHandlers({
    updateEpisode: async () => ({
      data: {
        attributes: { title: "Updated", embed_html: "<iframe></iframe>" },
      },
    }),
  });
  const result = parseResult(
    await handlers.handleToolCall("update_episode", { episode_id: "42" })
  );

  assert.equal(result.data.attributes.title, "Updated");
  assert.equal("embed_html" in result.data.attributes, false);
});
