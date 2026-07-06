import { test } from "node:test";
import assert from "node:assert/strict";
import { toTransistorDate, toIsoDate } from "../src/date-utils.js";

test("toTransistorDate converts ISO yyyy-mm-dd to dd-mm-yyyy", () => {
  assert.equal(toTransistorDate("2025-01-31"), "31-01-2025");
  assert.equal(toTransistorDate("2024-02-29"), "29-02-2024"); // leap day
});

test("toTransistorDate passes through already-correct dd-mm-yyyy", () => {
  assert.equal(toTransistorDate("31-01-2025"), "31-01-2025");
});

test("toTransistorDate returns undefined for undefined/empty input", () => {
  assert.equal(toTransistorDate(undefined), undefined);
  assert.equal(toTransistorDate(""), undefined);
});

test("toTransistorDate rejects impossible calendar dates", () => {
  assert.throws(() => toTransistorDate("2025-13-40"), /Invalid date/);
  assert.throws(() => toTransistorDate("2025-02-30"), /Invalid date/);
  assert.throws(() => toTransistorDate("2025-00-10"), /Invalid date/);
  assert.throws(() => toTransistorDate("2023-02-29"), /Invalid date/); // not a leap year
});

test("toTransistorDate passes unknown formats through for the API to reject", () => {
  assert.equal(toTransistorDate("Jan 5, 2025"), "Jan 5, 2025");
});

test("toIsoDate converts dd-mm-yyyy to ISO and passes ISO through", () => {
  assert.equal(toIsoDate("31-01-2025"), "2025-01-31");
  assert.equal(toIsoDate("2025-01-31"), "2025-01-31");
  assert.equal(toIsoDate("not-a-date"), "not-a-date");
});

test("dates round-trip between the two formats", () => {
  assert.equal(toIsoDate(toTransistorDate("2025-07-04")!), "2025-07-04");
  assert.equal(toTransistorDate(toIsoDate("04-07-2025")), "04-07-2025");
});
