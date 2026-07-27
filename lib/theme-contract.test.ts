// lib/theme-contract.test.ts
// Enforces CLAUDE.md's "tokens only" convention. Components must reference @theme tokens
// from app/globals.css — never a legacy Cellar token, never a raw hex value.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const APP_DIR = resolve(process.cwd(), "app");

// Cellar-only token names. "gold" is deliberately absent: both palettes define
// --color-gold, so `text-gold` stays valid across the migration.
const LEGACY_TOKENS = [
  "shell",
  "surface-sunk",
  "surface",
  "line",
  "ink-soft",
  "ink",
  "plum-deep",
  "plum-tint",
  "plum",
  "ember-deep",
  "ember-tint",
  "ember",
  "gold-tint",
  "chili",
];

const UTILITY_PREFIX =
  "bg|text|border|ring|fill|stroke|from|via|to|outline|shadow|divide|placeholder|accent|caret|decoration";

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

function violations(pattern: RegExp): string[] {
  return tsxFiles(APP_DIR).flatMap((file) => {
    const found = readFileSync(file, "utf8").match(pattern) ?? [];
    return found.length === 0
      ? []
      : [`${relative(process.cwd(), file)} — ${found.length}: ${[...new Set(found)].join(", ")}`];
  });
}

describe("theme contract", () => {
  it("no component references a legacy Cellar token", () => {
    const pattern = new RegExp(`\\b(?:${UTILITY_PREFIX})-(?:${LEGACY_TOKENS.join("|")})\\b`, "g");
    expect(violations(pattern)).toEqual([]);
  });

  it("no component hardcodes a raw hex colour", () => {
    expect(violations(/#[0-9a-fA-F]{3,8}\b/g)).toEqual([]);
  });
});
