# Research: importing places into savor from a shared social link (Instagram + TikTok)

**Status:** research / not yet scoped for build
**Date:** 2026-07-23 (supersedes the Instagram-only draft of 2026-07-21)
**Goal:** when the user shares an Instagram or TikTok post/reel/video (a restaurant, a
"places to try" reel, a food account's recommendation) to savor, savor should either
**auto-add the place** or **deep-link into the add-place flow prefilled** with whatever it
can extract (name, city, coordinates).

This doc is the reality check before any code. Two headline findings drive everything:

> **1. No official API — Instagram *or* TikTok — returns the location (venue name or
> coordinates) of an arbitrary post someone else made and shared to you.** Every
> location-bearing or full-metadata endpoint is scoped to accounts *you own or manage*.
>
> **2. Logging in (OAuth) does NOT change that.** OAuth on either platform is "me and
> mine" — it unlocks *your own* account's media, not the influencer's reel you were sent.
> So a login flow adds real cost (app + review) and does **not** unlock this feature.

Everything below is about getting as close to the goal as is actually possible, within each
platform's terms, without building something that silently breaks.

---

## 0. TL;DR (read this first)

| Question | Instagram | TikTok |
|---|---|---|
| Can an API return a *shared* post's location/coords? | ❌ No | ❌ No |
| Does OAuth login help for *this* feature? | ❌ No ("me and mine" only; personal accts can't use the API at all) | ❌ No (Display API = your own videos only) |
| Public metadata endpoint, no auth? | oEmbed — but **no caption**, **no location** (author + thumbnail only) | **oEmbed — includes the caption** in `title` (no location) ✅ |
| Best terms-clean signal from a shared link | The URL itself (+ any OS-provided share text) | The URL **+ the caption text via public oEmbed** |
| What the user has to do | Type/paste the venue name | Often nothing — parse the caption automatically |

**Recommended build (both platforms, no login):** register savor as a **Web Share Target**
so a shared link opens the existing add-place flow prefilled; store the link as `sourceUrl`;
parse whatever text we have for a venue name; reuse savor's existing Nominatim lookup + repo
write path to finish. **TikTok gets auto-parse for free via oEmbed; Instagram needs the user
to type the name.** Do **not** build OAuth for either — it doesn't unlock shared posts.

**Architecture:** build the two platforms as **separate integration adapters** behind **one
shared interface** — the `/import` route, `PlaceForm`, and every UI component talk to the
normalized shape, never to a platform SDK (§4.5).

---

## 1. What the user actually shares

When you tap **Share → savor** (or **Copy link**), the payload that leaves the app is
essentially just a **permalink URL**:

- Instagram: `.../p/{shortcode}/` (post), `.../reel/{shortcode}/` (reel), `.../{username}/`
  (profile), or an `instagram.com/share/...` wrapper that redirects.
- TikTok: `https://www.tiktok.com/@{user}/video/{id}`, or a short `https://vm.tiktok.com/{id}`
  / `https://vt.tiktok.com/{id}` link that redirects to the full URL.

The OS share sheet *may* also attach `title`/`text`, but assume the reliable payload is **the
URL**. The caption and the "📍 location tag" shown in-app are **not** part of the shared
payload — you have to go get the caption separately (and only TikTok lets you, via oEmbed).

This drives the design: savor receives a URL, then *learns what it can from that URL*.

---

## 2. On "logging into the API" — why OAuth doesn't unlock this

This deserves its own section because it's the most tempting wrong turn.

### Instagram Login / Graph API
- The Graph API is **"me and mine."** OAuth authenticates the savor user's **own**
  Business/Creator account and returns **their own** media. Reading a *third-party* creator's
  post requires **that creator** to individually authorize savor's app — which will never
  happen for a random shared reel.
- **Personal Instagram accounts can't use the API at all** since the **Basic Display API
  reached end-of-life on 2024-12-04.** Only Business/Creator accounts can connect.
- Third-party public data is explicitly *not* covered by the official API — that's why the
  ecosystem is full of (terms-violating) scraping services. We're not going there (§5).
- **App Review:** anything beyond your own account needs **Advanced Access** + full Meta App
  Review. High cost, and still doesn't cover arbitrary shared posts.

### TikTok Login Kit / Display API
- Same shape: the **Display API only returns data for the user who authenticated** with your
  app (`/v2/video/list/`, `/v2/video/query/`). You **cannot** fetch an arbitrary creator's
  video this way.
- The **Research API** (which *can* query public videos by keyword/hashtag) is now **restricted
  to verified academic / public-interest institutions** — commercial apps are pushed to
  licensed data providers. Not available to savor.

**Conclusion:** an OAuth login on either platform would only ever let a savor user import
**their own** posts — a marginal use case that isn't "someone shared me a reel about a place."
Logging in is *permitted*, but it's the **wrong tool** for this feature and adds an app +
review burden for no payoff. **Don't build it (for this).**

> If we ever want "import the places from *my own* saved/collections," that's the *only*
> scenario where login is the right call — and it's a separate feature with its own doc.

---

## 3. The public, no-auth metadata endpoints (oEmbed) — the real difference

### 3.1 Instagram oEmbed (`GET .../instagram_oembed`)
Pass the permalink + an **App Access Token**; get back an embed payload:

| Field | Returned? |
|---|---|
| `author_name` (@username), `author_url` | ✅ |
| `html` (embed), `thumbnail_url`, dimensions | ✅ |
| **caption text** | ❌ |
| **location / venue / lat / lng** | ❌ |

Useful only for **attribution + a thumbnail**. Zero location signal. Also requires a Meta app
with the **oEmbed Read** feature (App Review) — high setup, low payoff. Treat as optional
polish, not a data source.

### 3.2 TikTok oEmbed (`GET https://www.tiktok.com/oembed?url=...`)  ✅ the useful one
**Public, no token, no app review.** Returns:

| Field | Returned? |
|---|---|
| `title` — **the video's caption/description** (venue names, `#hashtags`, `📍` lines live here) | ✅ |
| `author_name`, `author_url` | ✅ |
| `thumbnail_url`, dimensions, `html` (embed) | ✅ |
| **explicit location / lat / lng** | ❌ |

The `title` = caption is the whole game: it's exactly the text our Tier-1 parser (§4) wants,
and we get it with a single unauthenticated GET. A shared TikTok can often be resolved to a
venue-name guess **with no user typing at all.**

> **Proxy note:** call TikTok oEmbed from a small **Node route** mirroring
> `app/api/lookup/route.ts` (server-side fetch, cache with `next: { revalidate }`, map down to
> a narrow shape, then zod-validate). Don't call it from the browser — keep the outbound-fetch
> policy in one place, same as the Nominatim proxy.

---

## 4. What we build: platform-agnostic "shared link → place", three tiers

The location isn't fetchable, so value comes from **the link + whatever text we have + the
user**, with savor doing the tedious parts. Tiers are shared across both platforms; the only
difference is **how much text we start with** (TikTok: caption via oEmbed; Instagram: only OS
share text, often nothing).

### Tier 0 — "Share to savor" opens the prefilled add-place sheet  ✅ ship first
Web Share Target (§6) launches savor at `/import` on a share. That route:
1. Captures the URL (+ any `text`/`title`).
2. Detects platform (Instagram vs TikTok vs other) from the URL.
3. Stores the URL as the place's **`sourceUrl`** (additive field — §7).
4. Opens the existing `PlaceForm`, seeding the "Look up" box with any text we have.
5. From there it's the **existing** Nominatim flow (`/api/lookup` → `searchPlaces`) → user
   picks the match → save. No new geocoding.

Low-risk, terms-clean, no platform app, works today. **The 80/20 for both platforms.**

### Tier 1 — resolve caption/text → venue-name guess → auto-run the lookup
For TikTok, first fetch the caption via **oEmbed** (§3.2); for Instagram, use whatever OS text
came through. Then a lightweight, framework-free extractor in `lib/`:
- pull `@handles` and `#hashtags` as candidate signals (a venue's own handle is often the best
  geocode query);
- catch `📍`-lines and "at {Name}" / "{Name} in {City}" patterns;
- feed the best candidate into `searchPlaces()`; one strong hit → prefill + confirm; several →
  picker; none → fall back to Tier 0 manual entry.

Belongs in `lib/` with a Vitest suite (mirrors `lib/lookup.ts`). No network beyond the geocode
call we already make + the TikTok oEmbed proxy.

### Tier 2 — oEmbed attribution + thumbnail (polish)
Show a preview card ("From @account", thumbnail) and store attribution. **TikTok:** free via
the same oEmbed call. **Instagram:** costs a Meta app + App Review — defer. Never a location
source; both oEmbeds lack location.

**Recommendation:** Tier 0 for both platforms → Tier 1 for TikTok (caption makes it shine) →
Tier 1 for Instagram (thinner, user usually types) → Tier 2 optional. Prefer **prefill + one
confirm** over silent auto-add: geocoding a guessed name is too error-prone to write
unattended.

---

## 4.5 Architecture: separate integrations, one shared interface

Per the design call — **build each platform as its own integration adapter, but have every
front-end component depend on a single normalized interface, never on a platform.** The
platforms genuinely differ (TikTok = public oEmbed with caption; Instagram = URL-only, no
caption, optional token'd oEmbed), so their *adapters* differ — but that difference must stop
at a seam and never leak into the UI. This is the same discipline as savor's existing
`lib/db.ts`/`lib/repo.ts` storage seam, applied to link-import.

**The shared shape the UI sees (proposed `lib/social/types.ts`):**
```ts
export type SocialPlatform = "instagram" | "tiktok";

// What ANY adapter returns. The UI (/import, PlaceForm) only ever sees this.
export interface SharedLink {
  platform: SocialPlatform;
  url: string;                 // canonical permalink → becomes Place.sourceUrl
  authorName?: string;         // "@account", if known (oEmbed)
  thumbnailUrl?: string;       // preview image, if known (oEmbed)
  captionText?: string;        // raw caption/description IF the adapter can get it (TikTok: yes)
  nameGuess?: string;          // best venue-name candidate the parser extracted, if any
}

// Each platform implements this; nothing else about the platform escapes the adapter.
export interface SocialAdapter {
  readonly platform: SocialPlatform;
  matches(url: string): boolean;              // URL classification
  canonicalize(url: string): Promise<string>; // resolve vm./vt. short links, strip tracking
  hydrate(url: string): Promise<SharedLink>;  // fetch what it can (oEmbed etc.), run parser
}
```

**Layering:**
```
app/import/page.tsx  ──▶  resolveSharedLink(url)  ──▶  SharedLink  ──▶  PlaceForm (seeded)
                              │ picks the adapter                         │
                              ▼                                           ▼
                 [ instagramAdapter ]  [ tiktokAdapter ]        /api/lookup → searchPlaces
                     (URL only)          (public oEmbed)          (existing, unchanged)
```
- `lib/social/index.ts` exposes one `resolveSharedLink(url): Promise<SharedLink>` that finds
  the adapter whose `matches()` is true and delegates. **This is the only thing `/import` and
  the UI import.**
- `lib/social/instagram.ts` and `lib/social/tiktok.ts` are the separate integrations. TikTok's
  `hydrate` calls the oEmbed proxy and fills `captionText`/`nameGuess`; Instagram's returns
  `captionText: undefined` and leans on OS share text. Adding YouTube/Maps later = a third
  adapter, **zero UI change.**
- The shared text parser (§4/Tier 1) is one `lib/social/parse.ts` both adapters call — the
  *parsing* is common; only the *text acquisition* differs per platform.
- **`Place` stays platform-agnostic:** it records `sourceUrl` + an optional
  `sourcePlatform` enum (§7). The DB/repo never learns what an "oEmbed" is.

Net: the platform difference lives entirely in `lib/social/{instagram,tiktok}.ts`. Everything
above the seam — `/import`, `PlaceForm`, preview card, the write path — is written once.

---

## 5. Scraping (the caption/location out of the page HTML) — explicitly rejected

For both platforms the caption (and sometimes a location tag) is embedded in server-rendered
JSON, and scraping libraries exist. **We do not build on this:**
- **Violates both platforms' Terms of Use**; both actively rate-limit/block it.
- **Extremely brittle** — the JSON shape changes without notice and breaks silently.
- Often requires login; logged-out scraping returns little or gets challenged.
- It would turn savor's proxy into a scraping laundromat and get the proxy IP banned.

TikTok oEmbed gives us the caption **legitimately** (§3.2), which removes most of the
temptation. Listed here so the decision to avoid scraping is on the record.

---

## 6. Delivery mechanism: Web Share Target API (PWA)

The load-bearing piece — how a shared link reaches savor at all.

- Only an **installed** PWA can be a share target; the OS reads the manifest `share_target`
  and lists savor in the system share sheet.

**Manifest addition (`public/manifest.webmanifest`):**
```jsonc
{
  // …existing name/icons/etc…
  "share_target": {
    "action": "/import",
    "method": "GET",
    "params": { "title": "title", "text": "text", "url": "url" }
  }
}
```
GET is right: we receive a link, not a file, and it stays a plain navigable
`/import?url=…&text=…`. (POST + `multipart/form-data` only if we ever accept a shared
*screenshot* image — not needed for v1.)

**New `/import` route (`app/import/page.tsx`):** read `url`/`text`/`title`; call
`resolveSharedLink(url)` (§4.5) → `SharedLink`; open `PlaceForm` with `sourceUrl` set and the
lookup box seeded from `nameGuess`/text. Reuse the existing `savor:add-place` dispatch so
`/import` opens the *same* form host — don't invent a second form.

**Platform reality (set expectations):**
- **Android / Chrome / Edge:** Web Share Target works. Shipping this is worthwhile.
- **iOS / Safari:** iOS does **not** support `share_target` — an installed iOS PWA won't
  appear in the share sheet. iOS fallbacks: **Copy link → open savor → paste**, or an iOS
  Shortcut. Since savor is mobile-first, design the **paste-a-link** path regardless so iPhone
  isn't a dead end. (The paste path calls the *same* `resolveSharedLink`, so iOS and Android
  share all logic below the seam.)

---

## 7. Data-model impact (respect the storage rules)

- Add optional `sourceUrl?: string` and `sourcePlatform?: "instagram" | "tiktok"` to `Place`
  in `lib/types.ts`, and to `placeFields` in `lib/repo.ts` (keep the type↔zod pair in sync —
  the exact drift CLAUDE.md's Fast-follows warns about).
- **Additive, non-destructive.** Plain new optional fields that aren't indexed need **no**
  `SCHEMA_VERSION` bump and **no** new `db.version(N)` block. Only add an index (→ new version
  block, never edit `version(1)`) if we ever query by it — we won't.
- **Backup gotcha:** per CLAUDE.md, `parseBackup` demands exact `schemaVersion` equality. If
  we add these **without** an index (no version bump), we avoid the backup-forward-migration
  blocker entirely — **preferred.** If a bump ever becomes necessary, the backup migration
  story must land *first*.
- Nothing here touches `meta`/`criteria` seeding — "reset app" invariants unaffected.

---

## 8. End-to-end flow (recommended v1)

```
Instagram post/reel  ─┐
TikTok video         ─┤  Share → savor (Android)   ── or ──   Copy link → paste (iOS)
                      ▼
/import?url=…&text=…                         ← Web Share Target (manifest share_target)
      │
      ▼
resolveSharedLink(url)  → picks instagram | tiktok adapter → SharedLink   ← §4.5 seam
      │   (TikTok adapter: oEmbed → captionText → parse → nameGuess)
      │   (Instagram adapter: OS text → parse → nameGuess)
      ▼
PlaceForm (existing add-place sheet), prefilled + lookup box seeded from nameGuess
      ▼
/api/lookup → Nominatim → searchPlaces()     ← EXISTING geocode path, unchanged
      ▼
user confirms match (name / address / city / lat / lng)
      ▼
repo.createPlace({ …, status: "want_to_try", sourceUrl, sourcePlatform })   ← existing write path + fields
```

New surface area: the manifest entry, `/import`, the `lib/social/` adapters (incl. a TikTok
oEmbed proxy route + shared parser), and 1–2 optional `Place` fields. **Geocoding, the form,
and the write path are all reused** — exactly what the `lib/db.ts` + `lib/repo.ts` seam was
built to allow.

---

## 9. Open questions to resolve before building

1. **Auto-add vs. confirm.** Recommendation: *confirm* (prefilled sheet). Ever want true
   one-tap auto-add for a high-confidence single TikTok-caption geocode hit?
2. **iOS story.** Android-only share-target + iOS paste-link fallback acceptable for v1, or
   invest in an iOS Shortcut recipe?
3. **Instagram oEmbed (Tier 2).** Worth a Meta app + App Review just for author + thumbnail,
   given it has no caption/location? (TikTok oEmbed is free, so this only affects the IG side.)
4. **Parser scope for v1.** Pass-through only, or ship the `@handle` / `📍` / "at X"
   heuristics? Suggest: pass-through first, add heuristics behind tests once we see real
   shares — TikTok captions will exercise them most.
5. **Vague captions** ("BEST tacos in CDMX 🔥"). Prefer an `@handle`; else make the user type
   it. Don't fabricate coordinates from a city name alone.

---

## Sources

- [Instagram oEmbed — Meta for Developers](https://developers.facebook.com/docs/instagram-platform/oembed/)
- [IG Media reference — Meta for Developers](https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/)
- [Instagram API Integration Guide 2026 (Phyllo)](https://www.getphyllo.com/post/instagram-api-integration-101-for-developers-of-the-creator-economy)
- [Instagram API in 2026, every option explained (Zernio)](https://zernio.com/blog/instagram-api)
- [Instagram Official APIs — reference gist (Apr 2026)](https://gist.github.com/jameschapman2c/65eff9f54a2d350b17a6ce5127b9fe42)
- [TikTok Embed Videos / oEmbed — TikTok for Developers](https://developers.tiktok.com/doc/embed-videos/)
- [Overview of the TikTok Display API](https://developers.tiktok.com/doc/display-api-overview)
- [TikTok Research API — Get Started](https://developers.tiktok.com/doc/research-api-get-started)
- [TikTok API Integration Guide 2026 (Phyllo)](https://www.getphyllo.com/post/tiktok-api-integration-guide-2026-setup-endpoints-common-pitfalls)
- [`share_target` — Web app manifest, MDN](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target)
- [Receiving shared data with the Web Share Target API — Chrome for Developers](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target)
- [Web Share Target API — W3C draft](https://w3c.github.io/web-share-target/)
