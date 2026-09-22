/**
 * Removes invisible spreadsheet characters that PostgreSQL/PostgREST cannot
 * safely accept inside a JSON request while preserving the visible value.
 */
export function sanitizeDatabaseText(value: unknown): string {
  if (value == null) return "";

  return String(value)
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")
    .trim();
}