import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getPrimaryBrandMock = vi.fn();
const getRunsMock = vi.fn();
const listActivePromptsMock = vi.fn();

vi.mock('@/lib/queries', () => ({
  getPrimaryBrand: getPrimaryBrandMock,
  getRuns: getRunsMock,
  listActivePrompts: listActivePromptsMock,
}));

beforeEach(() => {
  vi.resetModules();
  getPrimaryBrandMock.mockReset();
  getRunsMock.mockReset();
  listActivePromptsMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function req(qs = '?days=7'): Request {
  return new Request(`http://localhost/api/prompts/metrics${qs}`);
}

function brand() {
  return {
    id: 'brand-1',
    name: 'Acme',
    domain: 'acme.com',
    isPrimary: true,
    category: null,
    description: null,
    createdAt: '2026-01-01T00:00:00Z',
  };
}

function mkRun(over: Partial<Record<string, unknown>>): Record<string, unknown> {
  return {
    id: 'r' + Math.random().toString(36).slice(2, 8),
    promptId: 'p1',
    model: 'openai',
    response: 'text',
    mentioned: true,
    positionScore: 2,
    sentiment: 'neutral',
    competitorMentions: {},
    estimatedCost: null,
    createdAt: '2026-01-03T00:00:00Z',
    ...over,
  };
}

describe('GET /api/prompts/metrics (§11.4)', () => {
  it('returns empty when no primary brand', async () => {
    getPrimaryBrandMock.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/prompts/metrics/route');
    const res = await GET(req());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ prompts: [] });
  });

  it('returns sentiment=null (never 55) when a prompt has zero mentioned runs in window', async () => {
    getPrimaryBrandMock.mockResolvedValueOnce(brand());
    listActivePromptsMock.mockResolvedValueOnce([
      { id: 'p1', text: 'P1', topic: 'Core', isActive: true, tags: [], brandId: 'brand-1', createdAt: '2026-01-02T00:00:00Z' },
    ]);
    getRunsMock.mockResolvedValueOnce([
      mkRun({ promptId: 'p1', mentioned: false, sentiment: 'neutral', model: 'openai' }),
      mkRun({ promptId: 'p1', mentioned: false, sentiment: 'neutral', model: 'claude' }),
    ]);
    const { GET } = await import('@/app/api/prompts/metrics/route');
    const res = await GET(req());
    const body = await res.json();
    expect(body.prompts).toHaveLength(1);
    expect(body.prompts[0].sentiment).toBeNull();
    expect(body.prompts[0].visibility).toBe(0);
    expect(body.prompts[0].position).toBeNull();
  });

  it('returns sentiment=null for a prompt with NO runs in window', async () => {
    getPrimaryBrandMock.mockResolvedValueOnce(brand());
    listActivePromptsMock.mockResolvedValueOnce([
      { id: 'p1', text: 'P1', topic: 'Core', isActive: true, tags: [], brandId: 'brand-1', createdAt: '2026-01-02T00:00:00Z' },
    ]);
    getRunsMock.mockResolvedValueOnce([]);
    const { GET } = await import('@/app/api/prompts/metrics/route');
    const res = await GET(req());
    const body = await res.json();
    expect(body.prompts[0].sentiment).toBeNull();
    expect(body.prompts[0].activeRunCount).toBe(0);
    expect(body.prompts[0].models).toEqual([]);
  });

  it('averages sentiment over mentioned-only runs (positive=80, neutral=55, negative=30)', async () => {
    getPrimaryBrandMock.mockResolvedValueOnce(brand());
    listActivePromptsMock.mockResolvedValueOnce([
      { id: 'p1', text: 'P1', topic: 'Core', isActive: true, tags: [], brandId: 'brand-1', createdAt: '2026-01-02T00:00:00Z' },
    ]);
    getRunsMock.mockResolvedValueOnce([
      mkRun({ promptId: 'p1', mentioned: true, sentiment: 'positive', model: 'openai' }),
      mkRun({ promptId: 'p1', mentioned: true, sentiment: 'negative', model: 'claude' }),
      mkRun({ promptId: 'p1', mentioned: false, sentiment: 'neutral', model: 'gemini' }),
    ]);
    const { GET } = await import('@/app/api/prompts/metrics/route');
    const res = await GET(req());
    const body = await res.json();
    expect(body.prompts[0].sentiment).toBe(55); // (80+30)/2; non-mentioned excluded
    expect(body.prompts[0].visibility).toBeCloseTo(2 / 3);
  });

  it('exposes models seen in window and activeRunCount', async () => {
    getPrimaryBrandMock.mockResolvedValueOnce(brand());
    listActivePromptsMock.mockResolvedValueOnce([
      { id: 'p1', text: 'P1', topic: 'Core', isActive: true, tags: [], brandId: 'brand-1', createdAt: '2026-01-02T00:00:00Z' },
    ]);
    getRunsMock.mockResolvedValueOnce([
      mkRun({ promptId: 'p1', model: 'claude', mentioned: true, positionScore: 3 }),
      mkRun({ promptId: 'p1', model: 'openai', mentioned: true, positionScore: 1 }),
    ]);
    const { GET } = await import('@/app/api/prompts/metrics/route');
    const res = await GET(req());
    const body = await res.json();
    expect(body.prompts[0].activeRunCount).toBe(2);
    expect(body.prompts[0].models.sort()).toEqual(['claude', 'openai']);
    expect(body.prompts[0].position).toBe(2); // (1+3)/2
  });

  it('passes model filter through to getRuns and ignores model=all', async () => {
    getPrimaryBrandMock.mockResolvedValue(brand());
    listActivePromptsMock.mockResolvedValue([]);
    getRunsMock.mockResolvedValue([]);
    const { GET } = await import('@/app/api/prompts/metrics/route');

    await GET(req('?days=30&model=claude'));
    expect(getRunsMock).toHaveBeenLastCalledWith({
      brandId: 'brand-1',
      days: 30,
      model: 'claude',
    });

    await GET(req('?days=30&model=all'));
    expect(getRunsMock).toHaveBeenLastCalledWith({
      brandId: 'brand-1',
      days: 30,
      model: undefined,
    });
  });

  it('defaults days to 7 when omitted and rejects garbage values', async () => {
    getPrimaryBrandMock.mockResolvedValue(brand());
    listActivePromptsMock.mockResolvedValue([]);
    getRunsMock.mockResolvedValue([]);
    const { GET } = await import('@/app/api/prompts/metrics/route');

    await GET(new Request('http://localhost/api/prompts/metrics'));
    expect(getRunsMock).toHaveBeenLastCalledWith(expect.objectContaining({ days: 7 }));

    await GET(req("?days=';--"));
    expect(getRunsMock).toHaveBeenLastCalledWith(expect.objectContaining({ days: 7 }));
  });
});
