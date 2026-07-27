// pickUrl normalizes the two share-target shapes (a dedicated `url` param vs. a free-text `text`
// blob that merely contains a link) into a single validated URL string, or null. Moved here from
// app/import/page.tsx (T7) so it's covered by Vitest — the route only collects lib/**, per
// vitest.config.ts, so a copy left in app/ is untestable by inspection only.

import { describe, expect, it } from "vitest";
import { pickUrl } from "./pickUrl";

describe("pickUrl", () => {
  it("passes through a bare valid url unchanged", () => {
    expect(pickUrl("https://www.instagram.com/reel/abc123/", null)).toBe(
      "https://www.instagram.com/reel/abc123/"
    );
  });

  it("extracts a url embedded in text when url is null", () => {
    const text = "great tacos https://www.tiktok.com/@user/video/123 go now";
    expect(pickUrl(null, text)).toBe("https://www.tiktok.com/@user/video/123");
  });

  it("strips trailing sentence punctuation off a url found in text", () => {
    expect(pickUrl(null, "check this out https://www.tiktok.com/@user/video/123).")).toBe(
      "https://www.tiktok.com/@user/video/123"
    );
  });

  it("strips a trailing exclamation point off a url found in text", () => {
    expect(pickUrl(null, "you have to see this reel https://www.instagram.com/reel/abc!")).toBe(
      "https://www.instagram.com/reel/abc"
    );
  });

  it("falls back to text when url is invalid but text contains a usable url", () => {
    const text = "not a link but https://www.instagram.com/reel/xyz789/ is";
    expect(pickUrl("not-a-url", text)).toBe("https://www.instagram.com/reel/xyz789/");
  });

  it("returns null when neither url nor text yields a usable link", () => {
    expect(pickUrl("not-a-url", "no link in here at all")).toBeNull();
  });

  it("returns null for a plain non-url string with no http(s) link anywhere", () => {
    expect(pickUrl(null, "just some caption text, no link")).toBeNull();
  });

  it("returns null when both url and text are null", () => {
    expect(pickUrl(null, null)).toBeNull();
  });

  // pickUrl only checks that new URL() accepts the string — it does NOT enforce http(s). The
  // http(s)-only restriction lives at the repo layer (lib/repo.ts's placeFields.sourceUrl), not
  // here, so a non-http string that new URL() happens to accept as a bare `url` param passes
  // through unchanged. (The regex path can never surface this: it only ever matches literal
  // "https?://" text, so a javascript:/data: URI embedded in `text` is never extracted at all.)
  it("passes a non-http scheme through unchanged when new URL() accepts it as a bare url param", () => {
    expect(pickUrl("javascript:alert(1)", null)).toBe("javascript:alert(1)");
  });

  it("never extracts a non-http scheme from text (the regex only matches http/https)", () => {
    expect(pickUrl(null, "click this javascript:alert(1) now")).toBeNull();
  });

  // The gotcha this documents: `new URL()` happily parses any "word:" + anything as an
  // opaque-scheme URL (here, protocol "recipe:"), so branch 1 (`url && isValidUrl(url)`) accepts
  // a plain caption as a "valid url" and returns it whole, before the regex-extraction branch
  // (which would have found the real link) ever runs. This is pickUrl's existing, correct-per-
  // its-own-contract behavior when the same opaque-scheme-parseable string is passed as BOTH
  // `url` and `text` — it is exactly why call sites must never do `pickUrl(x, x)` for free-text
  // input (see app/components/places/PlaceForm.tsx and app/import/page.tsx, which both now pass
  // `pickUrl(null, pasteValue)` instead).
  it("returns the whole caption unchanged when passed as both url and text (the pickUrl(x, x) trap)", () => {
    expect(pickUrl("Recipe: try this spot", "Recipe: try this spot")).toBe(
      "Recipe: try this spot"
    );
  });

  // Confirms the fixed call pattern: passing `null` for `url` (instead of the caption twice)
  // lets the regex-extraction branch do its job regardless of what precedes the link in the
  // caption, even when that prefix itself looks like an opaque scheme ("Recipe:").
  it("extracts the link from a caption whose prefix looks like an opaque scheme, when url is null", () => {
    expect(
      pickUrl(null, "Recipe: best tacos in CDMX https://www.tiktok.com/@u/video/123")
    ).toBe("https://www.tiktok.com/@u/video/123");
  });
});
