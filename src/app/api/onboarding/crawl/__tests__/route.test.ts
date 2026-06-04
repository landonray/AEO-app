import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const crawlSiteMock = vi.fn();
const extractCrawlMock = vi.fn();

class HomepageCrawlError extends Error {
  readonly source = 'scraper' as const;
  readonly url: string;
  readonly status?: number;
  constructor(message: string, opts: { url: string; status?: number }) {
    super(message);
    this.name = 'HomepageCrawlError';
    this.url = opts.url;
    this.status = opts.status;
  }
}

vi.mock('@/lib/scraper', () => ({
  crawlSite: crawlSiteMock,
  HomepageCrawlError,
}));

vi.mock('@/lib/generators', () => ({
  extractCrawl: extractCrawlMock,
}));

const SAMPLE_CRAWL_RESULT = {
  title: 'Acme',
  description: 'A CRM for SMBs',
  category: 'CRM',
  targetAudience: 'SMB owners',
  coreUseCase: 'manage leads',
  features: ['pipelines'],
  integrations: ['stripe'],
  pricingInfo: '',
  competitorHints: ['hubspot'],
};

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/onboarding/crawl', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  crawlSiteMock.mockReset();
  extractCrawlMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/onboarding/crawl', () => {
  it('happy path: returns crawlData and normalized domain (§9.1.a)', async () => {
    crawlSiteMock.mockResolvedValueOnce({
      url: 'https://acme.com/',
      pages: [{ path: '/', text: 'home' }],
    });
    extractCrawlMock.mockResolvedValueOnce(SAMPLE_CRAWL_RESULT);

    const { POST } = await import('@/app/api/onboarding/crawl/route');
    const res = await POST(jsonRequest({ url: 'https://acme.com' }) as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.crawlData).toEqual(SAMPLE_CRAWL_RESULT);
    expect(body.domain).toBe('acme.com');
    expect(crawlSiteMock).toHaveBeenCalledTimes(1);
    expect(extractCrawlMock).toHaveBeenCalledTimes(1);
  });

  it('prepends https:// when user types a bare domain (§9.1.d)', async () => {
    crawlSiteMock.mockResolvedValueOnce({
      url: 'https://acme.com/',
      pages: [],
    });
    extractCrawlMock.mockResolvedValueOnce(SAMPLE_CRAWL_RESULT);

    const { POST } = await import('@/app/api/onboarding/crawl/route');
    const res = await POST(jsonRequest({ url: 'acme.com' }) as never);

    expect(res.status).toBe(200);
    const url = crawlSiteMock.mock.calls[0][0] as string;
    expect(url.startsWith('https://acme.com')).toBe(true);
  });

  it('returns 400 when url is missing', async () => {
    const { POST } = await import('@/app/api/onboarding/crawl/route');
    const res = await POST(jsonRequest({}) as never);
    expect(res.status).toBe(400);
    expect(crawlSiteMock).not.toHaveBeenCalled();
  });

  it('returns 400 when url is empty string', async () => {
    const { POST } = await import('@/app/api/onboarding/crawl/route');
    const res = await POST(jsonRequest({ url: '   ' }) as never);
    expect(res.status).toBe(400);
    expect(crawlSiteMock).not.toHaveBeenCalled();
  });

  it('returns 400 when url is a non-http(s) scheme', async () => {
    const { POST } = await import('@/app/api/onboarding/crawl/route');
    const res = await POST(jsonRequest({ url: 'ftp://acme.com' }) as never);
    expect(res.status).toBe(400);
    expect(crawlSiteMock).not.toHaveBeenCalled();
  });

  it('returns 400 when body is not valid JSON', async () => {
    const req = new Request('http://localhost/api/onboarding/crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const { POST } = await import('@/app/api/onboarding/crawl/route');
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it('returns 400 when homepage fetch fails (§9.1.b/c)', async () => {
    crawlSiteMock.mockRejectedValueOnce(
      new HomepageCrawlError('Homepage at https://nope.test/ returned HTTP 404', {
        url: 'https://nope.test/',
        status: 404,
      }),
    );

    const { POST } = await import('@/app/api/onboarding/crawl/route');
    const res = await POST(jsonRequest({ url: 'https://nope.test' }) as never);
    expect(res.status).toBe(400);
    expect(extractCrawlMock).not.toHaveBeenCalled();
  });
});
