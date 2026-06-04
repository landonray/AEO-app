import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crawlSite, HomepageCrawlError } from "@/lib/scraper";

const FIXTURES_DIR = join(__dirname, "..", "__fixtures__");
const HOMEPAGE_HTML = readFileSync(join(FIXTURES_DIR, "homepage.html"), "utf8");
const PRICING_HTML = readFileSync(join(FIXTURES_DIR, "pricing.html"), "utf8");

const EXPECTED_USER_AGENT = "OntraportAEOBot/1.0 (+https://aeo.landonray.com)";
const SECONDARY_PATHS = [
  "/pricing",
  "/features",
  "/about",
  "/integrations",
  "/use-cases",
  "/product",
] as const;

interface CapturedRequest {
  url: string;
  init: RequestInit;
}

type Responder = (
  url: string,
  init: RequestInit,
) => Response | Promise<Response>;

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function notFound(): Response {
  return new Response("Not Found", { status: 404 });
}

function installFetch(responder: Responder): { captured: CapturedRequest[] } {
  const captured: CapturedRequest[] = [];
  const fetchMock = vi.fn(
    async (url: RequestInfo | URL, init?: RequestInit) => {
      const reqUrl = String(url);
      const reqInit = init ?? {};
      captured.push({ url: reqUrl, init: reqInit });
      if (reqInit.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      return await responder(reqUrl, reqInit);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return { captured };
}

function defaultResponder(url: string): Response {
  const path = new URL(url).pathname;
  if (path === "/" || path === "") return htmlResponse(HOMEPAGE_HTML);
  if (path === "/pricing") return htmlResponse(PRICING_HTML);
  if (
    path === "/features" ||
    path === "/about" ||
    path === "/integrations" ||
    path === "/use-cases" ||
    path === "/product"
  ) {
    return htmlResponse(`<html><body><h1>${path}</h1><p>content</p></body></html>`);
  }
  return notFound();
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("crawlSite — §9.1 homepage fetch", () => {
  it("fetches the homepage and the six secondary paths in parallel", async () => {
    const { captured } = installFetch(defaultResponder);

    const result = await crawlSite("https://acme.com/");

    expect(result.url).toBe("https://acme.com/");
    // 1 homepage + 6 secondaries
    expect(captured).toHaveLength(7);
    const requestedUrls = captured.map((c) => c.url).sort();
    expect(requestedUrls).toEqual(
      [
        "https://acme.com/",
        ...SECONDARY_PATHS.map((p) => `https://acme.com${p}`),
      ].sort(),
    );
  });

  it("throws HomepageCrawlError on non-2xx homepage", async () => {
    installFetch((url) => {
      const path = new URL(url).pathname;
      if (path === "/" || path === "") return notFound();
      return htmlResponse("<html><body><p>ok</p></body></html>");
    });

    await expect(crawlSite("https://acme.com/")).rejects.toBeInstanceOf(
      HomepageCrawlError,
    );

    try {
      await crawlSite("https://acme.com/");
    } catch (err) {
      expect(err).toBeInstanceOf(HomepageCrawlError);
      const e = err as HomepageCrawlError;
      expect(e.status).toBe(404);
      expect(e.url).toBe("https://acme.com/");
    }
  });

  it("throws HomepageCrawlError when the homepage fetch itself rejects (DNS/TLS)", async () => {
    installFetch(() => {
      throw new TypeError("ENOTFOUND acme.com");
    });

    await expect(crawlSite("https://acme.com/")).rejects.toBeInstanceOf(
      HomepageCrawlError,
    );
  });
});

describe("crawlSite — §9.2 secondary pages", () => {
  it("fetches all six secondary paths in parallel when each returns 200", async () => {
    const { captured } = installFetch(defaultResponder);

    const result = await crawlSite("https://acme.com/");

    const secondaryPaths = result.pages
      .map((p) => p.path)
      .filter((p) => p !== "/");
    expect(secondaryPaths.sort()).toEqual([...SECONDARY_PATHS].sort());

    // homepage + 6 secondaries
    expect(result.pages).toHaveLength(7);

    // Every request used the documented User-Agent
    for (const req of captured) {
      const headers = req.init.headers as Record<string, string>;
      expect(headers["User-Agent"]).toBe(EXPECTED_USER_AGENT);
    }
  });

  it("silently skips secondary pages that return non-2xx (not represented as empty entries)", async () => {
    installFetch((url) => {
      const path = new URL(url).pathname;
      if (path === "/" || path === "") return htmlResponse(HOMEPAGE_HTML);
      if (path === "/pricing") return htmlResponse(PRICING_HTML);
      if (path === "/features")
        return htmlResponse("<html><body>features</body></html>");
      // about, integrations, use-cases, product → 404
      return notFound();
    });

    const result = await crawlSite("https://acme.com/");

    const paths = result.pages.map((p) => p.path);
    expect(paths).toContain("/");
    expect(paths).toContain("/pricing");
    expect(paths).toContain("/features");
    expect(paths).not.toContain("/about");
    expect(paths).not.toContain("/integrations");
    expect(paths).not.toContain("/use-cases");
    expect(paths).not.toContain("/product");

    // No empty-string entries
    for (const page of result.pages) {
      expect(page.text.length).toBeGreaterThan(0);
    }
  });

  it("silently skips secondary pages whose fetch rejects (e.g. timeout / network error)", async () => {
    installFetch((url) => {
      const path = new URL(url).pathname;
      if (path === "/" || path === "") return htmlResponse(HOMEPAGE_HTML);
      if (path === "/pricing") return htmlResponse(PRICING_HTML);
      throw new TypeError("network error");
    });

    const result = await crawlSite("https://acme.com/");

    const paths = result.pages.map((p) => p.path);
    expect(paths).toEqual(["/", "/pricing"]);
  });

  it("passes an AbortSignal to every fetch (so the 10s timer can cancel hung requests)", async () => {
    const { captured } = installFetch(defaultResponder);

    await crawlSite("https://acme.com/");

    expect(captured.length).toBeGreaterThan(0);
    for (const req of captured) {
      expect(req.init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it("clears the per-fetch timeout on the success path so no timers leak", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    installFetch(defaultResponder);

    await crawlSite("https://acme.com/");

    // 1 homepage + 6 secondaries = 7 fetches, each must clear its timer.
    expect(clearSpy.mock.calls.length).toBeGreaterThanOrEqual(7);
  });

  it("clears the per-fetch timeout on the rejection path so no timers leak when secondaries fail", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    installFetch((url) => {
      const path = new URL(url).pathname;
      if (path === "/" || path === "") return htmlResponse(HOMEPAGE_HTML);
      // Every secondary fetch rejects — we still expect their timers cleared.
      throw new TypeError("network down");
    });

    await crawlSite("https://acme.com/");

    // 1 homepage success + 6 secondary failures = 7 timers must have been cleared.
    expect(clearSpy.mock.calls.length).toBeGreaterThanOrEqual(7);
  });
});

describe("crawlSite — User-Agent header (§9.2.e / §14.6)", () => {
  it("sends OntraportAEOBot/1.0 (+https://aeo.landonray.com) on every request", async () => {
    const { captured } = installFetch(defaultResponder);

    await crawlSite("https://acme.com/");

    expect(captured.length).toBeGreaterThan(0);
    for (const req of captured) {
      const headers = req.init.headers as Record<string, string>;
      expect(headers["User-Agent"]).toBe(EXPECTED_USER_AGENT);
    }
  });
});

describe("crawlSite — §14.5 cheerio HTML parsing", () => {
  it("strips script, style, noscript, nav, footer, and header before text extraction", async () => {
    installFetch((url) => {
      const path = new URL(url).pathname;
      if (path === "/" || path === "") return htmlResponse(HOMEPAGE_HTML);
      return notFound();
    });

    const result = await crawlSite("https://acme.com/");
    const homepage = result.pages.find((p) => p.path === "/");
    expect(homepage).toBeDefined();
    const text = homepage!.text;

    // None of the marker strings from script/style/noscript/nav/header/footer
    // should appear in the extracted text.
    expect(text).not.toContain("__secretScriptLeak");
    expect(text).not.toContain("DO NOT LEAK SCRIPT BODY");
    expect(text).not.toContain("secret-style-leak");
    expect(text).not.toContain("SECRET_NOSCRIPT_LEAK");
    expect(text).not.toContain("SECRET_NAV_LEAK");
    expect(text).not.toContain("SECRET_HEADER_LEAK");
    expect(text).not.toContain("SECRET_FOOTER_LEAK");

    // But real <main> content should still be present.
    expect(text).toContain("Acme Cloud");
    expect(text).toContain("The modern team workspace");
    expect(text).toContain("Real-time docs");
  });

  it("collapses whitespace runs to single spaces and trims", async () => {
    const messyHtml =
      "<html><body><main>   hello\n\n\n   world\t\t!   </main></body></html>";
    installFetch((url) => {
      const path = new URL(url).pathname;
      if (path === "/" || path === "") return htmlResponse(messyHtml);
      return notFound();
    });

    const result = await crawlSite("https://acme.com/");
    const homepage = result.pages.find((p) => p.path === "/");
    expect(homepage!.text).toBe("hello world !");
  });
});

describe("crawlSite — 5000-char per-page truncation", () => {
  it("truncates any page whose visible text exceeds 5000 characters", async () => {
    const longBody = "x".repeat(6000);
    const longHtml = `<html><body><main>${longBody}</main></body></html>`;

    installFetch((url) => {
      const path = new URL(url).pathname;
      if (path === "/" || path === "") return htmlResponse(HOMEPAGE_HTML);
      if (path === "/pricing") return htmlResponse(longHtml);
      return notFound();
    });

    const result = await crawlSite("https://acme.com/");
    const pricing = result.pages.find((p) => p.path === "/pricing");
    expect(pricing).toBeDefined();
    expect(pricing!.text.length).toBe(5000);
    expect(pricing!.text).toBe("x".repeat(5000));
  });

  it("leaves pages under 5000 chars untouched", async () => {
    const shortBody = "short and sweet";
    const shortHtml = `<html><body><main>${shortBody}</main></body></html>`;

    installFetch((url) => {
      const path = new URL(url).pathname;
      if (path === "/" || path === "") return htmlResponse(shortHtml);
      return notFound();
    });

    const result = await crawlSite("https://acme.com/");
    const homepage = result.pages.find((p) => p.path === "/");
    expect(homepage!.text).toBe("short and sweet");
  });
});

describe("crawlSite — return shape", () => {
  it("returns { url, pages: { path, text }[] } with one entry per successful fetch", async () => {
    installFetch(defaultResponder);

    const result = await crawlSite("https://acme.com/");

    expect(result).toHaveProperty("url", "https://acme.com/");
    expect(Array.isArray(result.pages)).toBe(true);
    for (const page of result.pages) {
      expect(typeof page.path).toBe("string");
      expect(typeof page.text).toBe("string");
    }
    // Homepage is always present; secondaries are subset of SECONDARY_PATHS
    const paths = result.pages.map((p) => p.path);
    expect(paths).toContain("/");
    for (const p of paths) {
      if (p === "/") continue;
      expect(SECONDARY_PATHS).toContain(p as (typeof SECONDARY_PATHS)[number]);
    }
  });
});
