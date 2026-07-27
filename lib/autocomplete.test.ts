// createLookupSession owns "when to search" and "which answer wins". Its whole reason for
// existing outside React is testability: the search fn is injected, so these tests drive it
// with fake timers and hand-resolved promises, no network and no DOM.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLookupSession, type LookupState } from "./autocomplete";
import type { LookupOutcome, LookupResult } from "./lookup";

function place(name: string): LookupResult {
  return { name, lat: 1, lng: 2 };
}

function ok(...names: string[]): LookupOutcome {
  return { ok: true, results: names.map(place) };
}

// Collects every emitted state so assertions can look at the sequence, not just the end.
function harness(search: (q: string, signal: AbortSignal) => Promise<LookupOutcome>) {
  const states: LookupState[] = [];
  const session = createLookupSession({ onState: (s) => states.push(s), search });
  return { states, session, last: () => states[states.length - 1] };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createLookupSession", () => {
  it("debounces a burst of keystrokes into a single search", async () => {
    const search = vi.fn().mockResolvedValue(ok("Taco Spot"));
    const { session } = harness(search);

    session.search("ta");
    session.search("tac");
    session.search("taco");
    await vi.advanceTimersByTimeAsync(250);

    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0][0]).toBe("taco");
  });

  it("does not search below the minimum length", async () => {
    const search = vi.fn().mockResolvedValue(ok());
    const { session, last } = harness(search);

    session.search("ta");
    await vi.advanceTimersByTimeAsync(250);

    expect(search).not.toHaveBeenCalled();
    expect(last()).toEqual({ status: "idle" });
  });

  it("trims before measuring length and before searching", async () => {
    const search = vi.fn().mockResolvedValue(ok("Taco Spot"));
    const { session } = harness(search);

    session.search("  taco  ");
    await vi.advanceTimersByTimeAsync(250);

    expect(search.mock.calls[0][0]).toBe("taco");
  });

  it("emits results for a successful search", async () => {
    const { session, last } = harness(vi.fn().mockResolvedValue(ok("Taco Spot")));

    session.search("taco");
    await vi.advanceTimersByTimeAsync(250);

    expect(last()).toEqual({
      status: "results",
      query: "taco",
      results: [place("Taco Spot")],
    });
  });

  it("emits empty (not error) when the search succeeds with no matches", async () => {
    const { session, last } = harness(vi.fn().mockResolvedValue(ok()));

    session.search("zzzz");
    await vi.advanceTimersByTimeAsync(250);

    expect(last()).toEqual({ status: "empty", query: "zzzz" });
  });

  it("emits error with the reason when the search fails", async () => {
    const { session, last } = harness(
      vi.fn().mockResolvedValue({ ok: false, reason: "network" } as LookupOutcome)
    );

    session.search("taco");
    await vi.advanceTimersByTimeAsync(250);

    expect(last()).toEqual({ status: "error", query: "taco", reason: "network" });
  });

  it("keeps the previous results visible while loading, to avoid a blank flash", async () => {
    const { session, states } = harness(vi.fn().mockResolvedValue(ok("Taco Spot")));

    session.search("taco");
    await vi.advanceTimersByTimeAsync(250);
    session.search("tacos");

    expect(states.at(-1)).toEqual({ status: "loading", results: [place("Taco Spot")] });
  });

  // This is issue #7: a slow response for an older query landing after a newer one.
  it("discards a stale response that resolves after a newer query", async () => {
    let resolveSlow!: (o: LookupOutcome) => void;
    const search = vi
      .fn()
      .mockImplementationOnce(() => new Promise<LookupOutcome>((r) => (resolveSlow = r)))
      .mockResolvedValueOnce(ok("Tacos Fast"));
    const { session, last } = harness(search);

    session.search("taco");
    await vi.advanceTimersByTimeAsync(250);   // "taco" is now in flight, unresolved
    session.search("tacos");
    await vi.advanceTimersByTimeAsync(250);   // "tacos" resolves

    expect(last()).toEqual({
      status: "results",
      query: "tacos",
      results: [place("Tacos Fast")],
    });

    resolveSlow(ok("Taco Slow"));             // the stale answer finally arrives
    await vi.advanceTimersByTimeAsync(0);

    expect(last()).toEqual({
      status: "results",
      query: "tacos",
      results: [place("Tacos Fast")],
    });
  });

  it("aborts the in-flight request when a newer query starts", async () => {
    const signals: AbortSignal[] = [];
    const search = vi.fn().mockImplementation((_q: string, signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<LookupOutcome>(() => {});
    });
    const { session } = harness(search);

    session.search("taco");
    await vi.advanceTimersByTimeAsync(250);
    expect(signals[0].aborted).toBe(false);

    session.search("tacos");
    await vi.advanceTimersByTimeAsync(250);

    expect(signals[0].aborted).toBe(true);
  });

  it("swallows a rejected (aborted) search without emitting an error", async () => {
    const search = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("aborted", "AbortError"));
    const { session, states } = harness(search);

    session.search("taco");
    await vi.advanceTimersByTimeAsync(250);

    expect(states.some((s) => s.status === "error")).toBe(false);
  });

  it("serves a repeated query from cache without searching again", async () => {
    const search = vi.fn().mockResolvedValue(ok("Taco Spot"));
    const { session, last } = harness(search);

    session.search("taco");
    await vi.advanceTimersByTimeAsync(250);
    session.search("tacos");
    await vi.advanceTimersByTimeAsync(250);
    session.search("taco");   // backspace

    expect(search).toHaveBeenCalledTimes(2);
    expect(last()).toEqual({
      status: "results",
      query: "taco",
      results: [place("Taco Spot")],
    });
  });

  it("matches the cache case-insensitively", async () => {
    const search = vi.fn().mockResolvedValue(ok("Taco Spot"));
    const { session } = harness(search);

    session.search("taco");
    await vi.advanceTimersByTimeAsync(250);
    session.search("TACO");

    expect(search).toHaveBeenCalledTimes(1);
  });

  // Caching a failure would pin a transient blip for the rest of the session.
  it("never caches a failed search", async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: "network" } as LookupOutcome)
      .mockResolvedValueOnce(ok("Taco Spot"));
    const { session, last } = harness(search);

    session.search("taco");
    await vi.advanceTimersByTimeAsync(250);
    session.search("taco");
    await vi.advanceTimersByTimeAsync(250);

    expect(search).toHaveBeenCalledTimes(2);
    expect(last()).toEqual({
      status: "results",
      query: "taco",
      results: [place("Taco Spot")],
    });
  });

  it("cancel() stops a pending search and goes idle", async () => {
    const search = vi.fn().mockResolvedValue(ok("Taco Spot"));
    const { session, last } = harness(search);

    session.search("taco");
    session.cancel();
    await vi.advanceTimersByTimeAsync(250);

    expect(search).not.toHaveBeenCalled();
    expect(last()).toEqual({ status: "idle" });
  });

  it("destroy() stops pending work and emits nothing further", async () => {
    const search = vi.fn().mockResolvedValue(ok("Taco Spot"));
    const { session, states } = harness(search);

    session.search("taco");
    session.destroy();
    const count = states.length;
    await vi.advanceTimersByTimeAsync(250);
    session.search("tacos");
    await vi.advanceTimersByTimeAsync(250);

    expect(search).not.toHaveBeenCalled();
    expect(states.length).toBe(count);
  });

  it("searchNow() bypasses the debounce for the prefill path", async () => {
    const search = vi.fn().mockResolvedValue(ok("Taco Spot"));
    const { session } = harness(search);

    session.searchNow("taco");
    await vi.advanceTimersByTimeAsync(0);

    expect(search).toHaveBeenCalledTimes(1);
  });
});
