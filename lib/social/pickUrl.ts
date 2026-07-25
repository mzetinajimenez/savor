// Normalizes the two share-target shapes a caller might hand in — a dedicated `url` param, or a
// free-text `text` blob that merely happens to contain a link — into a single validated URL
// string, or null when neither yields one. Framework-free (no React/DOM) so it's a plain Vitest
// unit, unlike the /import route that's its only caller today.
//
// Note on scheme enforcement: pickUrl only checks that `new URL()` accepts the string — it does
// NOT restrict to http(s). A crafted `javascript:` or `data:` string that round-trips through
// `new URL()` would be returned as-is. That's deliberate: the http(s)-only enforcement lives one
// layer down, at lib/repo.ts's `placeFields.sourceUrl` schema (the actual write path everything
// funnels through, including backup import) — see that file's comment for why. pickUrl doesn't
// duplicate it here.

// (1) A bare, already-valid `url` wins outright.
// (2) Otherwise, the first `https?://` run in `text` — stripped of trailing punctuation a
//     sentence tends to glue onto a link ("...check it out!" or a link in parens) — if it
//     validates.
// (3) Otherwise null.
export function pickUrl(url: string | null, text: string | null): string | null {
  if (url && isValidUrl(url)) return url;
  if (text) {
    const match = text.match(/https?:\/\/\S+/);
    if (match) {
      const stripped = stripTrailingPunctuation(match[0]);
      if (isValidUrl(stripped)) return stripped;
    }
  }
  return null;
}

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

// Trims punctuation a sentence tends to glue onto a trailing URL ("...check it out!" or a
// link in parens) so the URL parse above isn't tripped up by a stray character that was never
// part of the link.
function stripTrailingPunctuation(value: string): string {
  return value.replace(/[.,;:!?)\]}'"]+$/, "");
}
