# Research: importing places into savor from a shared Instagram link

**Status:** research / not yet scoped for build
**Date:** 2026-07-21
**Goal:** when the user shares an Instagram post/reel (a restaurant, a "places to try"
reel, a food account's recommendation) to savor, savor should either **auto-add the
place** or **deep-link into the add-place flow prefilled** with whatever it can extract
(name, city, coordinates).

This doc is the reality check before any code. The headline finding is uncomfortable but
important:

> **There is no official Instagram API that returns the location (venue name or
> coordinates) of an arbitrary post that someone else made and shared to you.** Every
> location-bearing endpoint Meta offers is scoped to accounts *you own or manage*. So the
> "read the pin off the post" mental model does not exist as a supported capability.

Everything below is about getting as close to that goal as is actually possible, honestly,
without violating Meta's terms or building something that silently breaks.

---

## 1. What the user actually shares

When you tap **Share → savor** (or **Copy link**) on an Instagram post/reel, the payload
that leaves Instagram is essentially just a **permalink URL**, one of:

- `https://www.instagram.com/p/{shortcode}/` — feed post
- `https://www.instagram.com/reel/{shortcode}/` — reel
- `https://www.instagram.com/{username}/` — a profile
- Occasionally a `https://instagram.com/share/...` wrapper that redirects to one of the above.

The OS share sheet *may* also attach a `title` and/or `text` field, but for Instagram in
practice **you should assume you get the URL and nothing more** — no caption, no location,
no coordinates ride along. The caption and the "📍 location tag" you see in the app are
**not** part of the shared payload.

This single fact drives the whole design: savor receives a URL, and then has to *decide what
it can learn from that URL*.

---

## 2. The official Instagram/Meta APIs, and what each will and won't give you

### 2.1 Instagram oEmbed (`GET .../instagram_oembed`)

The closest thing to "give me info about this public post URL". You pass the permalink and an
**App Access Token**; you get back an embed payload:

| Field | Returned? |
|---|---|
| `author_name` (the @username) | ✅ |
| `author_url` | ✅ |
| `html` (embeddable `<blockquote>`/iframe) | ✅ |
| `thumbnail_url`, `thumbnail_width/height` | ✅ (for some media) |
| `provider_name`, `type`, `version`, `width` | ✅ |
| **caption text** | ❌ |
| **location / venue name** | ❌ |
| **latitude / longitude** | ❌ |

**Verdict:** oEmbed is useful only for *attribution and a thumbnail* — "this came from
@some_food_account" and a preview image. It gives you **zero location signal**. It also now
requires the **oEmbed Read** feature, which means registering a Meta app and passing **App
Review** before it works in production. High setup cost, low payoff for our goal.

### 2.2 Instagram Graph API — media endpoints (`GET /{ig-media-id}?fields=...`)

This is the "real" data API (caption, media_url, timestamp, permalink, children…). Two
blockers make it a dead end for *this* feature:

1. **Ownership scope.** You can only read media belonging to **Instagram Business/Creator
   accounts that your app is authorized for** (your own, or a client's who logged in and
   granted permission). You **cannot** point it at an arbitrary creator's reel that a user
   pasted in. A food influencer's post is not yours to query.
2. **No general location field.** Even for owned media, a reliable venue/coordinates field
   for arbitrary posts is not exposed; location tagging data is not part of the standard
   media read fields.

**Verdict:** irrelevant unless savor's user is importing *their own* posts from *their own*
business account — not the use case ("someone shared me a reel about a place").

### 2.3 Everything else (Basic Display API, hashtag search, location search)

- **Instagram Basic Display API** — deprecated/retired; do not build on it.
- **Hashtag / location-search endpoints** — scoped, rate-limited, and again not a
  "resolve this URL to a place" tool.

### 2.4 Unofficial scraping (fetching the post HTML / private JSON)

Technically the caption and sometimes a location tag are embedded in the page's server-
rendered JSON, and libraries exist to scrape it. **We should not build on this:**

- It **violates Instagram's Terms of Use** and Meta actively rate-limits / blocks it.
- It's **extremely brittle** — the JSON shape changes without notice and breaks silently.
- Many posts require login; logged-out scraping returns little or gets challenged.
- It would put savor's `/api/lookup`-style proxy in the position of laundering scraped
  data, which is exactly the kind of thing that gets a proxy IP banned.

It's listed here only so the decision to avoid it is explicit and on the record.

---

## 3. So what *can* we actually build? Three honest tiers

Given that the location is not fetchable, the value has to come from **the user + the text**,
with savor doing the tedious parts (receiving the share, guessing a name, geocoding it,
prefilling the form). Three tiers, increasing in ambition:

### Tier 0 — "Share to savor" just opens the prefilled add-place sheet  ✅ recommended first step

The Web Share Target API (Section 4) lets an **installed** savor PWA appear in the OS share
sheet. Sharing an Instagram link launches savor at a route that:

1. Captures the Instagram URL (+ any `text`/`title` the OS included).
2. Stores the URL as the place's **source link** (new optional `sourceUrl` field — additive
   schema migration, see Section 6).
3. Opens the existing `PlaceForm` add-place sheet, **pre-seeding the "Look up" box** with any
   text the OS passed, and letting the user type/paste the venue name.
4. From there it's the *existing* Nominatim flow (`/api/lookup` → `searchPlaces`) — the user
   picks the match, gets name/address/city/lat/lng, and saves. Nothing new on the geocode
   side.

This is low-risk, fully within terms, needs no Meta app, and delivers the "share → half a tap
→ it's in my want-to-try list with the IG link attached" experience. **This is the 80/20.**

### Tier 1 — parse a venue name out of shared text, auto-run the lookup

If the share (or a caption the user pastes) contains text, run a lightweight extractor over
it before geocoding:

- Pull `@handles` and `#hashtags` out as candidate signals (a venue's own handle is often the
  best geocode query — e.g. `@tacoseloax` → "tacos el oax").
- Look for `📍`-prefixed lines and "at {Name}" / "{Name} in {City}" patterns.
- Feed the best candidate string straight into `searchPlaces()`. If exactly one strong
  Nominatim hit, prefill it and show a confirm; if several, show the picker; if none, fall
  back to Tier 0 manual entry.

All of this is **framework-free string logic** that belongs in `lib/` with a Vitest suite
(mirrors how `lib/lookup.ts` is structured). No network beyond the geocode call we already
make.

### Tier 2 — oEmbed for attribution + thumbnail (optional polish)

Stand up a small Node proxy route (mirror of `app/api/lookup/route.ts`) that calls Instagram
**oEmbed** with an App Access Token to fetch `author_name` + `thumbnail_url`. Use it only to
**show a nice preview card** ("From @account") on the import screen and to store attribution
— *never* as a location source, because it has none. Costs a Meta app + App Review; defer
until Tiers 0/1 prove the flow is worth it.

**Recommendation:** build **Tier 0**, add **Tier 1** parsing incrementally, treat **Tier 2**
as optional. Auto-add with *zero* confirmation is discouraged — geocoding a guessed name is
too error-prone to write to the DB unattended. "Prefilled + one confirm" is the right default.

---

## 4. The delivery mechanism: Web Share Target API (PWA)

This is how a shared link reaches savor at all. It is the load-bearing piece.

### How it works
- Only an **installed** PWA can be a share target. On registration the OS reads the manifest's
  `share_target` member and lists savor in the system share sheet.
- Sharing fires an HTTP request to a route you specify, with the shared fields mapped to query
  params (GET) or form fields (POST).

### Manifest addition (`public/manifest.webmanifest`)
```jsonc
{
  // …existing name/icons/etc…
  "share_target": {
    "action": "/import",          // savor route that handles the share
    "method": "GET",
    "params": {
      "title": "title",
      "text":  "text",
      "url":   "url"              // the Instagram permalink lands here
    }
  }
}
```
A GET target is right here: we're receiving a link, not uploading a file, and GET keeps it a
plain navigable URL (`/import?url=…&text=…`). Use POST + `multipart/form-data` only if we ever
need to accept shared *images* (e.g. a screenshot of a reel) — not needed for v1.

### The `/import` route (new `app/import/page.tsx`)
1. Read `url` / `text` / `title` from `searchParams`.
2. Validate it's an Instagram permalink (regex on the shortcode forms in Section 1); if not,
   still allow it as a generic source link.
3. Hand off to the add-place flow: open `PlaceForm` with `sourceUrl` set and the lookup box
   seeded from parsed text (Tier 1). Because savor already dispatches `savor:add-place` to
   open the form host, `/import` can reuse that path rather than inventing a second form.

### Platform reality (set expectations)
- **Android / Chrome / Edge:** Web Share Target is well supported. This will work.
- **iOS / Safari:** iOS does **not** support `share_target`. An installed iOS PWA will **not**
  appear in the share sheet. iOS users' fallbacks: **Copy link → open savor → paste**, or a
  Shortcut. Given savor is "mobile-first PWA," we must design the paste-a-link path anyway so
  iOS isn't a dead end. (A share-target that only works on Android is still worth shipping —
  just don't promise it on iPhone.)

---

## 5. End-to-end flow (recommended v1)

```
Instagram post/reel
      │  user taps Share → savor   (Android)     ── or ──   Copy link → paste (iOS)
      ▼
/import?url=…&text=…                 ← Web Share Target (manifest share_target)
      │
      ├─ validate & keep the IG permalink  → sourceUrl
      ├─ (Tier 1) parse text → best venue-name guess
      ▼
PlaceForm (existing add-place sheet), prefilled
      │  "Look up" box seeded with the guess
      ▼
/api/lookup  →  Nominatim  →  searchPlaces()      ← EXISTING geocode path, unchanged
      │
      ▼
user confirms match (name / address / city / lat / lng)
      ▼
repo.createPlace({ …, status: "want_to_try", sourceUrl })   ← existing write path + 1 field
```

The only genuinely new surface area is: the manifest entry, the `/import` route, the text
parser (`lib/`), and one optional `sourceUrl` field. **The geocoding, the form, and the write
path are all reused as-is** — which is exactly what the `lib/db.ts` + `lib/repo.ts` seam was
built to allow.

---

## 6. Data-model impact (respect the storage rules)

To attach the originating Instagram link to a place:

- Add an **optional** `sourceUrl?: string` to `Place` in `lib/types.ts`, and to `placeFields`
  in `lib/repo.ts` (keep the type↔zod pair in sync — this is exactly the drift the CLAUDE.md
  "Fast-follows" note warns about).
- This is an **additive, non-destructive** change. If it needs a Dexie index (it probably does
  not — we don't query by it), that requires a **new `db.version(N)` block** and a
  `SCHEMA_VERSION` bump — *never* editing `version(1)`. A plain new optional field that isn't
  indexed needs no version bump at all.
- **Backup gotcha:** per the CLAUDE.md fast-follow, `parseBackup` currently demands exact
  `schemaVersion` equality. If adding `sourceUrl` forces a `SCHEMA_VERSION` bump, the
  backup-import forward-migration story must land **first**, or every existing v1 export
  becomes unimportable. If we can add `sourceUrl` *without* an index (no version bump), we
  sidestep this entirely — preferred.

Nothing here touches `meta`/`criteria` seeding, so the "reset app" invariants are unaffected.

---

## 7. Open questions to resolve before building

1. **Auto-add vs. confirm.** Recommendation is *confirm* (prefilled sheet). Do we ever want a
   true one-tap auto-add for high-confidence single geocode hits? (Risk: wrong pin written
   silently.)
2. **iOS story.** Is Android-only share-target acceptable for v1, with iOS on a paste-link
   fallback? Or do we invest in an iOS Shortcut recipe?
3. **Do we want oEmbed attribution at all** (Tier 2), given it costs a Meta app + App Review
   and yields only author + thumbnail?
4. **Text parsing scope.** How clever should the venue-name extractor be for v1 — just pass
   `text` through, or the `@handle`/`📍`/"at X" heuristics? (Suggest: ship the pass-through,
   add heuristics behind tests once we see real shares.)
5. **What counts as the geocode query** when the caption is vague ("BEST tacos in CDMX 🔥")?
   Probably: prefer an `@handle`, else make the user type it. Don't guess coordinates from a
   city alone.

---

## 8. TL;DR

- ❌ You **cannot** pull an Instagram post's location/coordinates via any official API — not
  oEmbed (no location field), not the Graph API (owned accounts only). Scraping is against
  terms and brittle; don't.
- ✅ The realistic, terms-clean feature is: **register savor as a Web Share Target** so a
  shared Instagram link **opens the existing add-place flow prefilled**, stash the IG link as
  `sourceUrl`, optionally parse the shared text for a venue name, and reuse savor's existing
  Nominatim lookup + repo write path to finish.
- ⚠️ **iOS PWAs can't be share targets** — design a paste-a-link fallback so iPhone users
  aren't stranded.
- 🎯 Smallest valuable build (Tier 0): manifest `share_target` + an `/import` route that opens
  `PlaceForm` prefilled + one optional `sourceUrl` field. Everything else is reuse.

---

## Sources

- [Instagram oEmbed — Meta for Developers](https://developers.facebook.com/docs/instagram-platform/oembed/)
- [IG Media reference — Meta for Developers](https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/)
- [Instagram Graph API developer guide 2026 (Elfsight)](https://elfsight.com/blog/instagram-graph-api-complete-developer-guide-for-2026/)
- [Instagram Official APIs — reference gist (Apr 2026)](https://gist.github.com/jameschapman2c/65eff9f54a2d350b17a6ce5127b9fe42)
- [Instagram API deprecation notes 2026 (SociaVault)](https://sociavault.com/blog/instagram-api-deprecated-alternative-2026)
- [`share_target` — Web app manifest, MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target)
- [Receiving shared data with the Web Share Target API — Chrome for Developers](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target)
- [Share data between apps — MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Share_data_between_apps)
- [Web Share Target API — W3C draft](https://w3c.github.io/web-share-target/)
