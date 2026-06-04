import { NextResponse, type NextRequest } from 'next/server';
import { crawlSite, HomepageCrawlError } from '@/lib/scraper';
import { extractCrawl } from '@/lib/generators';
import { normalizeDomain } from '@/lib/utils';
import type {
  OnboardingCrawlBody,
  OnboardingCrawlResponse,
} from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_PROTOCOL_RE = /^https?:\/\//i;
const ANY_PROTOCOL_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

function normalizeInputUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (VALID_PROTOCOL_RE.test(trimmed)) return trimmed;
  if (ANY_PROTOCOL_RE.test(trimmed)) return null;
  return `https://${trimmed}`;
}

interface JsonError {
  error: string;
}

export async function POST(
  req: NextRequest,
): Promise<NextResponse<OnboardingCrawlResponse | JsonError>> {
  let body: Partial<OnboardingCrawlBody>;
  try {
    body = (await req.json()) as Partial<OnboardingCrawlBody>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawUrl = typeof body?.url === 'string' ? body.url : '';
  const normalizedUrl = normalizeInputUrl(rawUrl);
  if (!normalizedUrl) {
    return NextResponse.json(
      { error: 'url is required and must be http(s) or a bare domain' },
      { status: 400 },
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json(
      { error: 'url must use http or https' },
      { status: 400 },
    );
  }

  const url = parsed.toString();

  let crawlPages;
  try {
    crawlPages = await crawlSite(url);
  } catch (err) {
    if (err instanceof HomepageCrawlError) {
      return NextResponse.json(
        { error: err.message },
        { status: 400 },
      );
    }
    throw err;
  }

  const crawlData = await extractCrawl(crawlPages.pages, url);
  const domain = normalizeDomain(url);

  return NextResponse.json({ crawlData, domain });
}
