/**
 * Date format utilities for the Transistor API.
 *
 * The Transistor API expects dates in dd-mm-yyyy format, but ISO yyyy-mm-dd
 * is far more natural for LLMs and less error-prone. These helpers detect
 * which format was provided and convert to the API's expected format.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TRANSISTOR_DATE_RE = /^\d{2}-\d{2}-\d{4}$/;

/**
 * Convert a date string to Transistor's dd-mm-yyyy format.
 * Accepts either ISO (yyyy-mm-dd) or already-correct (dd-mm-yyyy).
 * Returns undefined for undefined input.
 */
export function toTransistorDate(date: string | undefined): string | undefined {
  if (!date) return undefined;

  if (ISO_DATE_RE.test(date)) {
    const [year, month, day] = date.split("-");
    return `${day}-${month}-${year}`;
  }

  if (TRANSISTOR_DATE_RE.test(date)) {
    // Already in Transistor format
    return date;
  }

  // Unknown format — pass through and let the API reject if invalid
  return date;
}

/**
 * Convert a Transistor dd-mm-yyyy date string to ISO yyyy-mm-dd.
 */
export function toIsoDate(date: string): string {
  if (ISO_DATE_RE.test(date)) return date;

  if (TRANSISTOR_DATE_RE.test(date)) {
    const [day, month, year] = date.split("-");
    return `${year}-${month}-${day}`;
  }

  return date;
}
