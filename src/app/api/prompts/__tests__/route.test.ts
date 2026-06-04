import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const archivePromptMock = vi.fn();
const getPrimaryBrandMock = vi.fn();
const insertPromptMock = vi.fn();
const listActivePromptsMock = vi.fn();

vi.mock('@/lib/queries', () => ({
  archivePrompt: archivePromptMock,
  getPrimaryBrand: getPrimaryBrandMock,
  insertPrompt: insertPromptMock,
  listActivePrompts: listActivePromptsMock,
}));

beforeEach(() => {
  vi.resetModules();
  archivePromptMock.mockReset();
  getPrimaryBrandMock.mockReset();
  insertPromptMock.mockReset();
  listActivePromptsMock.mockReset();
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
    category: 'CRM',
    description: 'A CRM',
    createdAt: '2026-01-01T00:00:00Z',
  };
}

describe('GET /api/prompts', () => {
  it('returns empty list when no primary brand', async () => {
    getPrimaryBrandMock.mockResolvedValueOnce(null);
    const { GET } = await import('@/app/api/prompts/route');
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ prompts: [] });
  });

  it('returns the active prompts for the primary brand', async () => {
    getPrimaryBrandMock.mockResolvedValueOnce(brand());
    listActivePromptsMock.mockResolvedValueOnce([
      { id: 'p1', text: 'Best CRM?', topic: 'Category', isActive: true, tags: [], brandId: 'brand-1', createdAt: '2026-01-02T00:00:00Z' },
    ]);
    const { GET } = await import('@/app/api/prompts/route');
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.prompts).toHaveLength(1);
    expect(body.prompts[0].id).toBe('p1');
    expect(listActivePromptsMock).toHaveBeenCalledWith('brand-1');
  });
});

describe('POST /api/prompts (§11.7)', () => {
  function postReq(body: unknown): Request {
    return new Request('http://localhost/api/prompts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  it('returns 400 when body is empty', async () => {
    const { POST } = await import('@/app/api/prompts/route');
    const res = await POST(postReq(undefined));
    expect(res.status).toBe(400);
  });

  it('returns 400 when text is missing', async () => {
    const { POST } = await import('@/app/api/prompts/route');
    const res = await POST(postReq({ topic: 'Core' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when topic is missing', async () => {
    const { POST } = await import('@/app/api/prompts/route');
    const res = await POST(postReq({ text: 'hi' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when text is whitespace-only', async () => {
    const { POST } = await import('@/app/api/prompts/route');
    const res = await POST(postReq({ text: '   ', topic: 'Core' }));
    expect(res.status).toBe(400);
  });

  it('creates the prompt under the primary brand and returns { id }', async () => {
    getPrimaryBrandMock.mockResolvedValueOnce(brand());
    insertPromptMock.mockResolvedValueOnce({
      id: 'p-new',
      text: 'new prompt',
      topic: 'Core',
      isActive: true,
      tags: [],
      brandId: 'brand-1',
      createdAt: '2026-01-03T00:00:00Z',
    });
    const { POST } = await import('@/app/api/prompts/route');
    const res = await POST(postReq({ text: ' new prompt ', topic: ' Core ' }));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body).toEqual({ id: 'p-new' });
    expect(insertPromptMock).toHaveBeenCalledWith('brand-1', {
      text: 'new prompt',
      topic: 'Core',
    });
  });

  it('returns 409 when there is no primary brand', async () => {
    getPrimaryBrandMock.mockResolvedValueOnce(null);
    const { POST } = await import('@/app/api/prompts/route');
    const res = await POST(postReq({ text: 'x', topic: 'Core' }));
    expect(res.status).toBe(409);
    expect(insertPromptMock).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/prompts (§11.8)', () => {
  function delReq(body: unknown): Request {
    return new Request('http://localhost/api/prompts', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  it('returns 400 when id is missing', async () => {
    const { DELETE } = await import('@/app/api/prompts/route');
    const res = await DELETE(delReq({}));
    expect(res.status).toBe(400);
    expect(archivePromptMock).not.toHaveBeenCalled();
  });

  it('archives (does NOT delete) and returns { ok: true }', async () => {
    archivePromptMock.mockResolvedValueOnce(undefined);
    const { DELETE } = await import('@/app/api/prompts/route');
    const res = await DELETE(delReq({ id: 'p1' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(archivePromptMock).toHaveBeenCalledWith('p1');
  });
});
