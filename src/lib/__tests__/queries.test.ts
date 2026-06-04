import { describe, it, expect } from 'vitest';
import {
  buildGetPrimaryBrand,
  buildPrimaryBrandExists,
  buildInsertBrand,
  buildInsertCompetitors,
  buildListCompetitors,
  buildInsertPrompts,
  buildInsertPrompt,
  buildListPrompts,
  buildListActivePrompts,
  buildArchivePrompt,
  buildGetPrompt,
  buildInsertRun,
  buildGetRuns,
  buildGetRunsForPrompt,
  buildGetLatestRunPerModelPerPrompt,
  buildInsertCitations,
  buildGetCitations,
  buildGetCitationsForRunIds,
  buildGetRunsForPromptInWindow,
  buildCheckTables,
  buildGetLastRunTimestamp,
  type BuiltQuery,
} from '@/lib/queries';

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

function maxPlaceholder(sql: string): number {
  const matches = sql.match(/\$(\d+)/g) ?? [];
  let max = 0;
  for (const m of matches) {
    const n = Number(m.slice(1));
    if (n > max) max = n;
  }
  return max;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx >= 0) {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

// --------------------------------------------------------------------------
// QA §2.5 — parameterized SQL only (no string interpolation of inputs)
// --------------------------------------------------------------------------

describe('queries: §2.5 parameterized SQL only', () => {
  const sentinelStrings = [
    "Acme'; DROP TABLE brands;--",
    "user' OR 1=1--",
    'brand-id-with-quotes\'--',
  ];

  const builders: { name: string; build: () => BuiltQuery }[] = [
    { name: 'buildGetPrimaryBrand', build: () => buildGetPrimaryBrand() },
    { name: 'buildPrimaryBrandExists', build: () => buildPrimaryBrandExists() },
    {
      name: 'buildInsertBrand',
      build: () =>
        buildInsertBrand({
          name: sentinelStrings[0],
          domain: 'acme.com',
          category: null,
          description: null,
        }),
    },
    {
      name: 'buildInsertCompetitors',
      build: () =>
        buildInsertCompetitors('00000000-0000-0000-0000-000000000001', [
          { name: 'Beta', domain: 'beta.com' },
          { name: 'Gamma', domain: 'gamma.com' },
        ]),
    },
    {
      name: 'buildListCompetitors',
      build: () => buildListCompetitors(sentinelStrings[2]),
    },
    {
      name: 'buildInsertPrompts',
      build: () =>
        buildInsertPrompts('brand-1', [
          { text: 'p1', topic: 'Core' },
          { text: 'p2; DROP', topic: 'Free tool' },
        ]),
    },
    {
      name: 'buildInsertPrompt',
      build: () =>
        buildInsertPrompt('brand-1', { text: 'hello', topic: 'Core' }),
    },
    { name: 'buildListPrompts', build: () => buildListPrompts('brand-1') },
    {
      name: 'buildListActivePrompts',
      build: () => buildListActivePrompts('brand-1'),
    },
    { name: 'buildArchivePrompt', build: () => buildArchivePrompt('p-1') },
    { name: 'buildGetPrompt', build: () => buildGetPrompt('p-1') },
    {
      name: 'buildInsertRun',
      build: () =>
        buildInsertRun({
          promptId: 'p-1',
          model: 'openai',
          response: sentinelStrings[1],
          mentioned: true,
          positionScore: 4,
          sentiment: 'positive',
          competitorMentions: { Beta: true },
          estimatedCost: 0.001,
        }),
    },
    {
      name: 'buildGetRuns (no model)',
      build: () => buildGetRuns({ brandId: 'brand-1', days: 7 }),
    },
    {
      name: 'buildGetRuns (with model)',
      build: () => buildGetRuns({ brandId: 'brand-1', days: 7, model: 'claude' }),
    },
    {
      name: 'buildGetRunsForPrompt',
      build: () => buildGetRunsForPrompt('p-1', 50),
    },
    {
      name: 'buildGetLatestRunPerModelPerPrompt',
      build: () =>
        buildGetLatestRunPerModelPerPrompt({ brandId: 'brand-1', days: 30 }),
    },
    {
      name: 'buildInsertCitations',
      build: () =>
        buildInsertCitations('run-1', [
          {
            domain: 'techcrunch.com',
            url: 'https://techcrunch.com/x',
            domainType: 'Editorial',
          },
          {
            domain: 'reddit.com',
            url: 'https://reddit.com/r/x',
            domainType: 'UGC',
          },
        ]),
    },
    {
      name: 'buildGetCitations',
      build: () =>
        buildGetCitations({ brandId: 'brand-1', days: 90, model: 'perplexity' }),
    },
    {
      name: 'buildGetCitationsForRunIds',
      build: () => buildGetCitationsForRunIds(['r1', 'r2']),
    },
    {
      name: 'buildGetRunsForPromptInWindow',
      build: () =>
        buildGetRunsForPromptInWindow('p-1', 30, 'claude'),
    },
    { name: 'buildCheckTables', build: () => buildCheckTables() },
    {
      name: 'buildGetLastRunTimestamp',
      build: () => buildGetLastRunTimestamp('brand-1'),
    },
  ];

  it('every builder produces a sql string and a params array', () => {
    for (const { name, build } of builders) {
      const built = build();
      expect(typeof built.sql, name).toBe('string');
      expect(Array.isArray(built.params), name).toBe(true);
    }
  });

  it('no builder interpolates sentinel input strings into the SQL', () => {
    for (const { name, build } of builders) {
      const built = build();
      for (const sentinel of sentinelStrings) {
        expect(built.sql.includes(sentinel), `${name} contains sentinel ${sentinel}`)
          .toBe(false);
      }
    }
  });

  it('the highest placeholder index never exceeds params.length', () => {
    for (const { name, build } of builders) {
      const built = build();
      const max = maxPlaceholder(built.sql);
      expect(max, name).toBeLessThanOrEqual(built.params.length);
    }
  });

  it('every params slot is covered by at least one placeholder', () => {
    for (const { name, build } of builders) {
      const built = build();
      if (built.params.length === 0) continue;
      const max = maxPlaceholder(built.sql);
      expect(max, name).toBeGreaterThanOrEqual(built.params.length);
    }
  });
});

// --------------------------------------------------------------------------
// QA §2.6 — date filter uses parameterized interval
// --------------------------------------------------------------------------

describe('queries: §2.6 date interval is parameterized', () => {
  it('getRuns uses now() - ($n || \' days\')::interval with the bound param', () => {
    const built = buildGetRuns({ brandId: 'brand-1', days: 7 });
    const sql = normalize(built.sql);
    expect(sql).toMatch(/now\(\)\s*-\s*\(\$\d+\s*\|\|\s*' days'\)::interval/);
    expect(sql.includes("'7 days'")).toBe(false);
    expect(built.params).toContain('7');
  });

  it('getCitations uses now() - ($n || \' days\')::interval with the bound param', () => {
    const built = buildGetCitations({ brandId: 'brand-1', days: 30 });
    const sql = normalize(built.sql);
    expect(sql).toMatch(/now\(\)\s*-\s*\(\$\d+\s*\|\|\s*' days'\)::interval/);
    expect(sql.includes("'30 days'")).toBe(false);
    expect(built.params).toContain('30');
  });

  it('getLatestRunPerModelPerPrompt also parameterizes the day count', () => {
    const built = buildGetLatestRunPerModelPerPrompt({ brandId: 'b', days: 90 });
    const sql = normalize(built.sql);
    expect(sql).toMatch(/now\(\)\s*-\s*\(\$\d+\s*\|\|\s*' days'\)::interval/);
    expect(built.params).toContain('90');
  });
});

// --------------------------------------------------------------------------
// QA §2.7 — model filter omitted when value is undefined or 'all'
// --------------------------------------------------------------------------

describe('queries: §2.7 model filter conditional', () => {
  it('getRuns: omits the model clause when model is undefined', () => {
    const built = buildGetRuns({ brandId: 'brand-1', days: 7 });
    const sql = normalize(built.sql);
    expect(sql.includes('r.model =')).toBe(false);
    expect(built.params).not.toContain('all');
  });

  it("getRuns: omits the model clause when model is 'all'", () => {
    const built = buildGetRuns({ brandId: 'brand-1', days: 7, model: 'all' });
    const sql = normalize(built.sql);
    expect(sql.includes('r.model =')).toBe(false);
    expect(built.params).not.toContain('all');
  });

  it('getRuns: adds the model clause when a specific model is provided', () => {
    const built = buildGetRuns({ brandId: 'brand-1', days: 7, model: 'claude' });
    const sql = normalize(built.sql);
    expect(sql).toMatch(/r\.model\s*=\s*\$\d+/);
    expect(built.params).toContain('claude');
  });

  it('getCitations: omits the model clause when no model is provided', () => {
    const built = buildGetCitations({ brandId: 'brand-1', days: 7 });
    const sql = normalize(built.sql);
    expect(sql.includes('r.model =')).toBe(false);
  });

  it("getCitations: omits the model clause when model is 'all'", () => {
    const built = buildGetCitations({ brandId: 'brand-1', days: 7, model: 'all' });
    const sql = normalize(built.sql);
    expect(sql.includes('r.model =')).toBe(false);
  });

  it('getCitations: adds the model clause when a specific model is provided', () => {
    const built = buildGetCitations({
      brandId: 'brand-1',
      days: 7,
      model: 'perplexity',
    });
    const sql = normalize(built.sql);
    expect(sql).toMatch(/r\.model\s*=\s*\$\d+/);
    expect(built.params).toContain('perplexity');
  });

  it('getLatestRunPerModelPerPrompt: omits the model clause when not provided', () => {
    const built = buildGetLatestRunPerModelPerPrompt({
      brandId: 'b',
      days: 30,
    });
    const sql = normalize(built.sql);
    expect(sql.includes('r.model =')).toBe(false);
  });

  it("getLatestRunPerModelPerPrompt: omits the model clause when model is 'all'", () => {
    const built = buildGetLatestRunPerModelPerPrompt({
      brandId: 'b',
      days: 30,
      model: 'all',
    });
    const sql = normalize(built.sql);
    expect(sql.includes('r.model =')).toBe(false);
  });

  it('getLatestRunPerModelPerPrompt: adds the model clause when provided', () => {
    const built = buildGetLatestRunPerModelPerPrompt({
      brandId: 'b',
      days: 30,
      model: 'openai',
    });
    const sql = normalize(built.sql);
    expect(sql).toMatch(/r\.model\s*=\s*\$\d+/);
    expect(built.params).toContain('openai');
  });
});

// --------------------------------------------------------------------------
// Brand builders
// --------------------------------------------------------------------------

describe('brand builders', () => {
  it('buildGetPrimaryBrand selects from brands where is_primary = true', () => {
    const { sql, params } = buildGetPrimaryBrand();
    const n = normalize(sql);
    expect(n).toMatch(/FROM brands/);
    expect(n).toMatch(/is_primary\s*=\s*true/);
    expect(n).toMatch(/LIMIT 1/);
    expect(params).toEqual([]);
  });

  it('buildPrimaryBrandExists returns a small existence check', () => {
    const { sql, params } = buildPrimaryBrandExists();
    expect(normalize(sql)).toMatch(/FROM brands WHERE is_primary\s*=\s*true LIMIT 1/);
    expect(params).toEqual([]);
  });

  it('buildInsertBrand binds all five fields in order', () => {
    const { sql, params } = buildInsertBrand({
      name: 'Acme',
      domain: 'acme.com',
      category: 'SaaS',
      description: 'desc',
      isPrimary: true,
    });
    expect(normalize(sql)).toMatch(
      /INSERT INTO brands \(name, domain, is_primary, category, description\) VALUES \(\$1, \$2, \$3, \$4, \$5\)/,
    );
    expect(params).toEqual(['Acme', 'acme.com', true, 'SaaS', 'desc']);
  });

  it('buildInsertBrand defaults isPrimary to true when omitted', () => {
    const { params } = buildInsertBrand({
      name: 'Acme',
      domain: 'acme.com',
      category: null,
      description: null,
    });
    expect(params[2]).toBe(true);
  });
});

// --------------------------------------------------------------------------
// Competitor builders
// --------------------------------------------------------------------------

describe('competitor builders', () => {
  it('buildInsertCompetitors generates one VALUES tuple per row, sharing $1 for brand_id', () => {
    const built = buildInsertCompetitors('brand-1', [
      { name: 'Beta', domain: 'beta.com' },
      { name: 'Gamma', domain: 'gamma.com' },
    ]);
    const n = normalize(built.sql);
    expect(n).toMatch(/INSERT INTO competitors \(name, domain, brand_id\) VALUES/);
    expect(countOccurrences(n, '$1')).toBeGreaterThanOrEqual(2);
    expect(built.params).toEqual(['brand-1', 'Beta', 'beta.com', 'Gamma', 'gamma.com']);
  });

  it('buildInsertCompetitors with empty rows returns a no-op query', () => {
    const built = buildInsertCompetitors('brand-1', []);
    expect(normalize(built.sql).toUpperCase()).toContain('WHERE FALSE');
    expect(built.params).toEqual([]);
  });

  it('buildListCompetitors filters by brand_id and orders by created_at ASC', () => {
    const { sql, params } = buildListCompetitors('brand-1');
    const n = normalize(sql);
    expect(n).toMatch(/FROM competitors WHERE brand_id = \$1/);
    expect(n).toMatch(/ORDER BY created_at ASC/);
    expect(params).toEqual(['brand-1']);
  });
});

// --------------------------------------------------------------------------
// Prompt builders
// --------------------------------------------------------------------------

describe('prompt builders', () => {
  it('buildInsertPrompts emits one VALUES tuple per row sharing $1 for brand_id', () => {
    const built = buildInsertPrompts('brand-1', [
      { text: 'a', topic: 'Core' },
      { text: 'b', topic: 'Free tool' },
    ]);
    const n = normalize(built.sql);
    expect(n).toMatch(/INSERT INTO prompts \(text, topic, brand_id\) VALUES/);
    expect(countOccurrences(n, '$1')).toBeGreaterThanOrEqual(2);
    expect(built.params).toEqual(['brand-1', 'a', 'Core', 'b', 'Free tool']);
  });

  it('buildInsertPrompts with no rows returns a no-op', () => {
    const built = buildInsertPrompts('brand-1', []);
    expect(normalize(built.sql).toUpperCase()).toContain('WHERE FALSE');
    expect(built.params).toEqual([]);
  });

  it('buildInsertPrompt binds (text, topic, brandId) in order', () => {
    const { sql, params } = buildInsertPrompt('brand-1', {
      text: 'hello',
      topic: 'Core',
    });
    expect(normalize(sql)).toMatch(
      /INSERT INTO prompts \(text, topic, brand_id\) VALUES \(\$1, \$2, \$3\)/,
    );
    expect(params).toEqual(['hello', 'Core', 'brand-1']);
  });

  it('buildListPrompts returns all prompts for a brand without filtering on is_active', () => {
    const { sql, params } = buildListPrompts('brand-1');
    const n = normalize(sql);
    expect(n).toMatch(/FROM prompts WHERE brand_id = \$1/);
    // The is_active column is selected (so callers can populate Prompt.isActive),
    // but it must not appear in the WHERE clause — that variant is listActivePrompts.
    const whereMatch = n.match(/WHERE([\s\S]*?)(ORDER BY|LIMIT|$)/i);
    expect(whereMatch).not.toBeNull();
    expect(whereMatch![1]).not.toMatch(/is_active/);
    expect(params).toEqual(['brand-1']);
  });

  it('buildListActivePrompts adds the is_active filter', () => {
    const { sql, params } = buildListActivePrompts('brand-1');
    const n = normalize(sql);
    expect(n).toMatch(/WHERE brand_id = \$1 AND is_active\s*=\s*true/);
    expect(params).toEqual(['brand-1']);
  });

  it('buildArchivePrompt issues an UPDATE setting is_active = false', () => {
    const { sql, params } = buildArchivePrompt('p-1');
    expect(normalize(sql)).toMatch(
      /UPDATE prompts SET is_active = false WHERE id = \$1/,
    );
    expect(params).toEqual(['p-1']);
  });

  it('buildGetPrompt looks up a prompt by id', () => {
    const { sql, params } = buildGetPrompt('p-1');
    expect(normalize(sql)).toMatch(/FROM prompts WHERE id = \$1 LIMIT 1/);
    expect(params).toEqual(['p-1']);
  });
});

// --------------------------------------------------------------------------
// Run builders
// --------------------------------------------------------------------------

describe('run builders', () => {
  it('buildInsertRun casts competitor_mentions to jsonb and binds all fields', () => {
    const { sql, params } = buildInsertRun({
      promptId: 'p-1',
      model: 'openai',
      response: 'hi',
      mentioned: true,
      positionScore: 3,
      sentiment: 'positive',
      competitorMentions: { Beta: true },
      estimatedCost: 0.123,
    });
    const n = normalize(sql);
    expect(n).toMatch(
      /INSERT INTO runs \(prompt_id, model, response, mentioned, position_score, sentiment, competitor_mentions, estimated_cost\)/,
    );
    expect(n).toMatch(/\$7::jsonb/);
    expect(params).toEqual([
      'p-1',
      'openai',
      'hi',
      true,
      3,
      'positive',
      JSON.stringify({ Beta: true }),
      0.123,
    ]);
  });

  it('buildGetRuns joins runs->prompts and filters by brand_id when supplied', () => {
    const built = buildGetRuns({ brandId: 'brand-1', days: 7 });
    const n = normalize(built.sql);
    expect(n).toMatch(/FROM runs r JOIN prompts p ON p\.id = r\.prompt_id/);
    expect(n).toMatch(/p\.brand_id = \$\d+/);
    expect(built.params).toContain('brand-1');
  });

  it('buildGetRuns omits the brand filter when brandId is absent', () => {
    const built = buildGetRuns({ days: 7 });
    const n = normalize(built.sql);
    expect(n.includes('p.brand_id')).toBe(false);
  });

  it('buildGetRunsForPrompt binds promptId and limit', () => {
    const { sql, params } = buildGetRunsForPrompt('p-1', 50);
    const n = normalize(sql);
    expect(n).toMatch(/WHERE r\.prompt_id = \$1/);
    expect(n).toMatch(/LIMIT \$2/);
    expect(params).toEqual(['p-1', 50]);
  });

  it('buildGetLatestRunPerModelPerPrompt uses DISTINCT ON (prompt_id, model)', () => {
    const built = buildGetLatestRunPerModelPerPrompt({
      brandId: 'brand-1',
      days: 30,
    });
    const n = normalize(built.sql);
    expect(n).toMatch(/DISTINCT ON \(r\.prompt_id, r\.model\)/);
    expect(n).toMatch(/ORDER BY r\.prompt_id, r\.model, r\.created_at DESC/);
  });
});

// --------------------------------------------------------------------------
// Citation builders
// --------------------------------------------------------------------------

describe('citation builders', () => {
  it('buildInsertCitations emits one VALUES tuple per row sharing $1 for run_id', () => {
    const built = buildInsertCitations('run-1', [
      { domain: 'techcrunch.com', url: 'https://t.com/a', domainType: 'Editorial' },
      { domain: 'reddit.com', url: 'https://r.com/x', domainType: 'UGC' },
    ]);
    const n = normalize(built.sql);
    expect(n).toMatch(/INSERT INTO citations \(run_id, domain, url, domain_type\) VALUES/);
    expect(countOccurrences(n, '$1')).toBeGreaterThanOrEqual(2);
    expect(built.params).toEqual([
      'run-1',
      'techcrunch.com',
      'https://t.com/a',
      'Editorial',
      'reddit.com',
      'https://r.com/x',
      'UGC',
    ]);
  });

  it('buildInsertCitations with no rows returns a no-op', () => {
    const built = buildInsertCitations('run-1', []);
    expect(normalize(built.sql).toUpperCase()).toContain('WHERE FALSE');
    expect(built.params).toEqual([]);
  });

  it('buildGetCitations joins citations->runs->prompts and filters by brand_id', () => {
    const built = buildGetCitations({ brandId: 'brand-1', days: 7 });
    const n = normalize(built.sql);
    expect(n).toMatch(/FROM citations c JOIN runs r ON r\.id = c\.run_id JOIN prompts p ON p\.id = r\.prompt_id/);
    expect(n).toMatch(/p\.brand_id = \$1/);
    expect(built.params[0]).toBe('brand-1');
  });
});

// --------------------------------------------------------------------------
// Setup / last-updated builders
// --------------------------------------------------------------------------

describe('setup builders', () => {
  it('buildCheckTables queries information_schema with a single bound table list', () => {
    const { sql, params } = buildCheckTables();
    const n = normalize(sql);
    expect(n).toMatch(/FROM information_schema\.tables/);
    expect(n).toMatch(/table_name = ANY\(\$1::text\[\]\)/);
    expect(Array.isArray(params[0])).toBe(true);
    const tableList = params[0] as string[];
    expect(tableList).toContain('brands');
    expect(tableList).toContain('competitors');
    expect(tableList).toContain('prompts');
    expect(tableList).toContain('runs');
    expect(tableList).toContain('citations');
  });

  it('buildGetLastRunTimestamp scopes the MAX to the given brand', () => {
    const { sql, params } = buildGetLastRunTimestamp('brand-1');
    const n = normalize(sql);
    expect(n).toMatch(/MAX\(r\.created_at\)/);
    expect(n).toMatch(/WHERE p\.brand_id = \$1/);
    expect(params).toEqual(['brand-1']);
  });
});
