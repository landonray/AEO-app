import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getPrimaryBrandMock = vi.fn();
const getPromptMock = vi.fn();
const listActivePromptsMock = vi.fn();
const listCompetitorsMock = vi.fn();
const runBatchMock = vi.fn();

vi.mock('@/lib/queries', () => ({
  getPrimaryBrand: getPrimaryBrandMock,
  getPrompt: getPromptMock,
  listActivePrompts: listActivePromptsMock,
  listCompetitors: listCompetitorsMock,
}));

vi.mock('@/lib/llm/orchestrator', () => ({
  runBatch: runBatchMock,
}));

beforeEach(() => {
  vi.resetModules();
  getPrimaryBrandMock.mockReset();
  getPromptMock.mockReset();
  listActivePromptsMock.mockReset();
  listCompetitorsMock.mockReset();
  runBatchMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

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

function req(body: unknown): Request {
  return new Request('http://localhost/api/prompts/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function batchResult(over: Record<string, unknown> = {}) {
  return {
    batchId: 'batch-test-uuid',
    results: [],
    totalRuns: 0,
    totalErrors: 0,
    runTotalCost: 0,
    ...over,
  };
}

describe('POST /api/prompts/run (§11.5)', () => {
  it('11.5.b — empty body runs all active prompts for the primary brand', async () => {
    getPrimaryBrandMock.mockResolvedValueOnce(brand());
    listActivePromptsMock.mockResolvedValueOnce([
      { id: 'p1', text: 'P1', topic: 'Core', isActive: true, tags: [], brandId: 'brand-1', createdAt: '2026-01-02T00:00:00Z' },
      { id: 'p2', text: 'P2', topic: 'Core', isActive: true, tags: [], brandId: 'brand-1', createdAt: '2026-01-02T00:00:00Z' },
    ]);
    listCompetitorsMock.mockResolvedValueOnce([
      { id: 'c1', name: 'Beta', domain: 'beta.io', brandId: 'brand-1', createdAt: '' },
    ]);
    runBatchMock.mockResolvedValueOnce(batchResult({ totalRuns: 10 }));

    const { POST } = await import('@/app/api/prompts/run/route');
    const res = await POST(req({}));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.batchId).toBe('batch-test-uuid');
    expect(body.totalRuns).toBe(10);
    expect(runBatchMock).toHaveBeenCalledTimes(1);
    expect(runBatchMock.mock.calls[0][0]).toEqual([
      { id: 'p1', text: 'P1' },
      { id: 'p2', text: 'P2' },
    ]);
  });

  it('11.5.a — { promptId } runs only that one prompt', async () => {
    getPrimaryBrandMock.mockResolvedValueOnce(brand());
    getPromptMock.mockResolvedValueOnce({
      id: 'p1',
      text: 'P1',
      topic: 'Core',
      isActive: true,
      tags: [],
      brandId: 'brand-1',
      createdAt: '2026-01-02T00:00:00Z',
    });
    listCompetitorsMock.mockResolvedValueOnce([]);
    runBatchMock.mockResolvedValueOnce(batchResult({ totalRuns: 5 }));

    const { POST } = await import('@/app/api/prompts/run/route');
    const res = await POST(req({ promptId: 'p1' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(listActivePromptsMock).not.toHaveBeenCalled();
    expect(runBatchMock.mock.calls[0][0]).toEqual([{ id: 'p1', text: 'P1' }]);
    expect(body.batchId).toBe('batch-test-uuid');
  });

  it('11.5.c — non-existent promptId returns 404', async () => {
    getPrimaryBrandMock.mockResolvedValueOnce(brand());
    getPromptMock.mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/prompts/run/route');
    const res = await POST(req({ promptId: 'nope' }));
    expect(res.status).toBe(404);
    expect(runBatchMock).not.toHaveBeenCalled();
  });

  it('11.5.c — promptId belonging to a different brand returns 404', async () => {
    getPrimaryBrandMock.mockResolvedValueOnce(brand());
    getPromptMock.mockResolvedValueOnce({
      id: 'p1',
      text: 'P1',
      topic: 'Core',
      isActive: true,
      tags: [],
      brandId: 'OTHER-BRAND',
      createdAt: '2026-01-02T00:00:00Z',
    });
    const { POST } = await import('@/app/api/prompts/run/route');
    const res = await POST(req({ promptId: 'p1' }));
    expect(res.status).toBe(404);
    expect(runBatchMock).not.toHaveBeenCalled();
  });

  it('11.5.d — returns BatchResult shape with batchId even on single-prompt runs', async () => {
    getPrimaryBrandMock.mockResolvedValueOnce(brand());
    getPromptMock.mockResolvedValueOnce({
      id: 'p1',
      text: 'P1',
      topic: 'Core',
      isActive: true,
      tags: [],
      brandId: 'brand-1',
      createdAt: '',
    });
    listCompetitorsMock.mockResolvedValueOnce([]);
    runBatchMock.mockResolvedValueOnce(
      batchResult({
        batchId: 'batch-single',
        totalRuns: 5,
        totalErrors: 0,
        runTotalCost: 0.0123,
      }),
    );
    const { POST } = await import('@/app/api/prompts/run/route');
    const res = await POST(req({ promptId: 'p1' }));
    const body = await res.json();
    expect(body).toMatchObject({
      batchId: 'batch-single',
      totalRuns: 5,
      totalErrors: 0,
      runTotalCost: 0.0123,
    });
    expect(Array.isArray(body.results)).toBe(true);
  });

  it('returns 409 when no primary brand exists', async () => {
    getPrimaryBrandMock.mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/prompts/run/route');
    const res = await POST(req({}));
    expect(res.status).toBe(409);
    expect(runBatchMock).not.toHaveBeenCalled();
  });
});
