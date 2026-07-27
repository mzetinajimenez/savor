// Pure, deterministic caption -> venue-name-guess heuristic. No DOM/React, no network — this is
// framework-free lib/ code per CLAUDE.md so it stays unit-testable with plain Vitest.
//
// Heuristic order (first hit wins; each stage's candidate is cleaned of hashtags/mentions/emoji
// and must be non-empty to count as a hit):
//   1. a line containing a 📍 pin — take the text after the pin, up to the next comma/sentence
//      boundary (drops a trailing "in {City}" written as "📍 Name, City").
//   2. an "at {Name} in {City}" (or bare "at {Name}") clause.
//   3. the first clause (split on sentence boundaries) that reads as a name: a run of 2+
//      consecutive Title-Case words. This deliberately rejects generic ALL-CAPS/lowercase
//      description text (e.g. "BEST tacos in CDMX") rather than fabricating a venue name from
//      hashtag-soup vibes.
//   4. an @handle, expanded into a space-joined query: separators (_ . -) and camelCase
//      boundaries become spaces, then the whole thing is lowercased. A fully run-together handle
//      (no separators, no case signal) is passed through unsegmented — this is deliberately NOT
//      a dictionary word-splitter.
// Returns undefined when none of the above produce anything — never fabricated, never coords.

const PIN_EMOJI = "📍";

function stripUrls(text: string): string {
  return text.replace(/https?:\/\/\S+/gi, "").replace(/\bwww\.\S+/gi, "");
}

// First sentence-like segment: cuts at a comma, sentence-ending punctuation, or newline.
function firstSegment(s: string): string {
  return s.split(/[,.!?\n]/)[0];
}

// Drops hashtags/mentions (and anything glued to them) and emoji, then collapses whitespace.
function stripTagsAndEmoji(s: string): string {
  return s
    .replace(/[#@]\S+/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPinClause(text: string): string | undefined {
  for (const line of text.split("\n")) {
    const idx = line.indexOf(PIN_EMOJI);
    if (idx === -1) continue;
    const rest = firstSegment(line.slice(idx + PIN_EMOJI.length));
    const cleaned = stripTagsAndEmoji(rest);
    if (cleaned) return cleaned;
  }
  return undefined;
}

function extractAtClause(text: string): string | undefined {
  const atIdx = text.search(/\bat\s+/i);
  if (atIdx === -1) return undefined;
  const afterAt = text.slice(atIdx).replace(/^at\s+/i, "");
  const inMatch = afterAt.match(/^(.*?)\s+in\s+/i);
  const candidate = inMatch ? inMatch[1] : firstSegment(afterAt);
  const cleaned = stripTagsAndEmoji(candidate);
  return cleaned || undefined;
}

// Longest run of 2+ consecutive Title-Case words (capital letter + only lowercase after),
// e.g. "Tacos El Oax" -> matches; "BEST tacos in CDMX" -> no run (ALL-CAPS/lowercase words
// don't qualify), so this correctly returns undefined for generic description text.
function titleCaseRun(s: string): string | undefined {
  const words = s.split(/\s+/).filter(Boolean);
  let current: string[] = [];
  let best: string[] = [];
  for (const word of words) {
    if (/^[A-Z][a-z]+$/.test(word)) {
      current.push(word);
      if (current.length > best.length) best = [...current];
    } else {
      current = [];
    }
  }
  return best.length >= 2 ? best.join(" ") : undefined;
}

function extractFirstClause(text: string): string | undefined {
  for (const raw of text.split(/[\n.!?]+/)) {
    const cleaned = stripTagsAndEmoji(raw);
    if (!cleaned) continue;
    const run = titleCaseRun(cleaned);
    if (run) return run;
  }
  return undefined;
}

function expandHandle(handle: string): string {
  const spaced = handle.replace(/[_.-]+/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.toLowerCase().replace(/\s+/g, " ").trim();
}

function extractHandleGuess(text: string): string | undefined {
  const match = text.match(/@([A-Za-z0-9_.-]+)/);
  if (!match) return undefined;
  const expanded = expandHandle(match[1]);
  return expanded || undefined;
}

export function guessVenueName(text: string): string | undefined {
  if (!text.trim()) return undefined;
  const cleaned = stripUrls(text);
  return (
    extractPinClause(cleaned) ??
    extractAtClause(cleaned) ??
    extractFirstClause(cleaned) ??
    extractHandleGuess(cleaned)
  );
}
