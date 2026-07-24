// resolveSharedLink is the single seam the UI (PlaceForm, the /import route) depends on: given
// any URL a user might paste after sharing a TikTok/Instagram post, it picks the right adapter
// and returns a normalized SharedLink, or null for an unrecognized URL. These tests pin:
//   - adapter selection per URL shape (including the tiktok-before-instagram ordering, which
//     matters only in that neither adapter should ever mis-claim the other's URLs);
//   - TikTok's hydrate mapping the oEmbed proxy response into captionText/authorName/nameGuess;
//   - TikTok's hydrate degrading to a URL-only SharedLink (never throwing) on any proxy failure
//     mode: non-ok response, rejected fetch, or a malformed JSON body;
//   - Instagram's hydrate doing no network at all and canonicalizing by stripping query/hash.
// fetch is stubbed per-test via vi.stubGlobal and restored in afterEach, mirroring lib/lookup.test.ts.

import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveSharedLink } from "./index";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveSharedLink — adapter selection", () => {
  it("selects the TikTok adapter for a /@user/video/{id} URL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));

    const result = await resolveSharedLink("https://www.tiktok.com/@tacos.el.oax/video/123456789");

    expect(result?.platform).toBe("tiktok");
  });

  it("selects the TikTok adapter for a vm. short link", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));

    const result = await resolveSharedLink("https://vm.tiktok.com/ZMabcdefg/");

    expect(result?.platform).toBe("tiktok");
  });

  it("selects the Instagram adapter for a /p/{shortcode} URL", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveSharedLink("https://www.instagram.com/p/Cabc123XYZ/");

    expect(result?.platform).toBe("instagram");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("selects the Instagram adapter for a /reel/{shortcode} URL", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const result = await resolveSharedLink("https://instagram.com/reel/Cxyz987ABC/");

    expect(result?.platform).toBe("instagram");
  });

  it("selects the Instagram adapter for a bare /{username}/ profile URL", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const result = await resolveSharedLink("https://www.instagram.com/tacoseloax/");

    expect(result?.platform).toBe("instagram");
  });

  it("selects the Instagram adapter for a nested /share/reel/{shortcode}/ wrapper URL", async () => {
    vi.stubGlobal("fetch", vi.fn());

    const result = await resolveSharedLink("https://www.instagram.com/share/reel/Cxyz987ABC/");

    expect(result?.platform).toBe("instagram");
  });

  it("returns null for an unrecognized URL", async () => {
    const result = await resolveSharedLink("https://example.com/x");

    expect(result).toBeNull();
  });

  it("returns null for a non-URL string", async () => {
    const result = await resolveSharedLink("not a url at all");

    expect(result).toBeNull();
  });
});

describe("TikTok hydrate — oEmbed success", () => {
  it("maps the proxy response into captionText/authorName/nameGuess", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        title: "Best pastor tacos at Tacos El Oax in Mexico City! #tacotuesday",
        authorName: "tacos.el.oax",
        thumbnailUrl: "https://example.com/thumb.jpg",
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveSharedLink("https://www.tiktok.com/@tacos.el.oax/video/123456789");

    expect(result).toEqual({
      platform: "tiktok",
      url: "https://www.tiktok.com/@tacos.el.oax/video/123456789",
      captionText: "Best pastor tacos at Tacos El Oax in Mexico City! #tacotuesday",
      authorName: "tacos.el.oax",
      nameGuess: "Tacos El Oax",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/tiktok-oembed?url=${encodeURIComponent(
        "https://www.tiktok.com/@tacos.el.oax/video/123456789"
      )}`
    );
  });

  it("omits nameGuess (undefined) when no title is present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ authorName: "tacos.el.oax" }))
    );

    const result = await resolveSharedLink("https://www.tiktok.com/@tacos.el.oax/video/123456789");

    expect(result?.captionText).toBeUndefined();
    expect(result?.nameGuess).toBeUndefined();
    expect(result?.authorName).toBe("tacos.el.oax");
  });
});

describe("TikTok hydrate — degrades to URL-only, never throws", () => {
  it("degrades when the proxy responds non-ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "nope" }, false, 502)));

    const result = await resolveSharedLink("https://www.tiktok.com/@tacos.el.oax/video/123456789");

    expect(result).toEqual({
      platform: "tiktok",
      url: "https://www.tiktok.com/@tacos.el.oax/video/123456789",
      captionText: undefined,
      nameGuess: undefined,
    });
  });

  it("degrades when fetch rejects (network failure)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await resolveSharedLink("https://www.tiktok.com/@tacos.el.oax/video/123456789");

    expect(result).toEqual({
      platform: "tiktok",
      url: "https://www.tiktok.com/@tacos.el.oax/video/123456789",
      captionText: undefined,
      nameGuess: undefined,
    });
  });

  it("degrades when the response body fails JSON parsing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token");
        },
      } as unknown as Response)
    );

    const result = await resolveSharedLink("https://www.tiktok.com/@tacos.el.oax/video/123456789");

    expect(result).toEqual({
      platform: "tiktok",
      url: "https://www.tiktok.com/@tacos.el.oax/video/123456789",
      captionText: undefined,
      nameGuess: undefined,
    });
  });

  it("degrades when the response body fails zod validation (wrong types)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ title: 12345, authorName: null }))
    );

    const result = await resolveSharedLink("https://www.tiktok.com/@tacos.el.oax/video/123456789");

    expect(result).toEqual({
      platform: "tiktok",
      url: "https://www.tiktok.com/@tacos.el.oax/video/123456789",
      captionText: undefined,
      nameGuess: undefined,
    });
  });
});

describe("Instagram hydrate — URL-only, no network", () => {
  it("strips query string and hash, keeping origin + pathname", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveSharedLink(
      "https://www.instagram.com/p/Cabc123XYZ/?utm_source=ig_share&igshid=abc#comments"
    );

    expect(result).toEqual({
      platform: "instagram",
      url: "https://www.instagram.com/p/Cabc123XYZ/",
      captionText: undefined,
      nameGuess: undefined,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
