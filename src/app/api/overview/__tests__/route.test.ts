import { describe, expect, it, vi } from 'vitest';

// The route file imports @/lib/queries → @/lib/db, which throws at import
// time when DATABASE_URL is not set. composeOverview itself is pure; stub
// the db module so the import graph resolves under vitest.
vi.mock('@/lib/db', () => ({
  sql: { query: vi.fn() },
  MissingDatabaseUrlError: class extends Error {},
}));

import { composeOverview } from '@/app/api/overview/route';
import type {
  Brand,
  Citation,
  Competitor,
  ModelShortId,
  Prompt,
  Run,
  Sentiment,
} from '@/types';

const NOW = new Date('2026-06-01T12:00:00.000Z');
const NOW_MS = NOW.getTime();
const DAY = 86_400_000;

function brand(overrides: Partial<Brand> = {}): Brand {
  return {
    id: 'b-1',
    name: 'Acme',
    domain: 'acme.com',
    isPrimary: true,
    category: 'CRM',
    description: 'Best CRM',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function competitor(name: string, domain = `${name.toLowerCase()}.com`): Competitor {
  return { id: `c-${name}`, name, domain, brandId: 'b-1' };
}

function prompt(id: string, text: string, topic = 'Category'): Prompt {
  return {
    id,
    text,
    topic,
    tags: [],
    isActive: true,
    brandId: 'b-1',
  };
}

interface MakeRun {
  id?: string;
  promptId?: string;
  model?: ModelShortId;
  mentioned?: boolean;
  positionScore?: number | null;
  sentiment?: Sentiment;
  competitorMentions?: Record<string, boolean>;
  daysAgo?: number;
}

function run(opts: MakeRun = {}, idx = 0): Run {
  const daysAgo = opts.daysAgo ?? 1;
  return {
    id: opts.id ?? `r-${idx}`,
    promptId: opts.promptId ?? 'p-1',
    model: opts.model ?? 'openai',
    response: 'response text',
    mentioned: opts.mentioned ?? false,
    positionScore: opts.positionScore ?? null,
    sentiment: opts.sentiment ?? 'neutral',
    competitorMentions: opts.competitorMentions ?? {},
    estimatedCost: 0.01,
    createdAt: new Date(NOW_MS - daysAgo * DAY).toISOString(),
  };
}

function citation(runId: string, domain = 'reddit.com'): Citation {
  return {
    runId,
    domain,
    url: `https://${domain}/x`,
    domainType: domain === 'acme.com' ? 'You' : 'UGC',
  };
}

// --------------------------------------------------------------------------
// §11.2 — Response shape contract
// --------------------------------------------------------------------------

describe('GET /api/overview — §11.2 shape contract', () => {
  it('returns every documented top-level key', () => {
    const out = composeOverview({
      brand: brand(),
      competitors: [],
      prompts: [],
      allRuns: [],
      windowCitations: [],
      lastUpdated: null,
      days: 7,
      now: NOW,
    });

    expect(Object.keys(out).sort()).toEqual(
      [
        'actions',
        'brand',
        'competitors',
        'domainTypes',
        'keyInsight',
        'lastUpdated',
        'metrics',
        'rankings',
        'recentChats',
        'sources',
        'trend',
      ].sort(),
    );
  });

  it('brand projection omits is_primary and created_at', () => {
    const out = composeOverview({
      brand: brand(),
      competitors: [],
      prompts: [],
      allRuns: [],
      windowCitations: [],
      lastUpdated: null,
      days: 7,
      now: NOW,
    });
    expect(out.brand).toEqual({
      id: 'b-1',
      name: 'Acme',
      domain: 'acme.com',
      category: 'CRM',
      description: 'Best CRM',
    });
    expect((out.brand as Record<string, unknown>).isPrimary).toBeUndefined();
    expect((out.brand as Record<string, unknown>).createdAt).toBeUndefined();
  });

  it('metrics block has all 9 documented fields', () => {
    const out = composeOverview({
      brand: brand(),
      competitors: [],
      prompts: [],
      allRuns: [],
      windowCitations: [],
      lastUpdated: null,
      days: 7,
      now: NOW,
    });
    expect(Object.keys(out.metrics).sort()).toEqual(
      [
        'avgPosition',
        'avgSentiment',
        'competitiveRank',
        'mentioned',
        'sov',
        'totalCitations',
        'totalRuns',
        'visibility',
        'visibilityChange',
      ].sort(),
    );
  });
});

// --------------------------------------------------------------------------
// §13.1 — Visibility
// --------------------------------------------------------------------------

describe('GET /api/overview — §13.1 visibility', () => {
  it('counts mentioned/totalRuns over current window only', () => {
    const allRuns: Run[] = [
      run({ id: 'r-cur-1', mentioned: true, daysAgo: 1 }, 1),
      run({ id: 'r-cur-2', mentioned: false, daysAgo: 2 }, 2),
      run({ id: 'r-cur-3', mentioned: true, daysAgo: 3 }, 3),
      run({ id: 'r-cur-4', mentioned: false, daysAgo: 4 }, 4),
      // Prior window — should NOT count toward visibility
      run({ id: 'r-prior-1', mentioned: true, daysAgo: 10 }, 5),
      run({ id: 'r-prior-2', mentioned: true, daysAgo: 11 }, 6),
    ];
    const out = composeOverview({
      brand: brand(),
      competitors: [],
      prompts: [prompt('p-1', 'q1')],
      allRuns,
      windowCitations: [],
      lastUpdated: null,
      days: 7,
      now: NOW,
    });
    expect(out.metrics.totalRuns).toBe(4);
    expect(out.metrics.mentioned).toBe(2);
    expect(out.metrics.visibility).toBeCloseTo(0.5, 10);
  });

  it('returns visibility 0 for an empty window without crashing', () => {
    const out = composeOverview({
      brand: brand(),
      competitors: [],
      prompts: [],
      allRuns: [],
      windowCitations: [],
      lastUpdated: null,
      days: 7,
      now: NOW,
    });
    expect(out.metrics.visibility).toBe(0);
    expect(out.metrics.totalRuns).toBe(0);
    expect(out.metrics.mentioned).toBe(0);
  });
});

// --------------------------------------------------------------------------
// §13.4 — avgSentiment is null when zero mentioned runs (mentioned-only avg)
// --------------------------------------------------------------------------

describe('GET /api/overview — §13.4 avgSentiment', () => {
  it('is null when no run in the window was mentioned', () => {
    const allRuns: Run[] = [
      run({ id: 'a', mentioned: false, sentiment: 'positive', daysAgo: 1 }, 1),
      run({ id: 'b', mentioned: false, sentiment: 'negative', daysAgo: 2 }, 2),
      run({ id: 'c', mentioned: false, sentiment: 'neutral', daysAgo: 3 }, 3),
    ];
    const out = composeOverview({
      brand: brand(),
      competitors: [],
      prompts: [prompt('p-1', 'q1')],
      allRuns,
      windowCitations: [],
      lastUpdated: null,
      days: 7,
      now: NOW,
    });
    expect(out.metrics.avgSentiment).toBeNull();
  });

  it('averages only mentioned runs (positive=80, neutral=55, negative=30)', () => {
    const allRuns: Run[] = [
      run({ id: 'a', mentioned: true, sentiment: 'positive', daysAgo: 1 }, 1),
      run({ id: 'b', mentioned: true, sentiment: 'negative', daysAgo: 2 }, 2),
      // ignored: not mentioned
      run({ id: 'c', mentioned: false, sentiment: 'positive', daysAgo: 3 }, 3),
    ];
    const out = composeOverview({
      brand: brand(),
      competitors: [],
      prompts: [prompt('p-1', 'q1')],
      allRuns,
      windowCitations: [],
      lastUpdated: null,
      days: 7,
      now: NOW,
    });
    expect(out.metrics.avgSentiment).toBeCloseTo((80 + 30) / 2, 10);
  });

  it('per-entity rankings sentiment is null when entity had zero mentioned runs', () => {
    const competitors = [competitor('Beta')];
    const allRuns: Run[] = [
      run({ id: 'a', mentioned: true, sentiment: 'positive', daysAgo: 1 }, 1),
      run({ id: 'b', mentioned: false, sentiment: 'negative', daysAgo: 2 }, 2),
    ];
    const out = composeOverview({
      brand: brand(),
      competitors,
      prompts: [prompt('p-1', 'q1')],
      allRuns,
      windowCitations: [],
      lastUpdated: null,
      days: 7,
      now: NOW,
    });
    const beta = out.rankings.find((r) => r.name === 'Beta');
    expect(beta).toBeDefined();
    expect(beta?.sentiment).toBeNull();
  });
});

// --------------------------------------------------------------------------
// §13.5 — visibility change (current vs prior window) + trend rows
// --------------------------------------------------------------------------

describe('GET /api/overview — §13.5 visibilityChange + trend rows', () => {
  it('visibilityChange compares current window against prior same-length window', () => {
    const allRuns: Run[] = [
      // Current 7-day window: 2/4 mentioned = 50%
      run({ id: 'c1', mentioned: true, daysAgo: 1 }, 1),
      run({ id: 'c2', mentioned: true, daysAgo: 2 }, 2),
      run({ id: 'c3', mentioned: false, daysAgo: 3 }, 3),
      run({ id: 'c4', mentioned: false, daysAgo: 4 }, 4),
      // Prior 7-day window (days 7-14 ago): 1/4 mentioned = 25%
      run({ id: 'p1', mentioned: true, daysAgo: 8 }, 5),
      run({ id: 'p2', mentioned: false, daysAgo: 9 }, 6),
      run({ id: 'p3', mentioned: false, daysAgo: 10 }, 7),
      run({ id: 'p4', mentioned: false, daysAgo: 11 }, 8),
    ];
    const out = composeOverview({
      brand: brand(),
      competitors: [],
      prompts: [prompt('p-1', 'q1')],
      allRuns,
      windowCitations: [],
      lastUpdated: null,
      days: 7,
      now: NOW,
    });
    expect(out.metrics.visibility).toBeCloseTo(0.5, 10);
    expect(out.metrics.visibilityChange).toBeCloseTo(25, 10);
  });

  it('visibilityChange is null when there are no prior-window runs', () => {
    const out = composeOverview({
      brand: brand(),
      competitors: [],
      prompts: [prompt('p-1', 'q1')],
      allRuns: [run({ id: 'c1', mentioned: true, daysAgo: 1 })],
      windowCitations: [],
      lastUpdated: null,
      days: 7,
      now: NOW,
    });
    expect(out.metrics.visibilityChange).toBeNull();
  });

  it('trend uses daily buckets within the max(days, 28) window', () => {
    const allRuns: Run[] = [
      run({ id: 'a', mentioned: true, daysAgo: 1 }, 1),
      run({ id: 'b', mentioned: false, daysAgo: 8 }, 2),
      run({ id: 'c', mentioned: true, daysAgo: 15 }, 3),
      run({ id: 'd', mentioned: false, daysAgo: 22 }, 4),
    ];
    const out = composeOverview({
      brand: brand(),
      competitors: [],
      prompts: [prompt('p-1', 'q1')],
      allRuns,
      windowCitations: [],
      lastUpdated: null,
      days: 7,
      now: NOW,
    });
    expect(out.trend.length).toBeGreaterThanOrEqual(2);
    for (const row of out.trend) {
      expect(typeof row.date).toBe('string');
      expect(/^\d{4}-\d{2}-\d{2}$/.test(row.date)).toBe(true);
      expect(typeof row.brand).toBe('number');
    }
  });

  it('trend rows include a numeric column per competitor', () => {
    const competitors = [competitor('Beta'), competitor('Gamma')];
    const allRuns: Run[] = [
      run(
        {
          id: 'a',
          mentioned: true,
          competitorMentions: { Beta: true, Gamma: false },
          daysAgo: 1,
        },
        1,
      ),
      run(
        {
          id: 'b',
          mentioned: false,
          competitorMentions: { Beta: false, Gamma: true },
          daysAgo: 2,
        },
        2,
      ),
    ];
    const out = composeOverview({
      brand: brand(),
      competitors,
      prompts: [prompt('p-1', 'q1')],
      allRuns,
      windowCitations: [],
      lastUpdated: null,
      days: 7,
      now: NOW,
    });
    expect(out.trend.length).toBeGreaterThan(0);
    for (const row of out.trend) {
      expect(typeof row['Beta']).toBe('number');
      expect(typeof row['Gamma']).toBe('number');
    }
  });
});

// --------------------------------------------------------------------------
// §15.5 — round-trip discipline (composition does no DB work)
// --------------------------------------------------------------------------

describe('GET /api/overview — composition is pure', () => {
  it('competitiveRank is 1 when brand beats all competitors', () => {
    const competitors = [competitor('Beta'), competitor('Gamma')];
    const allRuns: Run[] = [
      run({ id: 'a', mentioned: true, competitorMentions: { Beta: false, Gamma: false }, daysAgo: 1 }, 1),
      run({ id: 'b', mentioned: true, competitorMentions: { Beta: false, Gamma: false }, daysAgo: 2 }, 2),
      run({ id: 'c', mentioned: false, competitorMentions: { Beta: true, Gamma: false }, daysAgo: 3 }, 3),
    ];
    const out = composeOverview({
      brand: brand(),
      competitors,
      prompts: [prompt('p-1', 'q1')],
      allRuns,
      windowCitations: [],
      lastUpdated: null,
      days: 7,
      now: NOW,
    });
    expect(out.metrics.competitiveRank).toBe(1);
  });

  it('limits sources to top 8', () => {
    const allRuns: Run[] = [];
    const citations: Citation[] = [];
    for (let i = 0; i < 12; i++) {
      const r = run({ id: `r-${i}`, mentioned: true, daysAgo: 1 }, i);
      allRuns.push(r);
      citations.push(citation(r.id, `domain${i}.com`));
    }
    const out = composeOverview({
      brand: brand(),
      competitors: [],
      prompts: [prompt('p-1', 'q1')],
      allRuns,
      windowCitations: citations,
      lastUpdated: null,
      days: 7,
      now: NOW,
    });
    expect(out.sources.length).toBeLessThanOrEqual(8);
    expect(out.metrics.totalCitations).toBe(12);
  });

  it('domainTypes percentages sum to ~1 across categories', () => {
    const allRuns: Run[] = [run({ id: 'a', mentioned: true, daysAgo: 1 })];
    const citations: Citation[] = [
      { runId: 'a', domain: 'reddit.com', url: 'https://reddit.com/x', domainType: 'UGC' },
      { runId: 'a', domain: 'reddit.com', url: 'https://reddit.com/y', domainType: 'UGC' },
      { runId: 'a', domain: 'forbes.com', url: 'https://forbes.com/x', domainType: 'Editorial' },
    ];
    const out = composeOverview({
      brand: brand(),
      competitors: [],
      prompts: [prompt('p-1', 'q1')],
      allRuns,
      windowCitations: citations,
      lastUpdated: null,
      days: 7,
      now: NOW,
    });
    const sum = out.domainTypes.reduce((acc, r) => acc + r.percentage, 0);
    expect(sum).toBeCloseTo(1, 10);
    expect(out.domainTypes[0]?.type).toBe('UGC');
    expect(out.domainTypes[0]?.count).toBe(2);
  });

  it('recentChats returns up to 6 most-recent prompts with model + citation aggregation', () => {
    const prompts = [
      prompt('p-1', 'first'),
      prompt('p-2', 'second'),
    ];
    const allRuns: Run[] = [
      run({ id: 'r-1a', promptId: 'p-1', model: 'openai', mentioned: true, daysAgo: 1 }, 1),
      run({ id: 'r-1b', promptId: 'p-1', model: 'claude', mentioned: false, daysAgo: 2 }, 2),
      run({ id: 'r-2a', promptId: 'p-2', model: 'gemini', mentioned: false, daysAgo: 3 }, 3),
    ];
    const citations: Citation[] = [
      citation('r-1a', 'reddit.com'),
      citation('r-1a', 'forbes.com'),
      citation('r-2a', 'wikipedia.org'),
    ];
    const out = composeOverview({
      brand: brand(),
      competitors: [],
      prompts,
      allRuns,
      windowCitations: citations,
      lastUpdated: null,
      days: 7,
      now: NOW,
    });
    expect(out.recentChats.length).toBe(2);
    expect(out.recentChats[0]?.promptId).toBe('p-1');
    expect(out.recentChats[0]?.models.sort()).toEqual(['claude', 'openai']);
    expect(out.recentChats[0]?.citationCount).toBe(2);
    expect(out.recentChats[1]?.citationCount).toBe(1);
  });

  it('keyInsight tiers based on visibility', () => {
    const lowOut = composeOverview({
      brand: brand(),
      competitors: [],
      prompts: [prompt('p-1', 'q1')],
      allRuns: [
        run({ id: 'a', mentioned: false, daysAgo: 1 }, 1),
        run({ id: 'b', mentioned: false, daysAgo: 2 }, 2),
      ],
      windowCitations: [],
      lastUpdated: null,
      days: 7,
      now: NOW,
    });
    expect(lowOut.keyInsight.toLowerCase()).toContain('low visibility');

    const highRuns: Run[] = [];
    for (let i = 0; i < 5; i++) {
      highRuns.push(run({ id: `h-${i}`, mentioned: true, daysAgo: i + 1 }, i));
    }
    const highOut = composeOverview({
      brand: brand(),
      competitors: [],
      prompts: [prompt('p-1', 'q1')],
      allRuns: highRuns,
      windowCitations: [],
      lastUpdated: null,
      days: 7,
      now: NOW,
    });
    expect(highOut.keyInsight.toLowerCase()).toContain('strong visibility');
  });

  it('always includes the low-priority Owned content hub action', () => {
    const out = composeOverview({
      brand: brand(),
      competitors: [],
      prompts: [prompt('p-1', 'q1')],
      allRuns: [run({ id: 'a', mentioned: true, daysAgo: 1 })],
      windowCitations: [],
      lastUpdated: null,
      days: 7,
      now: NOW,
    });
    const hub = out.actions.find((a) => a.title.includes('content hub'));
    expect(hub).toBeDefined();
    expect(hub?.side).toBe('owned');
    expect(hub?.priority).toBe('low');
  });

  it('passes through lastUpdated verbatim', () => {
    const ts = '2026-05-31T08:00:00.000Z';
    const out = composeOverview({
      brand: brand(),
      competitors: [],
      prompts: [],
      allRuns: [],
      windowCitations: [],
      lastUpdated: ts,
      days: 7,
      now: NOW,
    });
    expect(out.lastUpdated).toBe(ts);
  });
});
