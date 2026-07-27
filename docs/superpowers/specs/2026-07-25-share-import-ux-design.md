# Share-import UX: entry point, confirmation, source link — Design Spec

**Date:** 2026-07-25
**Status:** Approved pending user review
**Branch:** `feat/share-link-import`

## 1. Problem

The share-link import feature (Android Web Share Target → `/import`, plus an
iOS-oriented paste-box fallback on the same route) shipped with three gaps found by
hands-on testing of this branch:

1. **No discoverable entry point.** `/import` is reachable only via the OS-level
   Android share sheet (`share_target` in the manifest) or by typing the URL by
   hand. Nothing in the app's own UI links to it. iOS Safari doesn't implement the
   Web Share Target spec at all (and won't — it's a platform gap, not something
   this app can route around), so an iOS user — the primary user of this app — has
   no way to reach the paste fallback that exists specifically for them.
2. **No visible confirmation.** When a shared/pasted link resolves, the Add-place
   sheet opens pre-filled with `sourceUrl`/`sourcePlatform` captured silently in the
   background — but nothing on screen shows this happened. For Instagram (always)
   and TikTok (whenever its oEmbed proxy call fails), there's no name guess either,
   so the sheet is pixel-identical to a blank "Add a place" form. Verified via
   direct IndexedDB inspection that the data *is* captured correctly — the gap is
   purely that nothing communicates it.
3. **`sourceUrl` is written but never surfaced.** Once a place is saved, there's no
   way to get back to the original video/post — the field is stored and then never
   rendered anywhere in the UI.

## 2. Scope

### In scope

- An inline "Paste a link" affordance inside the blank Add-place sheet, so the
  paste-fallback flow is reachable without leaving the sheet or knowing a URL.
- A visible "Imported from Instagram/TikTok" indicator in the sheet whenever a
  source link is attached, regardless of which path attached it.
- A "View on Instagram/TikTok" link on the place detail page, and a small source
  indicator on the place list card, both driven by the existing `sourceUrl`/
  `sourcePlatform` fields.

### Explicitly out of scope

- **Instagram caption/geotag name-guessing.** Meta's oEmbed API has required an
  authenticated developer token since 2020 — there's no public keyless way to fetch
  a caption anymore. Scraping the post's public HTML for Open Graph tags is
  unreliable (Instagram actively walls off non-browser requests) and against their
  ToS. Given this app's no-auth/no-backend/tiny-dependency philosophy (see
  CLAUDE.md), adding Meta OAuth or a scraper for this is not worth it. This is a
  platform ceiling, not a gap this spec closes.
- Any change to TikTok's existing name-guess path (`/api/tiktok-oembed` +
  `lib/social/parse.ts`'s `guessVenueName`) — it already works for real videos and
  is untouched by this work.
- Any change to `/import/page.tsx` itself — it remains the real landing page for
  the Android OS share-target launch, exactly as-is.
- Auto-saving a place immediately on resolve. Confirmed with the user: the sheet
  stays a "review and finish, then Save" step for both platforms — no
  per-platform special-casing of save behavior.

## 3. Design

### 3.1 Inline paste entry point (`app/components/places/PlaceForm.tsx`)

When the Add-place sheet is open with no source captured yet (`!form.sourceUrl`),
render a small "Paste a link" toggle above the Name field. Tapping it reveals a
text input + submit button, styled after `/import`'s existing `PasteForm` (same
`type="text"`/`inputMode="url"` reasoning — a caption-embedded link must still be
extractable, so a `type="url"` field's native validation can't be allowed to block
submission).

Submitting calls the same primitives `/import/page.tsx` already uses —
`pickUrl` (`lib/social/pickUrl.ts`) then `resolveSharedLink`
(`lib/social/index.ts`) — both framework-free and already shared, so no
extraction/refactor is needed. On a successful resolve, the handler:

- sets `form.name` to `link.nameGuess ?? ""`,
- sets `form.sourceUrl` / `form.sourcePlatform` from the resolved link (or to the
  bare candidate URL with no platform when `resolveSharedLink` returns `null` —
  same "still hand off the source" contract `/import` already follows),
- triggers `handleLookup()` when a name guess came back, mirroring the existing
  `initial.autoLookup` behavior,
- collapses the inline paste field back down.

On an unresolvable paste (`pickUrl` returns `null`), show the same "That doesn't
look like a link" hint text `/import`'s `PasteForm` uses.

This is purely additive to `PlaceForm.tsx`: no change to `AddPlaceHost`, the
`ADD_PLACE_EVENT` contract, or `/import/page.tsx`.

### 3.2 Visible confirmation (same sheet)

Whenever `form.sourceUrl` is set — whether it arrived via the `/import` prefill
(`initial.sourceUrl`) or via the new inline paste above — render a small line near
the top of the sheet, above the Name field:

- `sourcePlatform === "instagram"` → "Imported from Instagram"
- `sourcePlatform === "tiktok"` → "Imported from TikTok"
- `sourceUrl` set but no `sourcePlatform` (unrecognized platform) → "Source link
  attached"

This is the fix for gap #2: it makes the resolve visible in exactly the cases
where it was previously silent (no name guess), and costs nothing in the cases
where a name guess did land.

### 3.3 Surfacing `sourceUrl` after save

No schema or write-path change — `sourceUrl`/`sourcePlatform` are already on
`Place` (`lib/types.ts`) and already written by `createPlace`. This is read-only
UI surfacing:

- **`app/places/[id]/page.tsx`**: when `place.sourceUrl` is set, render a "View on
  Instagram" / "View on TikTok" link (label from `sourcePlatform`; generic "View
  source" if absent), `target="_blank" rel="noopener noreferrer"`.
- **`app/components/places/PlaceCard.tsx`**: when `place.sourceUrl` is set, render
  a small generic link glyph (a hand-drawn SVG in the existing `PlusGlyph`/
  `StarGlyph` style from `app/components/ui.tsx` — not a platform brand logo, to
  avoid trademark issues and stay consistent with this app's own icon set) next to
  the name, alongside the existing status pill (see current layout at line
  37-48), with an `aria-label` naming the platform (e.g. "Imported from
  Instagram"). Purely an at-a-glance indicator — the card's existing link to
  `/places/[id]` is unchanged; the clickable source link lives only on the detail
  page.

### 3.4 Error handling

No new error states. Inline paste reuses `pickUrl`'s existing null-return contract
(invalid text → hint) and `resolveSharedLink`'s existing degrade-to-URL-only
contract (TikTok oEmbed failure → still hands off the bare source, no name guess).
Both are already covered by `lib/social`'s existing Vitest suite.

### 3.5 Testing

No `lib/` logic changes, so no new Vitest coverage is needed there. This is UI
surface work only (a new sheet section, a new detail-page link, a new card icon);
per this repo's existing convention there's no component-test harness, so
acceptance is manual: drive the sheet's inline paste, the resulting sheet
confirmation line, the detail-page source link, and the card icon in a real
browser before calling this done.

## 4. Open questions

None outstanding — every decision point above was resolved in conversation before
writing this spec.
