import * as cheerio from "cheerio";

const USER_AGENT = "LuminaireBot/1.0 (+https://luminaire.local)";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_CHARS_PER_PAGE = 5000;

const SECONDARY_PATHS = [
  "/pricing",
  "/features",
  "/about",
  "/integrations",
  "/use-cases",
  "/product",
] as const;

const STRIP_SELECTORS = [
  "script",
  "style",
  "noscript",
  "nav",
  "footer",
  "header",
] as const;

export interface CrawlPage {
  path: string;
  text: string;
}

export interface CrawlPages {
  url: string;
  pages: CrawlPage[];
}

export class HomepageCrawlError extends Error {
  readonly source = "scraper" as const;
  readonly url: string;
  readonly status?: number;

  constructor(
    message: string,
    options: { url: string; status?: number; cause?: unknown },
  ) {
    super(message);
    this.name = "HomepageCrawlError";
    this.url = options.url;
    this.status = options.status;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "GET",
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function extractText(html: string): string {
  const $ = cheerio.load(html);
  for (const selector of STRIP_SELECTORS) {
    $(selector).remove();
  }
  const raw = $("body").text() || $.root().text();
  const collapsed = raw.replace(/\s+/g, " ").trim();
  return collapsed.length > MAX_CHARS_PER_PAGE
    ? collapsed.slice(0, MAX_CHARS_PER_PAGE)
    : collapsed;
}

function buildPageUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl).toString();
}

function homepagePath(baseUrl: string): string {
  try {
    const u = new URL(baseUrl);
    return u.pathname && u.pathname !== "" ? u.pathname : "/";
  } catch {
    return "/";
  }
}

async function fetchAndExtract(
  url: string,
  path: string,
): Promise<CrawlPage | null> {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const html = await res.text();
    return { path, text: extractText(html) };
  } catch {
    return null;
  }
}

export async function crawlSite(url: string): Promise<CrawlPages> {
  let homepageRes: Response;
  try {
    homepageRes = await fetchWithTimeout(url);
  } catch (err) {
    throw new HomepageCrawlError(
      `Failed to fetch homepage at ${url}`,
      { url, cause: err },
    );
  }

  if (!homepageRes.ok) {
    throw new HomepageCrawlError(
      `Homepage at ${url} returned HTTP ${homepageRes.status}`,
      { url, status: homepageRes.status },
    );
  }

  const homepageHtml = await homepageRes.text();
  const homepage: CrawlPage = {
    path: homepagePath(url),
    text: extractText(homepageHtml),
  };

  const secondaryResults = await Promise.all(
    SECONDARY_PATHS.map((path) =>
      fetchAndExtract(buildPageUrl(url, path), path),
    ),
  );

  const pages: CrawlPage[] = [homepage];
  for (const result of secondaryResults) {
    if (result !== null) pages.push(result);
  }

  return { url, pages };
}
