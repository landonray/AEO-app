import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getPrimaryBrandMock = vi.fn();

vi.mock('@/lib/queries', () => ({
  getPrimaryBrand: getPrimaryBrandMock,
}));

beforeEach(() => {
  vi.resetModules();
  getPrimaryBrandMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /api/brand', () => {
  it('returns { brand: null } when no primary brand exists (§11.1)', async () => {
    getPrimaryBrandMock.mockResolvedValueOnce(null);

    const { GET } = await import('@/app/api/brand/route');
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ brand: null });
  });

  it('returns only the documented fields when a primary brand exists', async () => {
    getPrimaryBrandMock.mockResolvedValueOnce({
      id: 'brand-uuid-1',
      name: 'Acme',
      domain: 'acme.com',
      isPrimary: true,
      category: 'CRM',
      description: 'A CRM for SMBs',
      createdAt: '2026-01-01T00:00:00Z',
    });

    const { GET } = await import('@/app/api/brand/route');
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.brand).toEqual({
      id: 'brand-uuid-1',
      name: 'Acme',
      domain: 'acme.com',
      category: 'CRM',
      description: 'A CRM for SMBs',
    });
    // Documented field allowlist — must NOT leak isPrimary, createdAt, or other internals.
    const keys = Object.keys(body.brand).sort();
    expect(keys).toEqual(['category', 'description', 'domain', 'id', 'name']);
  });

  it('passes through null category and description', async () => {
    getPrimaryBrandMock.mockResolvedValueOnce({
      id: 'brand-uuid-2',
      name: 'Acme',
      domain: 'acme.com',
      isPrimary: true,
      category: null,
      description: null,
      createdAt: '2026-01-01T00:00:00Z',
    });

    const { GET } = await import('@/app/api/brand/route');
    const res = await GET();
    const body = await res.json();

    expect(body.brand).toEqual({
      id: 'brand-uuid-2',
      name: 'Acme',
      domain: 'acme.com',
      category: null,
      description: null,
    });
  });
});
