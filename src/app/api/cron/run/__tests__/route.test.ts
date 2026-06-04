import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getPrimaryBrandMock = vi.fn();
const listActivePromptsMock = vi.fn();
const listCompetitorsMock = vi.fn();
const runBatchMock = vi.fn();

vi.mock('@/lib/queries', () => ({
  getPrimaryBrand: getPrimaryBrandMock,
  listActivePrompts: listActivePromptsMock,
  listCompetitors: listCompetitorsMock,
}));

vi.mock('@/lib/llm/orchestrator', () => ({
  runBatch: runBatchMock,
}));

const TEST_SECRET = 'super-secret-cron-token-1234567890';

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:4810/api/cron/run', {
    method: 'POST',
    headers,
  });
}

const PRIMARY_BRAND = {
  id: 'brand-1',
  name: 'Acme',
  domain: 'acme.com',
  isPrimary: true,
  category: 'CRM',
  description: 'A CRM',
  createdAt: '2026-01-01T00:00:00Z',
};

const COMPETITORS = [
  { id: 'c-1', name: 'Beta', domain: 'beta.io', brandId: 'brand-1', createdAt: '2026-01-01T00:00:00Z' },
];

const ACTIVE_PROMPTS = [
  { id: 'p-1', text: 'Best CRM?', topic: 'Category', tags: [], isActive: true, brandId: 'brand-1', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'p-2', text: 'Top SaaS?', topic: 'Category', tags: [], isActive: true, brandId: 'brand-1', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'p-3', text: 'CRM alternatives', topic: 'Competitor', tags: [], isActive: true, brandId: 'brand-1', createdAt: '2026-01-01T00:00:00Z' },
];

const STANDARD_BATCH_RESULT = {
  batchId: 'batch-abc-123',
  results: [],
  totalRuns: 15,
  totalErrors: 0,
  runTotalCost: 0.42,
};

beforeEach(() => {
  vi.resetModules();
  process.env.CRON_SECRET = TEST_SECRET;
  getPrimaryBrandMock.mockReset();
  listActivePromptsMock.mockReset();
  listCompetitorsMock.mockReset();
  runBatchMock.mockReset();

  getPrimaryBrandMock.mockResolvedValue(PRIMARY_BRAND);
  listActivePromptsMock.mockResolvedValue(ACTIVE_PROMPTS);
  listCompetitorsMock.mockResolvedValue(COMPETITORS);
  runBatchMock.mockResolvedValue(STANDARD_BATCH_RESULT);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.CRON_SECRET;
});

describe('POST /api/cron/run — bearer auth (§10.1)', () => {
  it('10.1.a returns 200 with the matching bearer', async () => {
    const { POST } = await import('@/app/api/cron/run/route');
    const res = await POST(
      makeRequest({ authorization: `Bearer ${TEST_SECRET}` }) as never,
    );
    expect(res.status).toBe(200);
  });

  it('10.1.b returns 401 with an empty body when the Authorization header is missing', async () => {
    const { POST } = await import('@/app/api/cron/run/route');
    const res = await POST(makeRequest() as never);
    expect(res.status).toBe(401);
    const text = await res.text();
    expect(text).toBe('');
    expect(runBatchMock).not.toHaveBeenCalled();
  });

  it('10.1.c returns 401 with an empty body when the bearer is wrong (same length)', async () => {
    const wrong = 'X'.repeat(TEST_SECRET.length);
    const { POST } = await import('@/app/api/cron/run/route');
    const res = await POST(
      makeRequest({ authorization: `Bearer ${wrong}` }) as never,
    );
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('');
    expect(runBatchMock).not.toHaveBeenCalled();
  });

  it('10.1.c also rejects a wrong bearer of a different length without crashing', async () => {
    const { POST } = await import('@/app/api/cron/run/route');
    const res = await POST(
      makeRequest({ authorization: 'Bearer short' }) as never,
    );
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('');
    expect(runBatchMock).not.toHaveBeenCalled();
  });

  it('rejects an Authorization header that does not use the Bearer scheme', async () => {
    const { POST } = await import('@/app/api/cron/run/route');
    const res = await POST(
      makeRequest({ authorization: `Basic ${TEST_SECRET}` }) as never,
    );
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('');
  });
});

describe('POST /api/cron/run — constant-time comparison (§10.1.d, §14.2)', () => {
  it('uses crypto.timingSafeEqual for the secret comparison', async () => {
    // Structural check: the route source must rely on a constant-time
    // primitive, not on `===` for the secret comparison. Re-reading the
    // file lets us assert that without relying on flaky timing tests.
    const routePath = path.resolve(
      process.cwd(),
      'src/app/api/cron/run/route.ts',
    );
    const source = await readFile(routePath, 'utf8');
    expect(source).toMatch(/timingSafeEqual/);
    // Should also not short-circuit via a plain `===` on the secret.
    expect(source).not.toMatch(/secret\s*===\s*provided/);
    expect(source).not.toMatch(/provided\s*===\s*secret/);
  });
});

describe('POST /api/cron/run — loads only active prompts of the primary brand (§10.2)', () => {
  it('reads the primary brand, its active prompts, and its competitors only', async () => {
    const { POST } = await import('@/app/api/cron/run/route');
    await POST(
      makeRequest({ authorization: `Bearer ${TEST_SECRET}` }) as never,
    );

    expect(getPrimaryBrandMock).toHaveBeenCalledTimes(1);
    expect(listActivePromptsMock).toHaveBeenCalledTimes(1);
    expect(listActivePromptsMock).toHaveBeenCalledWith(PRIMARY_BRAND.id);
    expect(listCompetitorsMock).toHaveBeenCalledTimes(1);
    expect(listCompetitorsMock).toHaveBeenCalledWith(PRIMARY_BRAND.id);

    expect(runBatchMock).toHaveBeenCalledTimes(1);
    const [promptsArg, brandArg, competitorsArg] = runBatchMock.mock.calls[0];
    expect(promptsArg).toEqual([
      { id: 'p-1', text: 'Best CRM?' },
      { id: 'p-2', text: 'Top SaaS?' },
      { id: 'p-3', text: 'CRM alternatives' },
    ]);
    expect(brandArg).toEqual({ name: 'Acme', domain: 'acme.com' });
    expect(competitorsArg).toEqual([{ name: 'Beta', domain: 'beta.io' }]);
  });
});

describe('POST /api/cron/run — batch summary (§10.3)', () => {
  it('returns { ok, batchId, totalRuns, totalErrors }', async () => {
    const { POST } = await import('@/app/api/cron/run/route');
    const res = await POST(
      makeRequest({ authorization: `Bearer ${TEST_SECRET}` }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      batchId: 'batch-abc-123',
      totalRuns: 15,
      totalErrors: 0,
    });
  });
});

describe('POST /api/cron/run — per-call failures stay 200 (§10.4)', () => {
  it('returns 200 even when some calls failed inside the batch', async () => {
    runBatchMock.mockResolvedValueOnce({
      batchId: 'batch-with-errors',
      results: [],
      totalRuns: 12,
      totalErrors: 3,
      runTotalCost: 0.1,
    });

    const { POST } = await import('@/app/api/cron/run/route');
    const res = await POST(
      makeRequest({ authorization: `Bearer ${TEST_SECRET}` }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      batchId: 'batch-with-errors',
      totalRuns: 12,
      totalErrors: 3,
    });
  });
});

describe('POST /api/cron/run — internal failures (§10.5)', () => {
  it('returns 500 when the primary brand query fails (DB unreachable)', async () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    getPrimaryBrandMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

    const { POST } = await import('@/app/api/cron/run/route');
    const res = await POST(
      makeRequest({ authorization: `Bearer ${TEST_SECRET}` }) as never,
    );
    expect(res.status).toBe(500);
    expect(consoleErr).toHaveBeenCalled();
  });

  it('returns 500 when listing active prompts fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    listActivePromptsMock.mockRejectedValueOnce(new Error('relation does not exist'));

    const { POST } = await import('@/app/api/cron/run/route');
    const res = await POST(
      makeRequest({ authorization: `Bearer ${TEST_SECRET}` }) as never,
    );
    expect(res.status).toBe(500);
  });

  it('returns 500 when CRON_SECRET is not configured on the server', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    delete process.env.CRON_SECRET;

    const { POST } = await import('@/app/api/cron/run/route');
    const res = await POST(
      makeRequest({ authorization: 'Bearer anything' }) as never,
    );
    expect(res.status).toBe(500);
  });

  it('returns 500 when no primary brand has been onboarded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getPrimaryBrandMock.mockResolvedValueOnce(null);

    const { POST } = await import('@/app/api/cron/run/route');
    const res = await POST(
      makeRequest({ authorization: `Bearer ${TEST_SECRET}` }) as never,
    );
    expect(res.status).toBe(500);
    expect(runBatchMock).not.toHaveBeenCalled();
  });
});
