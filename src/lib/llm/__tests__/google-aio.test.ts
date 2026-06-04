import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { callGoogleAIO } from '@/lib/llm/google-aio';
import aioFixture from '@/lib/llm/__fixtures__/dfs-aio.json';
import featuredFixture from '@/lib/llm/__fixtures__/dfs-featured.json';
import emptyFixture from '@/lib/llm/__fixtures__/dfs-empty.json';

const ENDPOINT =
  'https://api.dataforseo.com/v3/serp/google/organic/live/advanced';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function jsonResponse(body: unknown, status = 200, statusText = 'OK'): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ORIGINAL_ENV = {
  DATAFORSEO_LOGIN: process.env.DATAFORSEO_LOGIN,
  DATAFORSEO_PASSWORD: process.env.DATAFORSEO_PASSWORD,
};

describe('callGoogleAIO', () => {
  beforeEach(() => {
    process.env.DATAFORSEO_LOGIN = 'test-login';
    process.env.DATAFORSEO_PASSWORD = 'test-pass';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (ORIGINAL_ENV.DATAFORSEO_LOGIN === undefined) {
      delete process.env.DATAFORSEO_LOGIN;
    } else {
      process.env.DATAFORSEO_LOGIN = ORIGINAL_ENV.DATAFORSEO_LOGIN;
    }
    if (ORIGINAL_ENV.DATAFORSEO_PASSWORD === undefined) {
      delete process.env.DATAFORSEO_PASSWORD;
    } else {
      process.env.DATAFORSEO_PASSWORD = ORIGINAL_ENV.DATAFORSEO_PASSWORD;
    }
  });

  describe('§6.1 request shape', () => {
    it('POSTs the live/advanced endpoint with HTTP Basic auth and the US-en payload', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(clone(aioFixture)));

      await callGoogleAIO('best CRM for SMBs', { fetchImpl: fetchMock });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(ENDPOINT);
      const reqInit = init as RequestInit;
      expect(reqInit.method).toBe('POST');

      const headers = reqInit.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');

      const expectedAuth = Buffer.from('test-login:test-pass').toString('base64');
      expect(headers.Authorization).toBe(`Basic ${expectedAuth}`);

      expect(typeof reqInit.body).toBe('string');
      const parsedBody = JSON.parse(reqInit.body as string);
      expect(parsedBody).toEqual([
        {
          language_code: 'en',
          location_code: 2840,
          keyword: 'best CRM for SMBs',
          depth: 10,
        },
      ]);
    });

    it('does not put credentials in the body or query string', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(clone(aioFixture)));

      await callGoogleAIO('best CRM', { fetchImpl: fetchMock });

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(String(url)).not.toContain('test-login');
      expect(String(url)).not.toContain('test-pass');
      const body = (init as RequestInit).body as string;
      expect(body).not.toContain('test-login');
      expect(body).not.toContain('test-pass');
    });

    it('throws a clear error when DATAFORSEO_LOGIN is missing', async () => {
      delete process.env.DATAFORSEO_LOGIN;
      const fetchMock = vi.fn<typeof fetch>();
      await expect(
        callGoogleAIO('x', { fetchImpl: fetchMock }),
      ).rejects.toThrow(/DATAFORSEO_LOGIN/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws a clear error when DATAFORSEO_PASSWORD is missing', async () => {
      delete process.env.DATAFORSEO_PASSWORD;
      const fetchMock = vi.fn<typeof fetch>();
      await expect(
        callGoogleAIO('x', { fetchImpl: fetchMock }),
      ).rejects.toThrow(/DATAFORSEO_PASSWORD/);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('§6.2 AI Overview present', () => {
    it('returns the markdown text and the references[].url list', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(clone(aioFixture)));

      const result = await callGoogleAIO('best CRM for SMBs', {
        fetchImpl: fetchMock,
      });

      expect(result.content).toBeTypeOf('string');
      expect(result.content).toContain('Acme CRM is widely recommended');
      expect(result.citations).toEqual([
        'https://acme.com/pricing',
        'https://www.g2.com/categories/crm',
        'https://beta.io/overview',
      ]);
    });

    it('concatenates items[].text when markdown is absent', async () => {
      const fixture = clone(aioFixture);
      const aio = fixture.tasks[0].result[0].items.find(
        (i) => i.type === 'ai_overview',
      );
      if (!aio) throw new Error('test fixture missing ai_overview');
      delete (aio as { markdown?: string }).markdown;

      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(fixture));

      const result = await callGoogleAIO('best CRM for SMBs', {
        fetchImpl: fetchMock,
      });

      expect(result.content).toContain(
        'Acme CRM is widely recommended for SMBs',
      );
      expect(result.content).toContain(
        'Beta and Charlie are also frequently mentioned',
      );
    });

    it('dedupes duplicate reference URLs', async () => {
      const fixture = clone(aioFixture);
      const aio = fixture.tasks[0].result[0].items.find(
        (i) => i.type === 'ai_overview',
      );
      if (!aio || !Array.isArray(aio.references)) {
        throw new Error('test fixture missing ai_overview references');
      }
      aio.references.push({ url: 'https://acme.com/pricing', domain: 'acme.com' });

      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(fixture));

      const result = await callGoogleAIO('best CRM', { fetchImpl: fetchMock });
      const occurrences = result.citations.filter(
        (u) => u === 'https://acme.com/pricing',
      ).length;
      expect(occurrences).toBe(1);
    });
  });

  describe('§6.3 AI Overview absent — falls back to featured snippet', () => {
    it('returns the featured snippet text and its links as citations', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(clone(featuredFixture)));

      const result = await callGoogleAIO(
        'how to migrate from spreadsheet to crm',
        { fetchImpl: fetchMock },
      );

      expect(result.content).toBeTypeOf('string');
      expect(result.content).toContain('Export your spreadsheet as CSV');
      expect(result.citations).toContain(
        'https://acme.com/guides/migrate-from-spreadsheets',
      );
      expect(result.citations).toContain('https://acme.com/docs/csv-import');
    });

    it('prefers ai_overview over featured_snippet when both are present', async () => {
      const fixture = clone(aioFixture);
      fixture.tasks[0].result[0].items.unshift({
        type: 'featured_snippet',
        description: 'Should NOT be returned.',
        url: 'https://wrong.example.com',
      } as never);

      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(fixture));

      const result = await callGoogleAIO('best CRM', { fetchImpl: fetchMock });
      expect(result.content).not.toContain('Should NOT be returned');
      expect(result.citations).not.toContain('https://wrong.example.com');
    });
  });

  describe('§6.4 Neither AI Overview nor featured snippet', () => {
    it('returns null content and an empty citation list, with cost preserved', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(clone(emptyFixture)));

      const result = await callGoogleAIO('obscure query', {
        fetchImpl: fetchMock,
      });

      expect(result.content).toBeNull();
      expect(result.citations).toEqual([]);
      expect(result.estimatedCost).toBe(0.001);
    });

    it('survives a completely missing items array', async () => {
      const fixture = clone(emptyFixture);
      delete (fixture.tasks[0].result[0] as { items?: unknown }).items;

      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(fixture));

      const result = await callGoogleAIO('q', { fetchImpl: fetchMock });
      expect(result.content).toBeNull();
      expect(result.citations).toEqual([]);
    });

    it('survives a completely missing result array', async () => {
      const fixture = clone(emptyFixture);
      delete (fixture.tasks[0] as { result?: unknown }).result;

      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(fixture));

      const result = await callGoogleAIO('q', { fetchImpl: fetchMock });
      expect(result.content).toBeNull();
      expect(result.citations).toEqual([]);
    });
  });

  describe('§6.5 cost handling', () => {
    it('stores tasks[0].cost as estimatedCost in USD', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(clone(aioFixture)));

      const result = await callGoogleAIO('best CRM', { fetchImpl: fetchMock });
      expect(result.estimatedCost).toBe(0.0025);
    });

    it('returns null estimatedCost when the cost field is missing', async () => {
      const fixture = clone(aioFixture);
      delete (fixture.tasks[0] as { cost?: unknown }).cost;

      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(fixture));

      const result = await callGoogleAIO('best CRM', { fetchImpl: fetchMock });
      expect(result.estimatedCost).toBeNull();
    });

    it('returns null estimatedCost when cost is not a number', async () => {
      const fixture = clone(aioFixture);
      (fixture.tasks[0] as { cost?: unknown }).cost = 'free';

      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse(fixture));

      const result = await callGoogleAIO('best CRM', { fetchImpl: fetchMock });
      expect(result.estimatedCost).toBeNull();
    });
  });

  describe('§6.6 auth failure or 5xx', () => {
    it('throws on a 401 response so the orchestrator can log+skip', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }),
        );

      await expect(
        callGoogleAIO('x', { fetchImpl: fetchMock }),
      ).rejects.toThrow(/401/);
    });

    it('throws on a 500 response', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response('Server error', { status: 500, statusText: 'Internal' }),
        );

      await expect(
        callGoogleAIO('x', { fetchImpl: fetchMock }),
      ).rejects.toThrow(/500/);
    });

    it('throws on a network error', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(
        callGoogleAIO('x', { fetchImpl: fetchMock }),
      ).rejects.toThrow(/ECONNREFUSED|network/i);
    });

    it('throws when the body is not JSON', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response('<html>not json</html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          }),
        );

      await expect(
        callGoogleAIO('x', { fetchImpl: fetchMock }),
      ).rejects.toThrow(/non-JSON/);
    });

    it('error messages do not leak the credentials', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response('nope', { status: 403, statusText: 'Forbidden' }),
        );

      try {
        await callGoogleAIO('x', { fetchImpl: fetchMock });
        throw new Error('should have thrown');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        expect(message).not.toContain('test-login');
        expect(message).not.toContain('test-pass');
      }
    });
  });
});
