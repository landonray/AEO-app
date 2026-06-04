import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const primaryBrandExistsMock = vi.fn();
const transactionMock = vi.fn();
const queryMock = vi.fn();

vi.mock('@/lib/db', () => {
  const sqlFn = (text: string, params: unknown[]) => {
    queryMock(text, params);
    return { text, params };
  };
  (sqlFn as unknown as { transaction: (...a: unknown[]) => unknown }).transaction =
    (...args: unknown[]) => transactionMock(...args);
  return { sql: sqlFn };
});

vi.mock('@/lib/queries', () => ({
  primaryBrandExists: primaryBrandExistsMock,
}));

const VALID_BODY = {
  brandName: 'Acme',
  domain: 'acme.com',
  category: 'CRM',
  description: 'A CRM for SMBs',
  prompts: [
    { text: 'best CRM for SMBs', topic: 'Category' },
    { text: 'top alternatives to hubspot', topic: 'Competitor' },
  ],
  competitors: [
    { name: 'HubSpot', domain: 'hubspot.com' },
    { name: 'Pipedrive', domain: 'pipedrive.com' },
  ],
};

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/onboarding/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  primaryBrandExistsMock.mockReset();
  transactionMock.mockReset();
  queryMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/onboarding/complete', () => {
  it('happy path: inserts brand + competitors + prompts in one transaction (§9.6.a, §9.6.d)', async () => {
    primaryBrandExistsMock.mockResolvedValueOnce(false);
    transactionMock.mockResolvedValueOnce([[], [], []]);

    const { POST } = await import('@/app/api/onboarding/complete/route');
    const res = await POST(jsonRequest(VALID_BODY) as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.brandId).toBeTruthy();
    expect(typeof body.brandId).toBe('string');

    // One transaction call wrapping brand + competitors + prompts.
    expect(transactionMock).toHaveBeenCalledTimes(1);
    const txArgs = transactionMock.mock.calls[0][0] as unknown[];
    expect(Array.isArray(txArgs)).toBe(true);
    expect(txArgs.length).toBe(3);

    // Three underlying query() calls — one for each insert.
    expect(queryMock).toHaveBeenCalledTimes(3);

    // Each query references the SAME brand id (so child rows link to the brand).
    const brandQuery = queryMock.mock.calls[0];
    const competitorsQuery = queryMock.mock.calls[1];
    const promptsQuery = queryMock.mock.calls[2];

    expect(brandQuery[0]).toMatch(/INSERT INTO brands/i);
    expect(brandQuery[0]).toMatch(/is_primary/);
    expect(brandQuery[1][0]).toBe(body.brandId);

    expect(competitorsQuery[0]).toMatch(/INSERT INTO competitors/i);
    expect(competitorsQuery[1][0]).toBe(body.brandId);

    expect(promptsQuery[0]).toMatch(/INSERT INTO prompts/i);
    expect(promptsQuery[1][0]).toBe(body.brandId);
  });

  it('returns 409 when a primary brand already exists (§9.6.b)', async () => {
    primaryBrandExistsMock.mockResolvedValueOnce(true);

    const { POST } = await import('@/app/api/onboarding/complete/route');
    const res = await POST(jsonRequest(VALID_BODY) as never);

    expect(res.status).toBe(409);
    expect(transactionMock).not.toHaveBeenCalled();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('propagates transaction failure so all rows roll back (§9.6.c)', async () => {
    primaryBrandExistsMock.mockResolvedValueOnce(false);
    transactionMock.mockRejectedValueOnce(new Error('constraint violation'));

    const { POST } = await import('@/app/api/onboarding/complete/route');
    await expect(
      POST(jsonRequest(VALID_BODY) as never),
    ).rejects.toThrow('constraint violation');
    // sql.transaction wraps all 3 inserts; on failure Postgres rolls them back as one unit.
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when brandName is missing', async () => {
    const { POST } = await import('@/app/api/onboarding/complete/route');
    const res = await POST(
      jsonRequest({ ...VALID_BODY, brandName: '' }) as never,
    );
    expect(res.status).toBe(400);
    expect(primaryBrandExistsMock).not.toHaveBeenCalled();
  });

  it('returns 400 when domain is missing', async () => {
    const { POST } = await import('@/app/api/onboarding/complete/route');
    const res = await POST(
      jsonRequest({ ...VALID_BODY, domain: '' }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when prompts is empty', async () => {
    const { POST } = await import('@/app/api/onboarding/complete/route');
    const res = await POST(
      jsonRequest({ ...VALID_BODY, prompts: [] }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when competitors is empty', async () => {
    const { POST } = await import('@/app/api/onboarding/complete/route');
    const res = await POST(
      jsonRequest({ ...VALID_BODY, competitors: [] }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when a prompt is missing text or topic', async () => {
    const { POST } = await import('@/app/api/onboarding/complete/route');
    const res = await POST(
      jsonRequest({
        ...VALID_BODY,
        prompts: [{ text: 'only-text' }],
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when a competitor is missing name or domain', async () => {
    const { POST } = await import('@/app/api/onboarding/complete/route');
    const res = await POST(
      jsonRequest({
        ...VALID_BODY,
        competitors: [{ name: 'NoDomain' }],
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid JSON body', async () => {
    const req = new Request('http://localhost/api/onboarding/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const { POST } = await import('@/app/api/onboarding/complete/route');
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });
});
