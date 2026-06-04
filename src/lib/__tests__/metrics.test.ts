import { describe, it, expect } from 'vitest';
import {
  computeVisibility,
  computeSOV,
  computeAvgPosition,
  computeAvgSentiment,
  computeVisibilityChange,
  computeWeeklyTrend,
  computeDomainSources,
  computeUrlSources,
  computeCompetitiveRank,
  computeRankings,
  buildKeyInsight,
  buildActions,
} from '@/lib/metrics';
import type { Citation, Run, Sentiment } from '@/types';

// --------------------------------------------------------------------------
// Test data builders
// --------------------------------------------------------------------------

interface MakeRunOpts {
  id?: string;
  promptId?: string;
  mentioned?: boolean;
  position?: number | null;
  sentiment?: Sentiment;
  competitorMentions?: Record<string, boolean>;
  createdAt?: string;
  model?: Run['model'];
}

function makeRun(opts: MakeRunOpts = {}, idx = 0): Run {
  return {
    id: opts.id ?? `run-${idx}`,
    promptId: opts.promptId ?? 'p-1',
    model: opts.model ?? 'openai',
    response: null,
    mentioned: opts.mentioned ?? false,
    positionScore: opts.position ?? null,
    sentiment: opts.sentiment ?? 'neutral',
    competitorMentions: opts.competitorMentions ?? {},
    estimatedCost: null,
    createdAt: opts.createdAt ?? '2026-06-01T00:00:00.000Z',
  };
}

function makeCitation(opts: {
  runId: string;
  domain: string;
  url?: string | null;
  type?: Citation['domainType'];
}): Citation {
  return {
    runId: opts.runId,
    domain: opts.domain,
    url: opts.url ?? null,
    domainType: opts.type ?? 'Corporate',
  };
}

// --------------------------------------------------------------------------
// §8.1 Visibility
// --------------------------------------------------------------------------

describe('computeVisibility — QA §8.1', () => {
  it('8.1.a 10 runs, 4 mentioned → 0.4', () => {
    const runs = Array.from({ length: 10 }, (_, i) =>
      makeRun({ mentioned: i < 4 }, i),
    );
    expect(computeVisibility(runs)).toBeCloseTo(0.4, 10);
  });

  it('8.1.b zero runs → 0 (not NaN)', () => {
    expect(computeVisibility([])).toBe(0);
  });

  it('8.1.c all unmentioned → 0', () => {
    const runs = Array.from({ length: 5 }, (_, i) => makeRun({}, i));
    expect(computeVisibility(runs)).toBe(0);
  });

  it('8.1.d all mentioned → 1', () => {
    const runs = Array.from({ length: 5 }, (_, i) =>
      makeRun({ mentioned: true }, i),
    );
    expect(computeVisibility(runs)).toBe(1);
  });
});

// --------------------------------------------------------------------------
// §8.2 Share of Voice
// --------------------------------------------------------------------------

describe('computeSOV — QA §8.2', () => {
  const competitors = [
    { name: 'Beta' },
    { name: 'Gamma' },
    { name: 'Delta' },
    { name: 'Epsilon' },
  ];

  it('8.2.a brand=5, competitor sum=15 → 0.25', () => {
    const runs: Run[] = [];
    for (let i = 0; i < 5; i++) runs.push(makeRun({ mentioned: true }, i));
    for (let i = 0; i < 5; i++) {
      runs.push(makeRun({ competitorMentions: { Beta: true } }, 100 + i));
    }
    for (let i = 0; i < 5; i++) {
      runs.push(makeRun({ competitorMentions: { Gamma: true } }, 200 + i));
    }
    for (let i = 0; i < 5; i++) {
      runs.push(makeRun({ competitorMentions: { Delta: true } }, 300 + i));
    }
    expect(computeSOV(runs, competitors)).toBeCloseTo(5 / 20, 10);
  });

  it('8.2.b zero denominator → 0 (not NaN)', () => {
    const runs = [makeRun({}), makeRun({}, 1)];
    expect(computeSOV(runs, competitors)).toBe(0);
  });

  it('8.2.c empty runs → 0', () => {
    expect(computeSOV([], competitors)).toBe(0);
  });
});

// --------------------------------------------------------------------------
// §8.3 Average position
// --------------------------------------------------------------------------

describe('computeAvgPosition — QA §8.3', () => {
  it('8.3.a [1,2,4,null,null] → 2.333…', () => {
    const runs: Run[] = [
      makeRun({ position: 1 }, 0),
      makeRun({ position: 2 }, 1),
      makeRun({ position: 4 }, 2),
      makeRun({ position: null }, 3),
      makeRun({ position: null }, 4),
    ];
    const avg = computeAvgPosition(runs);
    expect(avg).not.toBeNull();
    expect(avg as number).toBeCloseTo(7 / 3, 10);
  });

  it('8.3.b all NULL → null', () => {
    const runs: Run[] = [
      makeRun({ position: null }, 0),
      makeRun({ position: null }, 1),
    ];
    expect(computeAvgPosition(runs)).toBeNull();
  });

  it('8.3.c empty array → null', () => {
    expect(computeAvgPosition([])).toBeNull();
  });
});

// --------------------------------------------------------------------------
// §8.4 Avg sentiment — mentioned-only, null when empty (KEY INVARIANT)
// --------------------------------------------------------------------------

describe('computeAvgSentiment — QA §8.4 (mentioned-only, null when empty)', () => {
  it('8.4.A mixed sentiments over 3 mentioned runs → (80+55+30)/3 = 55', () => {
    const runs: Run[] = [
      makeRun({ mentioned: true, sentiment: 'positive' }, 0),
      makeRun({ mentioned: true, sentiment: 'neutral' }, 1),
      makeRun({ mentioned: true, sentiment: 'negative' }, 2),
      // 7 unmentioned with various sentiments — must be ignored
      makeRun({ mentioned: false, sentiment: 'positive' }, 3),
      makeRun({ mentioned: false, sentiment: 'positive' }, 4),
      makeRun({ mentioned: false, sentiment: 'negative' }, 5),
      makeRun({ mentioned: false, sentiment: 'neutral' }, 6),
      makeRun({ mentioned: false, sentiment: 'neutral' }, 7),
      makeRun({ mentioned: false, sentiment: 'neutral' }, 8),
      makeRun({ mentioned: false, sentiment: 'neutral' }, 9),
    ];
    expect(computeAvgSentiment(runs)).toBeCloseTo(55, 10);
  });

  it('8.4.B 10 runs, 0 mentioned → null (NOT 55) — locks the regression-prone invariant', () => {
    const runs: Run[] = Array.from({ length: 10 }, (_, i) =>
      makeRun({ mentioned: false, sentiment: 'neutral' }, i),
    );
    const result = computeAvgSentiment(runs);
    expect(result).toBeNull();
    expect(result).not.toBe(55);
  });

  it('8.4.C all mentioned + all positive → 80', () => {
    const runs: Run[] = Array.from({ length: 10 }, (_, i) =>
      makeRun({ mentioned: true, sentiment: 'positive' }, i),
    );
    expect(computeAvgSentiment(runs)).toBeCloseTo(80, 10);
  });

  it('8.4.D empty input → null (not 55)', () => {
    expect(computeAvgSentiment([])).toBeNull();
  });

  it('8.4.E unmentioned positive runs do not raise the score', () => {
    const runs: Run[] = [
      makeRun({ mentioned: true, sentiment: 'neutral' }, 0),
      makeRun({ mentioned: false, sentiment: 'positive' }, 1),
      makeRun({ mentioned: false, sentiment: 'positive' }, 2),
      makeRun({ mentioned: false, sentiment: 'positive' }, 3),
    ];
    expect(computeAvgSentiment(runs)).toBeCloseTo(55, 10);
  });
});

// --------------------------------------------------------------------------
// §8.5 Visibility change
// --------------------------------------------------------------------------

describe('computeVisibilityChange — QA §8.5', () => {
  it('8.5.a current 40%, prior 30% → +10pp', () => {
    const current = [
      ...Array.from({ length: 4 }, (_, i) =>
        makeRun({ mentioned: true }, i),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        makeRun({ mentioned: false }, 10 + i),
      ),
    ];
    const prior = [
      ...Array.from({ length: 3 }, (_, i) =>
        makeRun({ mentioned: true }, 20 + i),
      ),
      ...Array.from({ length: 7 }, (_, i) =>
        makeRun({ mentioned: false }, 30 + i),
      ),
    ];
    const delta = computeVisibilityChange(current, prior);
    expect(delta).not.toBeNull();
    expect(delta as number).toBeCloseTo(10, 6);
  });

  it('8.5.b negative delta — current 20%, prior 50% → -30pp', () => {
    const current = [
      makeRun({ mentioned: true }, 0),
      makeRun({ mentioned: true }, 1),
      ...Array.from({ length: 8 }, (_, i) =>
        makeRun({ mentioned: false }, 2 + i),
      ),
    ];
    const prior = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeRun({ mentioned: true }, 100 + i),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeRun({ mentioned: false }, 200 + i),
      ),
    ];
    const delta = computeVisibilityChange(current, prior);
    expect(delta as number).toBeCloseTo(-30, 6);
  });

  it('8.5.c prior window empty (0 runs) → null (not +Xpp)', () => {
    const current = [
      makeRun({ mentioned: true }, 0),
      makeRun({ mentioned: false }, 1),
    ];
    expect(computeVisibilityChange(current, [])).toBeNull();
  });

  it('8.5.d both empty → null', () => {
    expect(computeVisibilityChange([], [])).toBeNull();
  });
});

// --------------------------------------------------------------------------
// §8.6 Weekly trend bucketing
// --------------------------------------------------------------------------

describe('computeWeeklyTrend — QA §8.6 (Sunday-start UTC buckets)', () => {
  const competitors = [{ name: 'Beta' }, { name: 'Gamma' }];
  const brand = { name: 'Acme' };
  const now = new Date('2026-06-03T12:00:00.000Z'); // a Wednesday

  it('8.6.a Runs across 3 distinct weeks produce 3 ordered buckets', () => {
    const runs: Run[] = [
      makeRun(
        { mentioned: true, createdAt: '2026-05-20T10:00:00.000Z' },
        0,
      ),
      makeRun(
        { mentioned: false, createdAt: '2026-05-21T10:00:00.000Z' },
        1,
      ),
      makeRun(
        {
          mentioned: true,
          competitorMentions: { Beta: true },
          createdAt: '2026-05-27T10:00:00.000Z',
        },
        2,
      ),
      makeRun(
        {
          mentioned: true,
          competitorMentions: { Beta: true, Gamma: true },
          createdAt: '2026-06-01T10:00:00.000Z',
        },
        3,
      ),
    ];
    const trend = computeWeeklyTrend(runs, brand, competitors, 7, now);
    expect(trend.length).toBe(3);
    // ascending by weekStart
    for (let i = 1; i < trend.length; i++) {
      expect(
        String(trend[i].weekStart) > String(trend[i - 1].weekStart),
      ).toBe(true);
    }
    expect(typeof trend[0].brand).toBe('number');
    expect(typeof trend[0].Beta).toBe('number');
    expect(typeof trend[0].Gamma).toBe('number');
  });

  it('8.6.b Sunday 00:00 UTC belongs to that week (week-start key === Sunday)', () => {
    const runs: Run[] = [
      makeRun(
        { mentioned: true, createdAt: '2026-05-31T00:00:00.000Z' },
        0,
      ),
    ];
    const trend = computeWeeklyTrend(runs, brand, competitors, 7, now);
    expect(trend.length).toBe(1);
    expect(trend[0].weekStart).toBe('2026-05-31');
    expect(trend[0].brand).toBe(1);
  });

  it('8.6.c Window expands to max(days, 28)', () => {
    // run 21 days ago — outside a 7-day window but inside max(7,28)=28
    const runs: Run[] = [
      makeRun(
        { mentioned: true, createdAt: '2026-05-13T10:00:00.000Z' },
        0,
      ),
    ];
    const trend = computeWeeklyTrend(runs, brand, competitors, 7, now);
    expect(trend.length).toBe(1);
  });

  it('8.6.d Runs older than the window are excluded', () => {
    const runs: Run[] = [
      makeRun(
        { mentioned: true, createdAt: '2025-01-01T10:00:00.000Z' },
        0,
      ),
    ];
    expect(computeWeeklyTrend(runs, brand, competitors, 7, now)).toEqual([]);
  });

  it('8.6.e Fewer than 4 weeks of data → only present weeks emitted (chart still renders)', () => {
    const runs: Run[] = [
      makeRun(
        { mentioned: true, createdAt: '2026-06-01T10:00:00.000Z' },
        0,
      ),
    ];
    const trend = computeWeeklyTrend(runs, brand, competitors, 90, now);
    expect(trend.length).toBe(1);
    expect(trend[0].weekStart).toBe('2026-05-31');
  });

  it('8.6.f Per-week per-entity values are visibility fractions', () => {
    // Three runs in the same week: 2 brand-mentioned, 1 competitor-Beta only
    const runs: Run[] = [
      makeRun(
        { mentioned: true, createdAt: '2026-06-01T10:00:00.000Z' },
        0,
      ),
      makeRun(
        { mentioned: true, createdAt: '2026-06-02T10:00:00.000Z' },
        1,
      ),
      makeRun(
        {
          mentioned: false,
          competitorMentions: { Beta: true },
          createdAt: '2026-06-02T10:00:00.000Z',
        },
        2,
      ),
    ];
    const trend = computeWeeklyTrend(runs, brand, competitors, 7, now);
    expect(trend.length).toBe(1);
    expect(trend[0].brand).toBeCloseTo(2 / 3, 10);
    expect(trend[0].Beta).toBeCloseTo(1 / 3, 10);
    expect(trend[0].Gamma).toBe(0);
  });
});

// --------------------------------------------------------------------------
// §8.7 Domain sources
// --------------------------------------------------------------------------

describe('computeDomainSources — QA §8.7', () => {
  it('8.7.a Domain in 2 runs / 3 citations / 20 runs / 100 citations → 2/20 and 3/100', () => {
    const runs: Run[] = Array.from({ length: 20 }, (_, i) =>
      makeRun({ id: `run-${i}` }, i),
    );
    const citations: Citation[] = [];
    citations.push(
      makeCitation({ runId: 'run-0', domain: 'foo.com', type: 'Corporate' }),
      makeCitation({ runId: 'run-0', domain: 'foo.com', type: 'Corporate' }),
      makeCitation({ runId: 'run-1', domain: 'foo.com', type: 'Corporate' }),
    );
    // fill remaining 97 citations across other domains
    for (let i = 0; i < 97; i++) {
      const runId = `run-${(i % 19) + 1}`;
      citations.push(
        makeCitation({
          runId,
          domain: `other${i}.com`,
          type: 'Corporate',
        }),
      );
    }
    const rows = computeDomainSources(runs, citations);
    const foo = rows.find((r) => r.domain === 'foo.com');
    expect(foo).toBeDefined();
    expect(foo!.retrievalRate).toBeCloseTo(2 / 20, 10);
    expect(foo!.citationRate).toBeCloseTo(3 / 100, 10);
  });

  it('8.7.b Rows sorted by retrievalRate desc', () => {
    const runs: Run[] = Array.from({ length: 5 }, (_, i) =>
      makeRun({ id: `r${i}` }, i),
    );
    const citations: Citation[] = [
      makeCitation({ runId: 'r0', domain: 'a.com' }),
      makeCitation({ runId: 'r1', domain: 'a.com' }),
      makeCitation({ runId: 'r2', domain: 'a.com' }),
      makeCitation({ runId: 'r0', domain: 'b.com' }),
      makeCitation({ runId: 'r1', domain: 'b.com' }),
      makeCitation({ runId: 'r0', domain: 'c.com' }),
    ];
    const rows = computeDomainSources(runs, citations);
    expect(rows.map((r) => r.domain)).toEqual(['a.com', 'b.com', 'c.com']);
  });

  it('8.7.c Zero runs / zero citations → []', () => {
    expect(computeDomainSources([], [])).toEqual([]);
  });

  it('8.7.d Normalizes www. prefix when grouping', () => {
    const runs: Run[] = [makeRun({ id: 'r0' }, 0), makeRun({ id: 'r1' }, 1)];
    const citations: Citation[] = [
      makeCitation({ runId: 'r0', domain: 'www.foo.com' }),
      makeCitation({ runId: 'r1', domain: 'foo.com' }),
    ];
    const rows = computeDomainSources(runs, citations);
    expect(rows.length).toBe(1);
    expect(rows[0].domain).toBe('foo.com');
    expect(rows[0].retrievalRate).toBe(1);
    expect(rows[0].citationRate).toBe(1);
  });
});

// --------------------------------------------------------------------------
// §8.8 URL sources
// --------------------------------------------------------------------------

describe('computeUrlSources — QA §8.8', () => {
  it('8.8.a Groups by full URL', () => {
    const runs: Run[] = [
      makeRun({ id: 'r0' }, 0),
      makeRun({ id: 'r1' }, 1),
      makeRun({ id: 'r2' }, 2),
    ];
    const citations: Citation[] = [
      makeCitation({
        runId: 'r0',
        domain: 'foo.com',
        url: 'https://foo.com/a',
      }),
      makeCitation({
        runId: 'r1',
        domain: 'foo.com',
        url: 'https://foo.com/a',
      }),
      makeCitation({
        runId: 'r2',
        domain: 'foo.com',
        url: 'https://foo.com/b',
      }),
    ];
    const rows = computeUrlSources(runs, citations);
    expect(rows.length).toBe(2);
    const a = rows.find((r) => r.url === 'https://foo.com/a');
    const b = rows.find((r) => r.url === 'https://foo.com/b');
    expect(a!.retrievalRate).toBeCloseTo(2 / 3, 10);
    expect(b!.retrievalRate).toBeCloseTo(1 / 3, 10);
    expect(a!.citationRate).toBeCloseTo(2 / 3, 10);
  });

  it('8.8.b Citations without URL are skipped', () => {
    const runs: Run[] = [makeRun({ id: 'r0' }, 0)];
    const citations: Citation[] = [
      makeCitation({ runId: 'r0', domain: 'foo.com', url: null }),
    ];
    expect(computeUrlSources(runs, citations)).toEqual([]);
  });
});

// --------------------------------------------------------------------------
// §8.9 Competitive rank
// --------------------------------------------------------------------------

describe('computeCompetitiveRank — QA §8.9', () => {
  it('8.9.a Brand at top → rank 1', () => {
    expect(
      computeCompetitiveRank({ visibility: 0.5 }, [
        { visibility: 0.4 },
        { visibility: 0.3 },
      ]),
    ).toBe(1);
  });

  it('8.9.b One competitor above → rank 2', () => {
    expect(
      computeCompetitiveRank({ visibility: 0.3 }, [
        { visibility: 0.5 },
        { visibility: 0.2 },
      ]),
    ).toBe(2);
  });

  it('8.9.c All competitors above → rank N+1', () => {
    expect(
      computeCompetitiveRank({ visibility: 0.0 }, [
        { visibility: 0.5 },
        { visibility: 0.4 },
        { visibility: 0.3 },
      ]),
    ).toBe(4);
  });

  it('8.9.d Tie with competitor → brand wins (rank stays 1)', () => {
    expect(
      computeCompetitiveRank({ visibility: 0.3 }, [
        { visibility: 0.3 },
        { visibility: 0.3 },
      ]),
    ).toBe(1);
  });

  it('8.9.e Empty competitor list → rank 1', () => {
    expect(computeCompetitiveRank({ visibility: 0.1 }, [])).toBe(1);
  });
});

// --------------------------------------------------------------------------
// computeRankings — per-entity table
// --------------------------------------------------------------------------

describe('computeRankings (Rankings table per-entity values)', () => {
  const brand = { name: 'Acme', domain: 'acme.com' };
  const competitors = [
    { name: 'Beta', domain: 'beta.io' },
    { name: 'Gamma', domain: 'gamma.co' },
  ];

  it('produces one row per entity sorted by visibility desc, brand first on tie', () => {
    const runs: Run[] = [
      makeRun({ mentioned: true, position: 2 }, 0),
      makeRun({ mentioned: true, position: 3 }, 1),
      makeRun({ competitorMentions: { Beta: true } }, 2),
    ];
    const rows = computeRankings(brand, competitors, runs);
    expect(rows.map((r) => r.name)).toEqual(['Acme', 'Beta', 'Gamma']);
    expect(rows[0].isYou).toBe(true);
    expect(rows[0].visibility).toBeCloseTo(2 / 3, 10);
    expect(rows[1].visibility).toBeCloseTo(1 / 3, 10);
    expect(rows[2].visibility).toBe(0);
  });

  it('per-entity sentiment is averaged over runs where THAT entity was mentioned, null when zero', () => {
    const runs: Run[] = [
      makeRun({ mentioned: true, sentiment: 'positive' }, 0),
      makeRun({ mentioned: true, sentiment: 'negative' }, 1),
      makeRun(
        { competitorMentions: { Beta: true }, sentiment: 'positive' },
        2,
      ),
    ];
    const rows = computeRankings(brand, competitors, runs);
    const acme = rows.find((r) => r.name === 'Acme')!;
    const beta = rows.find((r) => r.name === 'Beta')!;
    const gamma = rows.find((r) => r.name === 'Gamma')!;
    expect(acme.sentiment).toBeCloseTo((80 + 30) / 2, 10);
    expect(beta.sentiment).toBe(80);
    expect(gamma.sentiment).toBeNull(); // never mentioned → null, not 55
  });

  it('per-entity position is null for competitors (no per-competitor position stored)', () => {
    const runs: Run[] = [
      makeRun({ mentioned: true, position: 2 }, 0),
      makeRun({ competitorMentions: { Beta: true } }, 1),
    ];
    const rows = computeRankings(brand, competitors, runs);
    const beta = rows.find((r) => r.name === 'Beta')!;
    expect(beta.position).toBeNull();
  });

  it('brand position is averaged over mentioned runs only', () => {
    const runs: Run[] = [
      makeRun({ mentioned: true, position: 1 }, 0),
      makeRun({ mentioned: true, position: 3 }, 1),
      makeRun({ mentioned: false, position: null }, 2),
    ];
    const rows = computeRankings(brand, competitors, runs);
    expect(rows[0].position).toBeCloseTo(2, 10);
  });

  it('visibility change vs prior runs is included; null when prior is empty', () => {
    const current = [
      makeRun({ mentioned: true }, 0),
      makeRun({ mentioned: false }, 1),
    ];
    const prior = [
      makeRun({ mentioned: false }, 2),
      makeRun({ mentioned: false }, 3),
    ];
    const rows = computeRankings(brand, competitors, current, prior);
    const acme = rows.find((r) => r.name === 'Acme')!;
    expect(acme.visibilityChange).toBeCloseTo(50, 6);

    const rowsNoPrior = computeRankings(brand, competitors, current, []);
    expect(rowsNoPrior.find((r) => r.name === 'Acme')!.visibilityChange).toBeNull();
  });

  it('zero runs → all visibilities 0, sentiment null, position null', () => {
    const rows = computeRankings(brand, competitors, []);
    for (const r of rows) {
      expect(r.visibility).toBe(0);
      expect(r.sov).toBe(0);
      expect(r.sentiment).toBeNull();
      expect(r.position).toBeNull();
    }
  });
});

// --------------------------------------------------------------------------
// §15.D Key insight tiers
// --------------------------------------------------------------------------

describe('buildKeyInsight — §15.D three-tier rules', () => {
  it('visibility >= 30% → strong tier copy', () => {
    expect(buildKeyInsight({ visibility: 0.3 })).toBe(
      'Strong visibility. Focus on maintaining position and expanding to adjacent topics.',
    );
    expect(buildKeyInsight({ visibility: 0.85 })).toBe(
      'Strong visibility. Focus on maintaining position and expanding to adjacent topics.',
    );
  });

  it('10% ≤ visibility < 30% → mid tier with rounded N/M and topic', () => {
    expect(
      buildKeyInsight({
        visibility: 0.15,
        competitorAvgVisibility: 0.25,
        topGapTopic: 'Affiliate',
      }),
    ).toBe(
      'You appear in 15% of responses; competitors average 25%. Focus on closing the gap on Affiliate.',
    );
  });

  it('mid tier falls back to "key topics" when topic is missing/empty', () => {
    expect(
      buildKeyInsight({
        visibility: 0.2,
        competitorAvgVisibility: 0.3,
        topGapTopic: null,
      }),
    ).toContain('closing the gap on key topics.');
  });

  it('visibility < 10% → low tier copy', () => {
    expect(buildKeyInsight({ visibility: 0.05 })).toBe(
      'Low visibility. Priority: create comparison content and target high-citation domains.',
    );
    expect(buildKeyInsight({ visibility: 0 })).toBe(
      'Low visibility. Priority: create comparison content and target high-citation domains.',
    );
  });
});

// --------------------------------------------------------------------------
// §15.E Actions
// --------------------------------------------------------------------------

describe('buildActions — §15.E deterministic rules', () => {
  const baseSources = [
    { domain: 'acme.com', type: 'You', retrievalRate: 0.5, citationRate: 0.3 },
  ] as const;
  const baseRankings = [
    {
      name: 'Acme',
      isYou: true,
      visibility: 0.5,
      sov: 0.5,
      sentiment: 70,
      position: 1.5,
      visibilityChange: 0,
    },
    {
      name: 'Beta',
      isYou: false,
      visibility: 0.2,
      sov: 0.2,
      sentiment: 60,
      position: null,
      visibilityChange: 0,
    },
  ] as const;

  it('always includes the owned-low content-hub action', () => {
    const actions = buildActions({
      metrics: { visibility: 0.5 },
      sources: baseSources.slice(),
      rankings: baseRankings.slice(),
    });
    expect(
      actions.some(
        (a) =>
          a.side === 'owned' &&
          a.priority === 'low' &&
          a.title.toLowerCase().includes('content hub'),
      ),
    ).toBe(true);
  });

  it('emits Earned/high "Close visibility gap" when top competitor outranks brand', () => {
    const rankings = [
      {
        name: 'Acme',
        isYou: true,
        visibility: 0.1,
        sov: 0.1,
        sentiment: 50,
        position: 3,
        visibilityChange: 0,
      },
      {
        name: 'Beta',
        isYou: false,
        visibility: 0.7,
        sov: 0.7,
        sentiment: 60,
        position: null,
        visibilityChange: 0,
      },
    ];
    const actions = buildActions({
      metrics: { visibility: 0.1 },
      sources: baseSources.slice(),
      rankings,
    });
    const gap = actions.find(
      (a) => a.side === 'earned' && a.priority === 'high',
    );
    expect(gap).toBeDefined();
    expect(gap!.title).toContain('Beta');
  });

  it('does NOT emit the gap action when brand leads', () => {
    const actions = buildActions({
      metrics: { visibility: 0.5 },
      sources: baseSources.slice(),
      rankings: baseRankings.slice(),
    });
    expect(
      actions.some(
        (a) =>
          a.side === 'earned' &&
          a.priority === 'high' &&
          a.title.startsWith('Close visibility gap'),
      ),
    ).toBe(false);
  });

  it('emits Earned/medium "Increase presence on UGC platforms" when UGC sources > 0', () => {
    const sources = [
      ...baseSources,
      {
        domain: 'reddit.com',
        type: 'UGC' as const,
        retrievalRate: 0.4,
        citationRate: 0.2,
      },
    ];
    const actions = buildActions({
      metrics: { visibility: 0.5 },
      sources,
      rankings: baseRankings.slice(),
    });
    expect(
      actions.some(
        (a) =>
          a.side === 'earned' &&
          a.priority === 'medium' &&
          a.title.includes('UGC'),
      ),
    ).toBe(true);
  });

  it('emits Owned/high "Boost AI search visibility" when brand visibility < 30%', () => {
    const actions = buildActions({
      metrics: { visibility: 0.1 },
      sources: baseSources.slice(),
      rankings: baseRankings.slice(),
    });
    expect(
      actions.some(
        (a) =>
          a.side === 'owned' &&
          a.priority === 'high' &&
          a.title === 'Boost AI search visibility',
      ),
    ).toBe(true);
  });

  it('does NOT emit "Boost AI search visibility" when visibility >= 30%', () => {
    const actions = buildActions({
      metrics: { visibility: 0.4 },
      sources: baseSources.slice(),
      rankings: baseRankings.slice(),
    });
    expect(
      actions.some((a) => a.title === 'Boost AI search visibility'),
    ).toBe(false);
  });

  it('emits Owned/high "Optimize your domain" when brand domain retrievalRate < 20%', () => {
    const sources = [
      {
        domain: 'acme.com',
        type: 'You' as const,
        retrievalRate: 0.05,
        citationRate: 0.05,
      },
    ];
    const actions = buildActions({
      metrics: { visibility: 0.5 },
      sources,
      rankings: baseRankings.slice(),
    });
    expect(
      actions.some(
        (a) =>
          a.side === 'owned' &&
          a.priority === 'high' &&
          a.title === 'Optimize your domain for LLM retrieval',
      ),
    ).toBe(true);
  });

  it('emits Earned/medium "Get listed on top-cited corporate domains" when corporate count >= 3', () => {
    const sources = [
      ...baseSources,
      {
        domain: 'a.com',
        type: 'Corporate' as const,
        retrievalRate: 0.1,
        citationRate: 0.1,
      },
      {
        domain: 'b.com',
        type: 'Corporate' as const,
        retrievalRate: 0.1,
        citationRate: 0.1,
      },
      {
        domain: 'c.com',
        type: 'Corporate' as const,
        retrievalRate: 0.1,
        citationRate: 0.1,
      },
    ];
    const actions = buildActions({
      metrics: { visibility: 0.5 },
      sources,
      rankings: baseRankings.slice(),
    });
    expect(
      actions.some(
        (a) => a.title === 'Get listed on top-cited corporate domains',
      ),
    ).toBe(true);
  });

  it('does NOT emit corporate action when corporate count < 3', () => {
    const sources = [
      ...baseSources,
      {
        domain: 'a.com',
        type: 'Corporate' as const,
        retrievalRate: 0.1,
        citationRate: 0.1,
      },
      {
        domain: 'b.com',
        type: 'Corporate' as const,
        retrievalRate: 0.1,
        citationRate: 0.1,
      },
    ];
    const actions = buildActions({
      metrics: { visibility: 0.5 },
      sources,
      rankings: baseRankings.slice(),
    });
    expect(
      actions.some(
        (a) => a.title === 'Get listed on top-cited corporate domains',
      ),
    ).toBe(false);
  });
});
