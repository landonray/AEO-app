import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getPrimaryBrandMock = vi.fn();
const getRunsMock = vi.fn();
const getCitationsMock = vi.fn();

vi.mock('@/lib/queries', () => ({
  getPrimaryBrand: getPrimaryBrandMock,
  getRuns: getRunsMock,
  getCitations: getCitationsMock,
}));

function buildReq(search = ''): { url: string } {
  return { url: `http://localhost/api/sources${search}` } as { url: string };
}

beforeEach(() => {
  vi.resetModules();
  getPrimaryBrandMock.mockReset();
  getRunsMock.mockReset();
  getCitationsMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const brand = {
  id: 'brand-1',
  name: 'Acme',
  domain: 'acme.com',
  isPrimary: true,
  category: null,
  description: null,
  createdAt: '2026-01-01T00:00:00Z',
};

describe('GET /api/sources (§11.3)', () => {
  it('returns the documented shape', async () => {
    getPrimaryBrandMock.mockResolvedValueOnce(brand);
    getRunsMock.mockResolvedValueOnce([]);
    getCitationsMock.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/sources/route');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(buildReq() as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual([
      'domainTypes',
      'sources',
      'trend',
      'view',
    ]);
  });

  it('empty windows return empty arrays, not nulls', async () => {
    getPrimaryBrandMock.mockResolvedValueOnce(brand);
    getRunsMock.mockResolvedValueOnce([]);
    getCitationsMock.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/sources/route');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(buildReq('?days=7') as any);
    const body = await res.json();

    expect(body.sources).toEqual([]);
    expect(body.domainTypes).toEqual([]);
    expect(body.trend).toEqual([]);
    expect(body.view).toBe('domains');
  });

  it('returns empty arrays when no primary brand exists', async () => {
    getPrimaryBrandMock.mockResolvedValueOnce(null);

    const { GET } = await import('@/app/api/sources/route');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(buildReq() as any);
    const body = await res.json();

    expect(body).toEqual({
      sources: [],
      domainTypes: [],
      trend: [],
      view: 'domains',
    });
    expect(getRunsMock).not.toHaveBeenCalled();
    expect(getCitationsMock).not.toHaveBeenCalled();
  });

  it('default view=domains returns domain-keyed sources (§13.7)', async () => {
    getPrimaryBrandMock.mockResolvedValueOnce(brand);
    getRunsMock.mockResolvedValueOnce([
      { id: 'r1', createdAt: '2026-05-30T00:00:00Z' },
      { id: 'r2', createdAt: '2026-05-30T00:00:00Z' },
    ]);
    getCitationsMock.mockResolvedValueOnce([
      { runId: 'r1', domain: 'reddit.com', url: 'https://reddit.com/a', domainType: 'UGC' },
      { runId: 'r1', domain: 'reddit.com', url: 'https://reddit.com/b', domainType: 'UGC' },
      { runId: 'r2', domain: 'reddit.com', url: 'https://reddit.com/a', domainType: 'UGC' },
      { runId: 'r2', domain: 'forbes.com', url: 'https://forbes.com/x', domainType: 'Editorial' },
    ]);

    const { GET } = await import('@/app/api/sources/route');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(buildReq('?days=7') as any);
    const body = await res.json();

    expect(body.view).toBe('domains');
    expect(body.sources.length).toBe(2);
    // Sorted by retrievalRate desc — reddit is in 2 runs, forbes in 1.
    expect(body.sources[0].domain).toBe('reddit.com');
    expect(body.sources[0].retrievalRate).toBeCloseTo(2 / 2);
    expect(body.sources[0].citationRate).toBeCloseTo(3 / 4);
    expect(body.sources[0]).not.toHaveProperty('url');
    expect(body.sources[1].domain).toBe('forbes.com');

    // Domain type breakdown
    expect(body.domainTypes.length).toBe(2);
    const ugc = body.domainTypes.find((d: { type: string }) => d.type === 'UGC');
    expect(ugc.count).toBe(3);
    expect(ugc.percentage).toBeCloseTo(0.75);
  });

  it('view=urls returns URL-keyed sources (§13.8)', async () => {
    getPrimaryBrandMock.mockResolvedValueOnce(brand);
    getRunsMock.mockResolvedValueOnce([
      { id: 'r1', createdAt: '2026-05-30T00:00:00Z' },
      { id: 'r2', createdAt: '2026-05-30T00:00:00Z' },
    ]);
    getCitationsMock.mockResolvedValueOnce([
      { runId: 'r1', domain: 'reddit.com', url: 'https://reddit.com/a', domainType: 'UGC' },
      { runId: 'r2', domain: 'reddit.com', url: 'https://reddit.com/a', domainType: 'UGC' },
      { runId: 'r2', domain: 'reddit.com', url: 'https://reddit.com/b', domainType: 'UGC' },
    ]);

    const { GET } = await import('@/app/api/sources/route');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(buildReq('?days=7&view=urls') as any);
    const body = await res.json();

    expect(body.view).toBe('urls');
    expect(body.sources.length).toBe(2);
    expect(body.sources[0].url).toBe('https://reddit.com/a');
    expect(body.sources[0].domain).toBe('reddit.com');
    expect(body.sources[0].retrievalRate).toBeCloseTo(2 / 2);
  });

  it("model='all' is treated as no model filter", async () => {
    getPrimaryBrandMock.mockResolvedValueOnce(brand);
    getRunsMock.mockResolvedValueOnce([]);
    getCitationsMock.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/sources/route');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await GET(buildReq('?model=all') as any);

    expect(getRunsMock.mock.calls[0][0].model).toBeUndefined();
    expect(getCitationsMock.mock.calls[0][0].model).toBeUndefined();
  });

  it('passes a valid model short id through to queries', async () => {
    getPrimaryBrandMock.mockResolvedValueOnce(brand);
    getRunsMock.mockResolvedValueOnce([]);
    getCitationsMock.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/sources/route');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await GET(buildReq('?model=claude&days=30') as any);

    expect(getRunsMock.mock.calls[0][0].model).toBe('claude');
    expect(getRunsMock.mock.calls[0][0].days).toBe(30);
    expect(getCitationsMock.mock.calls[0][0].model).toBe('claude');
    expect(getCitationsMock.mock.calls[0][0].view).toBe('domains');
  });

  it('defaults days=7 when omitted', async () => {
    getPrimaryBrandMock.mockResolvedValueOnce(brand);
    getRunsMock.mockResolvedValueOnce([]);
    getCitationsMock.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/sources/route');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await GET(buildReq() as any);

    expect(getRunsMock.mock.calls[0][0].days).toBe(7);
  });

  it('builds a trend with per-day retrieval rates for top entities', async () => {
    const now = new Date();
    const today = now.toISOString();
    const earlierDay = new Date(now.getTime() - 7 * 86_400_000).toISOString();

    getPrimaryBrandMock.mockResolvedValueOnce(brand);
    getRunsMock.mockResolvedValueOnce([
      { id: 'r1', createdAt: today },
      { id: 'r2', createdAt: earlierDay },
    ]);
    getCitationsMock.mockResolvedValueOnce([
      { runId: 'r1', domain: 'reddit.com', url: 'https://reddit.com/a', domainType: 'UGC' },
      { runId: 'r2', domain: 'reddit.com', url: 'https://reddit.com/b', domainType: 'UGC' },
    ]);

    const { GET } = await import('@/app/api/sources/route');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(buildReq('?days=30') as any);
    const body = await res.json();

    expect(Array.isArray(body.trend)).toBe(true);
    expect(body.trend.length).toBeGreaterThanOrEqual(1);
    for (const row of body.trend) {
      expect(typeof row.date).toBe('string');
      expect(typeof row.brand).toBe('number');
      expect(row['reddit.com']).toBeGreaterThanOrEqual(0);
      expect(row['reddit.com']).toBeLessThanOrEqual(1);
    }
  });
});
