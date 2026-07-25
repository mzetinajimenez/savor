"use client";

// /import — the share-target landing page (T7). Two entry points, one flow:
//
//   - Android Web Share Target: the OS opens `/import?url=…&text=…&title=…` (see
//     public/manifest.webmanifest's `share_target`, T6). Some apps (notably Instagram/TikTok's
//     own share sheets) put the link in `url`; others only put it in the free-text `text` field
//     alongside a caption. `pickUrl` normalizes both into a single, validated URL string.
//   - iOS (no Web Share Target support) / anyone landing here with no share params: a minimal
//     paste box that runs the exact same resolve -> emit -> replace path by hand.
//
// Both paths end the same way: `resolveSharedLink` (T4) never throws, so either it recognizes
// the platform (nameGuess may or may not be present) or it doesn't (bare source, still stored) —
// either way we `emitAddPlace` (T5) and `router.replace("/")` so the prefilled sheet — which
// lives in the root layout, not this page — ends up sitting over the Places tab. Emit MUST
// happen before the replace: AddPlaceHost is mounted in app/layout.tsx, which persists across
// the client-side navigation, but the event only reaches a listener that's already attached.
//
// Build note: useSearchParams() makes this route dynamic, and Next.js requires the component
// that calls it to sit inside a <Suspense> boundary or the production build fails outright
// ("useSearchParams() should be wrapped in a suspense boundary"). Hence the split below: the
// default export only renders the Suspense wrapper; ImportInner is the one that actually calls
// the hook.

import { useEffect, useMemo, useRef, useState, Suspense, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resolveSharedLink } from "@/lib/social";
import { emitAddPlace } from "@/app/components/ui";

// Pure + exported so it stays this route's one testable-by-inspection unit even though (per the
// plan) app/ routes aren't under Vitest's jsdom-free collection. Guarantees anything this route
// ever hands to emitAddPlace as `sourceUrl` is a URL `new URL()` already accepted — createPlace
// zod-validates `sourceUrl` as a URL at save, so a bad string here would only surface as a
// rejected save several steps later.
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

export default function ImportPage() {
  return (
    <Suspense fallback={<Importing />}>
      <ImportInner />
    </Suspense>
  );
}

function ImportInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // Strict Mode double-invokes effects in dev; this ref (not state — it must survive without
  // triggering a re-render) makes sure a share-target visit only ever resolves + emits once.
  const ranOnce = useRef(false);

  const sharedUrl = useMemo(
    () => pickUrl(searchParams.get("url"), searchParams.get("text")),
    [searchParams]
  );

  // Known synchronously (searchParams are already populated on the client, no await needed to
  // read them) so a share-target visit renders straight into "Importing…" with no paste-box
  // flash first.
  const [importing, setImporting] = useState(sharedUrl !== null);
  const [pasteValue, setPasteValue] = useState("");
  const [pasteHint, setPasteHint] = useState(false);

  useEffect(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;
    if (!sharedUrl) return; // no usable share param — paste UI stays up, nothing to resolve
    void runImport(sharedUrl);
    // Deliberately not depending on runImport/router (would change identity every render) —
    // this must fire exactly once per mount, gated by ranOnce above, not re-fire on re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedUrl]);

  async function runImport(url: string) {
    setImporting(true);
    const link = await resolveSharedLink(url);
    if (link) {
      emitAddPlace({
        name: link.nameGuess,
        sourceUrl: link.url,
        sourcePlatform: link.platform,
        autoLookup: Boolean(link.nameGuess),
      });
    } else {
      // Valid URL, unrecognized platform — still hand off the source; the sheet opens
      // want_to_try with it stored and the user types the name themselves.
      emitAddPlace({ sourceUrl: url });
    }
    router.replace("/");
  }

  function handlePasteSubmit(e: FormEvent) {
    e.preventDefault();
    const candidate = pickUrl(pasteValue, pasteValue);
    if (!candidate) {
      setPasteHint(true);
      return;
    }
    setPasteHint(false);
    void runImport(candidate);
  }

  if (importing) return <Importing />;

  return (
    <PasteForm
      value={pasteValue}
      onChange={(v) => {
        setPasteValue(v);
        setPasteHint(false);
      }}
      onSubmit={handlePasteSubmit}
      showHint={pasteHint}
    />
  );
}

function Importing() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-center">
      <span
        aria-hidden
        className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-plum"
      />
      <p className="text-[0.95rem] text-ink-soft">Importing…</p>
    </div>
  );
}

function PasteForm({
  value,
  onChange,
  onSubmit,
  showHint,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  showHint: boolean;
}) {
  const canSubmit = value.trim().length > 0;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="w-full max-w-sm text-center">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-ink-soft">
          savor
        </p>
        <h1 className="mt-0.5 font-display text-3xl leading-none text-plum">Import a place</h1>
        <p className="mt-3 text-[0.95rem] leading-relaxed text-ink-soft">
          Paste an Instagram or TikTok link and we&rsquo;ll get it started.
        </p>

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3 text-left">
          <label htmlFor="import-url" className="sr-only">
            Instagram or TikTok link
          </label>
          <input
            id="import-url"
            // type="text" (not "url") on purpose: a shared paste often carries the link inside
            // caption text ("great tacos https://… go now"), which pickUrl extracts — but a
            // type="url" field marks that whole string :invalid and native validation blocks the
            // submit before pickUrl ever runs. inputMode="url" keeps the URL-optimized mobile
            // keyboard; validation is ours (pickUrl → the hint below).
            type="text"
            inputMode="url"
            autoComplete="off"
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Paste an Instagram or TikTok link"
            className="h-12 w-full rounded-xl border border-line bg-surface px-3.5 text-base text-ink placeholder:text-ink-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum"
          />
          {showHint ? (
            <p className="text-sm text-chili">That doesn&rsquo;t look like a link — try pasting the full URL.</p>
          ) : null}
          <button
            type="submit"
            disabled={!canSubmit}
            className="min-h-11 w-full rounded-full bg-ember px-5 py-3 text-[0.95rem] font-semibold text-white shadow-sm transition active:scale-95 active:bg-ember-deep disabled:pointer-events-none disabled:opacity-40"
          >
            Find place
          </button>
        </form>
      </div>
    </div>
  );
}
