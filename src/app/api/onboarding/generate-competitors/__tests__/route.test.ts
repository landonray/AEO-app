import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const generateCompetitorsMock = vi.fn();

vi.mock('@/lib/generators', () => ({
  generateCompetitors: generateCompetitorsMock,
}));

const SAMPLE_CRAWL = {
  title: 'Acme',
  description: 'A CRM for SMBs',
  category: 'CRM',
  targetAudience: 'SMB owners',
  coreUseCase: 'manage leads',
  features: ['pipelines'],
  integrations: ['stripe'],
  competitorHints: ['hubspot'],
};

const SAMPLE_COMPETITORS = [
  { name: 'HubSpot', domain: 'hubspot.com' },
  { name: 'Pipedrive', domain: 'pipedrive.com' },
  { name: 'Zoho', domain: 'zoho.com' },
  { name: 'Salesforce', domain: 'salesforce.com' },
];

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/onboarding/generate-competitors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  generateCompetitorsMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/onboarding/generate-competitors', () => {
  it('returns competitors on happy path (§9.5)', async () => {
    generateCompetitorsMock.mockResolvedValueOnce(SAMPLE_COMPETITORS);

    const { POST } = await import(
      '@/app/api/onboarding/generate-competitors/route'
    );
    const res = await POST(
      jsonRequest({ crawlData: SAMPLE_CRAWL, domain: 'acme.com' }) as never,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.competitors).toEqual(SAMPLE_COMPETITORS);
    expect(generateCompetitorsMock).toHaveBeenCalledWith(SAMPLE_CRAWL, 'acme.com');
  });

  it('returns 400 when domain is missing', async () => {
    const { POST } = await import(
      '@/app/api/onboarding/generate-competitors/route'
    );
    const res = await POST(jsonRequest({ crawlData: SAMPLE_CRAWL }) as never);
    expect(res.status).toBe(400);
    expect(generateCompetitorsMock).not.toHaveBeenCalled();
  });

  it('returns 400 when crawlData is missing', async () => {
    const { POST } = await import(
      '@/app/api/onboarding/generate-competitors/route'
    );
    const res = await POST(jsonRequest({ domain: 'acme.com' }) as never);
    expect(res.status).toBe(400);
    expect(generateCompetitorsMock).not.toHaveBeenCalled();
  });

  it('returns 400 when crawlData is missing required fields', async () => {
    const partial = { title: 'x' };
    const { POST } = await import(
      '@/app/api/onboarding/generate-competitors/route'
    );
    const res = await POST(
      jsonRequest({ crawlData: partial, domain: 'acme.com' }) as never,
    );
    expect(res.status).toBe(400);
    expect(generateCompetitorsMock).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid JSON body', async () => {
    const req = new Request(
      'http://localhost/api/onboarding/generate-competitors',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      },
    );
    const { POST } = await import(
      '@/app/api/onboarding/generate-competitors/route'
    );
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });
});
