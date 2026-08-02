// Query-string plumbing for URL-derived sheet state (`?sheet=<name>`).
//
// Sheets are NOT routes and will not become routes — this param exists so the Android back
// gesture and the browser Back button close the top sheet instead of leaving the page. No
// entity id ever goes in here: the owning route already carries it in the path
// (/places/[id]?sheet=edit). Framework-free so the string handling is unit-testable;
// lib/useSheetParam.ts is the React side.

export const SHEET_PARAM = "sheet";

/** Normalises URLSearchParams back to a leading-`?` string, or "" when it holds nothing. */
function serialize(params: URLSearchParams): string {
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** `search` with `sheet=<name>` set, every other param preserved in order. */
export function withSheet(search: string, name: string): string {
  const params = new URLSearchParams(search);
  params.set(SHEET_PARAM, name);
  return serialize(params);
}

/** `search` with any `sheet` param removed. */
export function withoutSheet(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(SHEET_PARAM);
  return serialize(params);
}
