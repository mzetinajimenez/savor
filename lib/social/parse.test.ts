// guessVenueName turns a shared Instagram/TikTok caption into a best-guess venue name for
// prefilling the add-place form. It is a pure heuristic pipeline — 📍 line -> "at {Name}"
// clause -> first non-hashtag/non-mention clause -> @handle fallback -> undefined — with no
// fabrication: when nothing usable is found (hashtag soup, a generic description with no
// anchor) it returns undefined rather than guessing a name from vibes or ever inventing
// coordinates. Handle expansion is deterministic string logic (separators + camelCase
// boundaries), never dictionary word-splitting.

import { describe, expect, it } from "vitest";
import { guessVenueName } from "./parse";

describe("guessVenueName", () => {
  it("prefers a 📍 line, dropping a trailing city after a comma and any hashtags", () => {
    const caption = "Best tacos in town 🌮\n📍 Tacos El Oax, Mexico City\n#foodie #cdmx";
    expect(guessVenueName(caption)).toBe("Tacos El Oax");
  });

  it("extracts the name from an 'at {Name} in {City}' clause", () => {
    const caption = "Had the best pastor tacos at Tacos El Oax in Mexico City! 🌮\n#tacotuesday";
    expect(guessVenueName(caption)).toBe("Tacos El Oax");
  });

  it("prefers the 📍 line over an 'at {Name}' clause when both are present", () => {
    const caption = "Dinner at Some Random Place in town\n📍 Tacos El Oax\n#foodie";
    expect(guessVenueName(caption)).toBe("Tacos El Oax");
  });

  it("falls back to the first non-hashtag/non-mention clause when it reads as a name", () => {
    const caption = "Tacos El Oax 🌮🌮 #tacotuesday #mexicanfood";
    expect(guessVenueName(caption)).toBe("Tacos El Oax");
  });

  it("expands an underscore-separated handle-only caption into a space-joined query", () => {
    expect(guessVenueName("@Tacos_El_Oax")).toBe("tacos el oax");
  });

  it("expands a camelCase handle-only caption into a space-joined query", () => {
    expect(guessVenueName("@TacosElOax")).toBe("tacos el oax");
  });

  it("expands a dot-separated handle-only caption into a space-joined query", () => {
    expect(guessVenueName("@tacos.el.oax")).toBe("tacos el oax");
  });

  it("passes a run-together handle through unsegmented (no dictionary word-splitting)", () => {
    expect(guessVenueName("@tacoseloax")).toBe("tacoseloax");
  });

  it("returns undefined for hashtag soup with no pin, anchor, or usable handle", () => {
    const caption = "BEST tacos in CDMX 🔥 #foodie #cdmx";
    expect(guessVenueName(caption)).toBeUndefined();
  });

  it("returns undefined for an empty string", () => {
    expect(guessVenueName("")).toBeUndefined();
  });

  it("returns undefined for a whitespace-only string", () => {
    expect(guessVenueName("   \n\t ")).toBeUndefined();
  });

  it("strips a URL before applying any heuristic", () => {
    const caption = "Check it out https://instagram.com/p/xyz 📍 Tacos El Oax\n#foodie";
    expect(guessVenueName(caption)).toBe("Tacos El Oax");
  });
});
