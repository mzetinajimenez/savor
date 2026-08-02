import { describe, expect, it } from "vitest";
import { SHEET_PARAM, withSheet, withoutSheet } from "./sheetParam";

describe("withSheet", () => {
  it("adds the param to an empty search", () => {
    expect(withSheet("", "edit")).toBe("?sheet=edit");
  });

  it("tolerates a bare ? as empty", () => {
    expect(withSheet("?", "edit")).toBe("?sheet=edit");
  });

  it("preserves the params already there", () => {
    expect(withSheet("?tab=want&city=Austin", "weights")).toBe(
      "?tab=want&city=Austin&sheet=weights"
    );
  });

  it("replaces an existing sheet rather than appending a second one", () => {
    expect(withSheet("?sheet=edit", "weights")).toBe("?sheet=weights");
  });

  it("round-trips a value that needs encoding", () => {
    const search = withSheet("?city=San%20Jos%C3%A9", "edit");
    expect(new URLSearchParams(search).get("city")).toBe("San José");
    expect(new URLSearchParams(search).get(SHEET_PARAM)).toBe("edit");
  });
});

describe("withoutSheet", () => {
  it("removes the param and keeps the rest", () => {
    expect(withoutSheet("?tab=want&sheet=edit")).toBe("?tab=want");
  });

  it("returns an empty string when nothing is left", () => {
    expect(withoutSheet("?sheet=edit")).toBe("");
  });

  it("is a no-op when there is no sheet param", () => {
    expect(withoutSheet("?tab=want")).toBe("?tab=want");
    expect(withoutSheet("")).toBe("");
  });
});
