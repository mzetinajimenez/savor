# savor

A personal tasting ledger for the places you eat. **savor** is a mobile-first
PWA for tracking restaurants and food experiences: the places you've been, a
want-to-try list, and rankings you define with your own weighted criteria — plus
a journal of what you actually ate.

Your data lives **on your device**, in the browser. There is no account, no
server database, and nothing to sign up for.

**Live:** https://savor-mauve.vercel.app

## Features

- **Places** — capture somewhere you've been or want to try, with cuisine, city,
  address, and free-form notes. Optional OpenStreetMap lookup pre-fills the name
  and location; manual entry always works and is the fallback when lookup is
  unavailable.
- **Ratings** — score a place 1–5 on each of your criteria (Cost, Food quality,
  Service, Ambiance by default). Criteria are yours to rename, add, remove, and
  reorder in Settings.
- **Lists (categories) & rankings** — group places into lists ("Best tacos in
  town", "Date-night spots") and give each list its own **per-category weights**
  over the shared criteria. savor derives a weighted composite score per place
  and ranks the "been" places within each list, with competition ranking for
  ties.
- **Journal** — log visits with a date, dishes, and notes; browse them per place
  or across everything.
- **Backup & restore** — export your whole dataset to a JSON file and import it
  back on another device or after a browser wipe (see below).
- **Installable PWA** — add to home screen for a standalone, app-like experience
  with safe-area-aware chrome and offline-friendly local data.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19**
- **TypeScript** (`strict`), path alias `@/*` → repo root
- **Tailwind CSS v4** — the "Cellar" theme (wine-plum / ember / gold on clay
  parchment); design tokens live in `app/globals.css`
- **Dexie** (IndexedDB) + **dexie-react-hooks** (`liveQuery`) — the entire state
  layer; no context providers, no external state library
- **zod** — validation on the single write path
- **Vitest** + **fake-indexeddb** — unit tests for the data/ranking layers
- Deployed on **Vercel**

## Local development

```bash
npm install
npm run dev      # start the dev server at http://localhost:3000
```

Other scripts:

```bash
npm test          # run the Vitest suite (121 tests)
npm run lint      # eslint
npm run build     # production build
node scripts/generate-icons.mjs   # regenerate the PWA icons (no deps)
```

## Deploy

The app is a standard Next.js project deployed on **Vercel** (personal scope).

- **Production:** https://savor-mauve.vercel.app
- The repository is connected to the Vercel project, so pushes to `main` deploy
  automatically. You can also deploy from the CLI:

  ```bash
  vercel deploy          # preview deployment
  vercel deploy --prod   # promote to production
  ```

There are no environment variables or backing services to configure — the
`/api/lookup` route proxies OpenStreetMap's public Nominatim API and needs no
key.

## Backup & restore

Because your data is stored **locally in the browser**, moving to a new device or
recovering from a cleared browser means moving the data yourself:

1. Open **Settings → Backup**.
2. **Export** downloads a single `savor-backup-*.json` file containing every
   place, list, criterion, and visit (including tombstoned/deleted rows, so
   history is preserved).
3. On the other device (or after a wipe), open **Settings → Backup → Import** and
   choose that file. Import **replaces** the current dataset with the file's
   contents, so confirm before importing over existing data.

Keep a backup file somewhere durable (cloud drive, email to yourself) if the data
matters to you.

## Device-local data (and the future)

savor is intentionally **device-local**: all data is written to IndexedDB on the
device that created it, and the app requests persistent storage so the browser is
less likely to evict it. This keeps the app private, fast, and dependency-free —
but it means:

- Data does **not** sync between devices automatically. Use Backup/Restore to
  move it.
- Clearing site data / uninstalling the browser removes your data. Export first.

Every entity already carries a sync-ready shape (`id`, `createdAt`, `updatedAt`,
`deletedAt` tombstones), and all reads and writes funnel through a single storage
seam (`lib/db.ts` + `lib/repo.ts`). That's the deliberate hook for a **future
cloud-sync** backend: it can be added behind the repo layer without touching any
UI code. See `CLAUDE.md` for the architecture and the persistence seam.
