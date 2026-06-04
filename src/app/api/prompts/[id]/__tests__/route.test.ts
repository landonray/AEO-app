import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getCitationsForRunIdsMock = vi.fn();
const getPromptMock = vi.fn();
const getRunsForPromptMock = vi.fn();
const getRunsForPromptInWindowMock = vi.fn();

vi.mock('@/lib/queries', () => ({
  getCitationsForRunIds: getCitationsForRunIdsMock,
  getPrompt: getPromptMock,
  getRunsForPrompt: getRunsForPromptMock,
  getRunsForPromptInWindow: getRunsForPromptInWindowMock,
}));

beforeEach(() => {
  vi.resetModules();
  getCitationsForRunIdsMock.mockReset();
  getPromptMock.mockReset();
  getRunsForPromptMock.mockReset();
  getRunsForPromptInWindowMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function req(qs = ''): Request {
  return new Request(`http://localhost/api/prompts/p1${qs}`);
}

function ctx(id = 'p1') {
  return { params: Promise.resolve({ id }) };
}

function prompt() {
  return {
    id: 'p1',
    text: 'P1',
    topic: 'Core',
    isActive: true,
    tags: [],
    brandId: 'brand-1',
    createdAt: '2026-01-02T00:00:00Z',
  };
}

function mkRun(over: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'r-' + Math.random().toString(36).slice(2, 8),
    promptId: 'p1',
    model: 'openai',
    response: 'hello world',
    mentioned: true,
    positionScore: 2,
    sentiment: 'positive',
    competitorMentions: {},
    estimatedCost: null,
    createdAt: '2026-01-03T00:00:00Z',
    ...over,
  };
}

describe('GET /api/prompts/[id] (§11.6)', () => {
  it('returns 404 when the prompt does not exist', async () => {
    getPromptMock.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/prompts/[id]/route');
    const res = await GET(req(), ctx('missing'));
    expect(res.status).toBe(404);
  });

  it('returns 5-row modelBreakdown with mentioned=null for models with no run in window', async () => {
    getPromptMock.mockResolvedValueOnce(prompt());
    getRunsForPromptMock.mockResolvedValueOnce([]);
    getRunsForPromptInWindowMock.mockResolvedValueOnce([
      mkRun({ id: 'r1', model: 'openai', mentioned: true, positionScore: 1, sentiment: 'positive' }),
    ]);
    getCitationsForRunIdsMock.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/prompts/[id]/route');
    const res = await GET(req(), ctx('p1'));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.modelBreakdown).toHaveLength(5);
    expect(body.modelBreakdown.map((r: { model: string }) => r.model)).toEqual([
      'openai',
      'claude',
      'gemini',
      'perplexity',
      'google_aio',
    ]);
    const openai = body.modelBreakdown.find((r: { model: string }) => r.model === 'openai');
    expect(openai.mentioned).toBe(true);
    expect(openai.position).toBe(1);
    const claude = body.modelBreakdown.find((r: { model: string }) => r.model === 'claude');
    expect(claude).toEqual({
      model: 'claude',
      mentioned: null,
      position: null,
      sentiment: null,
      citationCount: 0,
      latestResponsePreview: '',
      latestResponseFull: '',
    });
  });

  it('uses the LATEST run per model (windowRuns are ordered newest first)', async () => {
    getPromptMock.mockResolvedValueOnce(prompt());
    getRunsForPromptMock.mockResolvedValueOnce([]);
    getRunsForPromptInWindowMock.mockResolvedValueOnce([
      mkRun({ id: 'r-new', model: 'claude', positionScore: 1, createdAt: '2026-01-05T00:00:00Z' }),
      mkRun({ id: 'r-old', model: 'claude', positionScore: 5, createdAt: '2026-01-03T00:00:00Z' }),
    ]);
    getCitationsForRunIdsMock.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/prompts/[id]/route');
    const res = await GET(req(), ctx('p1'));
    const body = await res.json();
    const claude = body.modelBreakdown.find((r: { model: string }) => r.model === 'claude');
    expect(claude.position).toBe(1);
  });

  it('latestResponsePreview is the first 300 chars of the most recent response', async () => {
    getPromptMock.mockResolvedValueOnce(prompt());
    const longText = 'x'.repeat(500);
    getRunsForPromptMock.mockResolvedValueOnce([]);
    getRunsForPromptInWindowMock.mockResolvedValueOnce([
      mkRun({ id: 'r1', model: 'perplexity', response: longText }),
    ]);
    getCitationsForRunIdsMock.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/prompts/[id]/route');
    const res = await GET(req(), ctx('p1'));
    const body = await res.json();
    const px = body.modelBreakdown.find((r: { model: string }) => r.model === 'perplexity');
    expect(px.latestResponsePreview).toHaveLength(300);
    expect(px.latestResponsePreview).toBe('x'.repeat(300));
  });

  it('latestResponseFull is the complete, untruncated most recent response', async () => {
    getPromptMock.mockResolvedValueOnce(prompt());
    const longText = 'x'.repeat(500);
    getRunsForPromptMock.mockResolvedValueOnce([]);
    getRunsForPromptInWindowMock.mockResolvedValueOnce([
      mkRun({ id: 'r1', model: 'perplexity', response: longText }),
    ]);
    getCitationsForRunIdsMock.mockResolvedValueOnce([]);

    const { GET } = await import('@/app/api/prompts/[id]/route');
    const res = await GET(req(), ctx('p1'));
    const body = await res.json();
    const px = body.modelBreakdown.find((r: { model: string }) => r.model === 'perplexity');
    expect(px.latestResponseFull).toHaveLength(500);
    expect(px.latestResponseFull).toBe(longText);
  });

  it('returns the most recent runs (top 50) and their citations', async () => {
    getPromptMock.mockResolvedValueOnce(prompt());
    const r1 = mkRun({ id: 'r1', model: 'openai' });
    const r2 = mkRun({ id: 'r2', model: 'claude' });
    getRunsForPromptMock.mockResolvedValueOnce([r1, r2]);
    getRunsForPromptInWindowMock.mockResolvedValueOnce([r1, r2]);
    getCitationsForRunIdsMock.mockResolvedValueOnce([
      { id: 'c1', runId: 'r1', domain: 'example.com', url: 'https://example.com/a', domainType: 'Corporate', createdAt: '2026-01-03T00:00:00Z' },
      { id: 'c2', runId: 'r2', domain: 'foo.com', url: 'https://foo.com/x', domainType: 'UGC', createdAt: '2026-01-03T00:00:00Z' },
    ]);

    const { GET } = await import('@/app/api/prompts/[id]/route');
    const res = await GET(req(), ctx('p1'));
    const body = await res.json();
    expect(body.runs).toHaveLength(2);
    expect(body.citations).toHaveLength(2);
    expect(body.citations[0]).toEqual({
      domain: 'example.com',
      url: 'https://example.com/a',
      type: 'Corporate',
      runId: 'r1',
    });
    expect(getRunsForPromptMock).toHaveBeenCalledWith('p1', 50);
  });

  it('citationCount on a model row matches citations belonging to that model\'s latest run', async () => {
    getPromptMock.mockResolvedValueOnce(prompt());
    const r1 = mkRun({ id: 'r1', model: 'perplexity' });
    getRunsForPromptMock.mockResolvedValueOnce([r1]);
    getRunsForPromptInWindowMock.mockResolvedValueOnce([r1]);
    getCitationsForRunIdsMock.mockResolvedValueOnce([
      { id: 'c1', runId: 'r1', domain: 'a.com', url: 'https://a.com', domainType: 'Corporate', createdAt: '' },
      { id: 'c2', runId: 'r1', domain: 'b.com', url: 'https://b.com', domainType: 'Editorial', createdAt: '' },
      { id: 'c3', runId: 'r1', domain: 'c.com', url: 'https://c.com', domainType: 'UGC', createdAt: '' },
    ]);

    const { GET } = await import('@/app/api/prompts/[id]/route');
    const res = await GET(req(), ctx('p1'));
    const body = await res.json();
    const px = body.modelBreakdown.find((r: { model: string }) => r.model === 'perplexity');
    expect(px.citationCount).toBe(3);
  });

  it('honors days and model query params', async () => {
    getPromptMock.mockResolvedValue(prompt());
    getRunsForPromptMock.mockResolvedValue([]);
    getRunsForPromptInWindowMock.mockResolvedValue([]);
    getCitationsForRunIdsMock.mockResolvedValue([]);

    const { GET } = await import('@/app/api/prompts/[id]/route');
    await GET(req('?days=30&model=claude'), ctx('p1'));
    expect(getRunsForPromptInWindowMock).toHaveBeenLastCalledWith('p1', 30, 'claude');

    await GET(req('?days=30&model=all'), ctx('p1'));
    expect(getRunsForPromptInWindowMock).toHaveBeenLastCalledWith('p1', 30, undefined);

    await GET(req(), ctx('p1'));
    expect(getRunsForPromptInWindowMock).toHaveBeenLastCalledWith('p1', 7, undefined);
  });
});
