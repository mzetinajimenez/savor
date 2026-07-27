// createLookupSession — everything about *when* to search and *which* answer wins, kept
// out of React so it can be tested. This is where issue #7's stale-response bug is fixed:
// the invariant is that only the newest query's results are ever emitted, enforced twice
// over (an AbortController per request, plus a monotonic token checked on resolution, so
// even a response that races past abort() is discarded).
//
// The search function is injected rather than imported so tests can drive it with fake
// timers and hand-resolved promises. lib/lookup.ts's searchPlaces is the production one.

import type { LookupFailureReason, LookupOutcome, LookupResult } from "./lookup";

export const DEFAULT_DEBOUNCE_MS = 250;
export const DEFAULT_MIN_LENGTH = 3;

// Session-scoped and small: it exists so backspacing never refetches, not as a real cache.
const MAX_CACHE_ENTRIES = 50;

export type LookupState =
  | { status: "idle" }
  // `results` carries the *previous* results so the list doesn't blank between keystrokes.
  | { status: "loading"; results: LookupResult[] }
  | { status: "results"; query: string; results: LookupResult[] }
  | { status: "empty"; query: string }
  | { status: "error"; query: string; reason: LookupFailureReason };

export interface LookupSession {
  /** Debounced search. Call from an input's onChange. */
  search(query: string): void;
  /** Immediate search, skipping the debounce — for the share-link prefill on mount. */
  searchNow(query: string): void;
  /** Abort anything pending and close the list. */
  cancel(): void;
  /** Permanent teardown; emits nothing afterwards. */
  destroy(): void;
}

export function createLookupSession(opts: {
  onState: (state: LookupState) => void;
  search: (q: string, signal: AbortSignal) => Promise<LookupOutcome>;
  debounceMs?: number;
  minLength?: number;
}): LookupSession {
  const debounceMs = opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const minLength = opts.minLength ?? DEFAULT_MIN_LENGTH;

  const cache = new Map<string, LookupResult[]>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  let token = 0;
  let lastResults: LookupResult[] = [];
  let destroyed = false;

  function emit(state: LookupState): void {
    if (state.status === "results") lastResults = state.results;
    else if (state.status !== "loading") lastResults = [];
    opts.onState(state);
  }

  // Cancels the pending debounce and aborts any in-flight request. Bumping the token is
  // what makes a response that resolves anyway (racing past abort) get dropped.
  function stop(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (controller) {
      controller.abort();
      controller = null;
    }
    token += 1;
  }

  function cachePut(key: string, results: LookupResult[]): void {
    // Overwriting an existing key doesn't grow the map, so only evict when this write
    // would actually add a new entry — otherwise a hot repeated query could needlessly
    // evict the oldest entry on every re-search.
    if (!cache.has(key) && cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
    cache.set(key, results);
  }

  async function run(query: string, myToken: number): Promise<void> {
    const ctrl = new AbortController();
    controller = ctrl;

    let outcome: LookupOutcome;
    try {
      outcome = await opts.search(query, ctrl.signal);
    } catch {
      // An aborted (or thrown) search has no answer worth showing. Superseded requests
      // land here and are dropped silently rather than rendering as a failure.
      return;
    }

    if (destroyed || myToken !== token) return;
    controller = null;

    if (!outcome.ok) {
      // Deliberately not cached: a transient blip shouldn't be pinned for the session.
      emit({ status: "error", query, reason: outcome.reason });
      return;
    }

    cachePut(query.toLowerCase(), outcome.results);
    emit(
      outcome.results.length > 0
        ? { status: "results", query, results: outcome.results }
        : { status: "empty", query }
    );
  }

  function begin(raw: string, immediate: boolean): void {
    if (destroyed) return;

    const query = raw.trim();
    stop();

    if (query.length < minLength) {
      emit({ status: "idle" });
      return;
    }

    const cached = cache.get(query.toLowerCase());
    if (cached) {
      emit(
        cached.length > 0
          ? { status: "results", query, results: cached }
          : { status: "empty", query }
      );
      return;
    }

    emit({ status: "loading", results: lastResults });

    const myToken = token;
    if (immediate) {
      void run(query, myToken);
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      void run(query, myToken);
    }, debounceMs);
  }

  return {
    search(query: string) {
      begin(query, false);
    },
    searchNow(query: string) {
      begin(query, true);
    },
    cancel() {
      if (destroyed) return;
      stop();
      emit({ status: "idle" });
    },
    destroy() {
      stop();
      destroyed = true;
    },
  };
}
