import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const generatePromptsMock = vi.fn();

vi.mock('@/lib/generators', () => ({
  generatePrompts: generatePromptsMock,
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

const SAMPLE_PROMPTS = [
  { text: 'best CRM for SMBs', topic: 'Category' },
  { text: 'top alternatives to hubspot', topic: 'Competitor' },
  { text: 'hubspot vs pipedrive vs zoho', topic: 'Affiliate' },
  { text: 'how to manage sales leads', topic: 'Core' },
  { text: 'free crm for small business', topic: 'Free tool' },
];

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api/onboarding/generate-prompts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  generatePromptsMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/onboarding/generate-prompts', () => {
  it('returns prompts on happy path (§9.4)', async () => {
    generatePromptsMock.mockResolvedValueOnce(SAMPLE_PROMPTS);

    const { POST } = await import('@/app/api/onboarding/generate-prompts/route');
    const res = await POST(
      jsonRequest({ crawlData: SAMPLE_CRAWL, domain: 'acme.com' }) as never,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.prompts).toEqual(SAMPLE_PROMPTS);
    expect(generatePromptsMock).toHaveBeenCalledWith(SAMPLE_CRAWL, 'acme.com');
  });

  it('returns 400 when domain is missing', async () => {
    const { POST } = await import('@/app/api/onboarding/generate-prompts/route');
    const res = await POST(
      jsonRequest({ crawlData: SAMPLE_CRAWL }) as never,
    );
    expect(res.status).toBe(400);
    expect(generatePromptsMock).not.toHaveBeenCalled();
  });

  it('returns 400 when crawlData is missing', async () => {
    const { POST } = await import('@/app/api/onboarding/generate-prompts/route');
    const res = await POST(jsonRequest({ domain: 'acme.com' }) as never);
    expect(res.status).toBe(400);
    expect(generatePromptsMock).not.toHaveBeenCalled();
  });

  it('returns 400 when crawlData is missing required fields', async () => {
    const partial = { title: 'x', description: 'y' };
    const { POST } = await import('@/app/api/onboarding/generate-prompts/route');
    const res = await POST(
      jsonRequest({ crawlData: partial, domain: 'acme.com' }) as never,
    );
    expect(res.status).toBe(400);
    expect(generatePromptsMock).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid JSON body', async () => {
    const req = new Request('http://localhost/api/onboarding/generate-prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    const { POST } = await import('@/app/api/onboarding/generate-prompts/route');
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });
});
