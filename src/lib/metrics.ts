import { normalizeDomain } from '@/lib/utils';
import type {
  ActionCard,
  Citation,
  DomainType,
  RankingsRow,
  Run,
  Sentiment,
  SourceRow,
  TrendRow,
} from '@/types';

const SENTIMENT_SCORE: Record<Sentiment, number> = {
  positive: 80,
  neutral: 55,
  negative: 30,
};

const MS_PER_DAY = 86_400_000;

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

type RunMentioned = Pick<Run, 'mentioned'>;
type RunForCompetitor = Pick<Run, 'competitorMentions'>;
type RunForPosition = Pick<Run, 'positionScore'>;
type RunForSentiment = Pick<Run, 'mentioned' | 'sentiment'>;
type RunWithTime = Pick<Run, 'mentioned' | 'competitorMentions' | 'createdAt'>;
type CitationForSources = Pick<Citation, 'domain' | 'url' | 'domainType' | 'runId'>;

function competitorMentionedCount(
  runs: ReadonlyArray<RunForCompetitor>,
  competitorName: string,
): number {
  let count = 0;
  for (const r of runs) {
    const mentions = r.competitorMentions ?? {};
    if (mentions[competitorName] === true) count++;
  }
  return count;
}

function competitorVisibility(
  runs: ReadonlyArray<RunForCompetitor>,
  competitorName: string,
): number {
  if (runs.length === 0) return 0;
  return competitorMentionedCount(runs, competitorName) / runs.length;
}

function formatYMD(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function avgSentimentOver(
  runs: ReadonlyArray<RunForSentiment>,
  predicate: (run: RunForSentiment) => boolean,
): number | null {
  let total = 0;
  let count = 0;
  for (const r of runs) {
    if (!predicate(r)) continue;
    total += SENTIMENT_SCORE[r.sentiment];
    count++;
  }
  if (count === 0) return null;
  return total / count;
}

// --------------------------------------------------------------------------
// §13.1 Visibility
// --------------------------------------------------------------------------

export function computeVisibility(runs: ReadonlyArray<RunMentioned>): number {
  if (runs.length === 0) return 0;
  let mentioned = 0;
  for (const r of runs) {
    if (r.mentioned) mentioned++;
  }
  return mentioned / runs.length;
}

// --------------------------------------------------------------------------
// §13.2 Share of Voice
// --------------------------------------------------------------------------

export function computeSOV(
  runs: ReadonlyArray<Pick<Run, 'mentioned' | 'competitorMentions'>>,
  competitors: ReadonlyArray<{ name: string }>,
): number {
  let brandMentions = 0;
  for (const r of runs) {
    if (r.mentioned) brandMentions++;
  }
  let compMentions = 0;
  for (const c of competitors) {
    compMentions += competitorMentionedCount(runs, c.name);
  }
  const denom = brandMentions + compMentions;
  if (denom === 0) return 0;
  return brandMentions / denom;
}

// --------------------------------------------------------------------------
// §13.3 Average position
// --------------------------------------------------------------------------

export function computeAvgPosition(
  runs: ReadonlyArray<RunForPosition>,
): number | null {
  let total = 0;
  let count = 0;
  for (const r of runs) {
    const v = r.positionScore;
    if (typeof v === 'number' && Number.isFinite(v)) {
      total += v;
      count++;
    }
  }
  if (count === 0) return null;
  return total / count;
}

// --------------------------------------------------------------------------
// §13.4 Average sentiment — mentioned-only, null when empty
// --------------------------------------------------------------------------

export function computeAvgSentiment(
  runs: ReadonlyArray<RunForSentiment>,
): number | null {
  return avgSentimentOver(runs, (r) => r.mentioned === true);
}

// --------------------------------------------------------------------------
// §13.5 Visibility change (percentage-point delta)
// --------------------------------------------------------------------------

export function computeVisibilityChange(
  currentRuns: ReadonlyArray<RunMentioned>,
  priorRuns: ReadonlyArray<RunMentioned>,
): number | null {
  if (priorRuns.length === 0) return null;
  const current = computeVisibility(currentRuns);
  const prior = computeVisibility(priorRuns);
  return (current - prior) * 100;
}

// --------------------------------------------------------------------------
// §13.6 Daily visibility trend
// --------------------------------------------------------------------------

export function computeDailyTrend(
  runs: ReadonlyArray<RunWithTime>,
  _brand: { name: string } | null | undefined,
  competitors: ReadonlyArray<{ name: string }>,
  days: number,
  now: Date = new Date(),
): TrendRow[] {
  const windowDays = Math.max(days, 28);
  const cutoff = now.getTime() - windowDays * MS_PER_DAY;

  const buckets = new Map<string, RunWithTime[]>();
  for (const r of runs) {
    const t = new Date(r.createdAt).getTime();
    if (!Number.isFinite(t)) continue;
    if (t < cutoff) continue;
    const key = formatYMD(new Date(t));
    let arr = buckets.get(key);
    if (!arr) {
      arr = [];
      buckets.set(key, arr);
    }
    arr.push(r);
  }

  const keys = Array.from(buckets.keys()).sort();
  return keys.map((date) => {
    const dayRuns = buckets.get(date) ?? [];
    const row: TrendRow = {
      date,
      brand: computeVisibility(dayRuns),
    };
    for (const c of competitors) {
      row[c.name] = competitorVisibility(dayRuns, c.name);
    }
    return row;
  });
}

// --------------------------------------------------------------------------
// §13.7 Domain sources
// --------------------------------------------------------------------------

interface DomainAggregate {
  type: DomainType;
  citationCount: number;
  runIds: Set<string>;
}

export function computeDomainSources(
  runs: ReadonlyArray<Pick<Run, 'id'>>,
  citations: ReadonlyArray<CitationForSources>,
): SourceRow[] {
  const totalRuns = runs.length;
  const totalCitations = citations.length;

  const perDomain = new Map<string, DomainAggregate>();

  for (const c of citations) {
    const dom = normalizeDomain(c.domain);
    if (!dom) continue;
    let entry = perDomain.get(dom);
    if (!entry) {
      entry = { type: c.domainType, citationCount: 0, runIds: new Set() };
      perDomain.set(dom, entry);
    }
    entry.citationCount++;
    entry.runIds.add(c.runId);
  }

  const rows: SourceRow[] = Array.from(perDomain.entries()).map(
    ([domain, info]) => ({
      domain,
      type: info.type,
      retrievalRate: totalRuns === 0 ? 0 : info.runIds.size / totalRuns,
      citationRate: totalCitations === 0 ? 0 : info.citationCount / totalCitations,
    }),
  );

  rows.sort((a, b) => b.retrievalRate - a.retrievalRate);
  return rows;
}

// --------------------------------------------------------------------------
// §13.8 URL sources
// --------------------------------------------------------------------------

interface UrlAggregate {
  domain: string;
  type: DomainType;
  citationCount: number;
  runIds: Set<string>;
}

export function computeUrlSources(
  runs: ReadonlyArray<Pick<Run, 'id'>>,
  citations: ReadonlyArray<CitationForSources>,
): SourceRow[] {
  const totalRuns = runs.length;
  const totalCitations = citations.length;

  const perUrl = new Map<string, UrlAggregate>();

  for (const c of citations) {
    const url = c.url ?? '';
    if (!url) continue;
    let entry = perUrl.get(url);
    if (!entry) {
      entry = {
        domain: normalizeDomain(c.domain) || c.domain,
        type: c.domainType,
        citationCount: 0,
        runIds: new Set(),
      };
      perUrl.set(url, entry);
    }
    entry.citationCount++;
    entry.runIds.add(c.runId);
  }

  const rows: SourceRow[] = Array.from(perUrl.entries()).map(([url, info]) => ({
    domain: info.domain,
    url,
    type: info.type,
    retrievalRate: totalRuns === 0 ? 0 : info.runIds.size / totalRuns,
    citationRate: totalCitations === 0 ? 0 : info.citationCount / totalCitations,
  }));

  rows.sort((a, b) => b.retrievalRate - a.retrievalRate);
  return rows;
}

// --------------------------------------------------------------------------
// Competitive rank — brand wins ties (§18.2 default)
// --------------------------------------------------------------------------

export function computeCompetitiveRank(
  brand: { visibility: number },
  competitors: ReadonlyArray<{ visibility: number }>,
): number {
  let aboveCount = 0;
  for (const c of competitors) {
    if (c.visibility > brand.visibility) aboveCount++;
  }
  return aboveCount + 1;
}

// --------------------------------------------------------------------------
// Rankings — per-entity visibility, SOV, sentiment, position, change
// --------------------------------------------------------------------------

export interface RankingsBrand {
  name: string;
  domain?: string;
}

export interface RankingsCompetitor {
  name: string;
  domain?: string;
}

export function computeRankings(
  brand: RankingsBrand,
  competitors: ReadonlyArray<RankingsCompetitor>,
  runs: ReadonlyArray<Run>,
  priorRuns: ReadonlyArray<Run> = [],
): RankingsRow[] {
  const totalRuns = runs.length;

  let brandMentions = 0;
  for (const r of runs) {
    if (r.mentioned) brandMentions++;
  }
  const competitorTotals = competitors.map((c) => ({
    name: c.name,
    count: competitorMentionedCount(runs, c.name),
  }));
  const totalAllMentions =
    brandMentions + competitorTotals.reduce((acc, c) => acc + c.count, 0);

  const brandRow: RankingsRow = {
    name: brand.name,
    isYou: true,
    visibility: totalRuns === 0 ? 0 : brandMentions / totalRuns,
    sov: totalAllMentions === 0 ? 0 : brandMentions / totalAllMentions,
    sentiment: computeAvgSentiment(runs),
    position: computeAvgPosition(runs.filter((r) => r.mentioned)),
    visibilityChange: computeVisibilityChange(runs, priorRuns),
  };

  const competitorRows: RankingsRow[] = competitors.map((c, i) => {
    const count = competitorTotals[i]?.count ?? 0;
    const competitorRuns = runs.filter(
      (r) => (r.competitorMentions ?? {})[c.name] === true,
    );
    const competitorPriorRuns = priorRuns.filter(
      (r) => (r.competitorMentions ?? {})[c.name] === true,
    );
    const visibility = totalRuns === 0 ? 0 : count / totalRuns;
    let visibilityChange: number | null = null;
    if (priorRuns.length > 0) {
      const priorVisibility = competitorPriorRuns.length / priorRuns.length;
      visibilityChange = (visibility - priorVisibility) * 100;
    }
    return {
      name: c.name,
      isYou: false,
      visibility,
      sov: totalAllMentions === 0 ? 0 : count / totalAllMentions,
      sentiment: avgSentimentOver(competitorRuns, () => true),
      position: null,
      visibilityChange,
    };
  });

  const rows = [brandRow, ...competitorRows];
  rows.sort((a, b) => {
    if (b.visibility !== a.visibility) return b.visibility - a.visibility;
    if (a.isYou && !b.isYou) return -1;
    if (!a.isYou && b.isYou) return 1;
    return 0;
  });
  return rows;
}

// --------------------------------------------------------------------------
// §15.D Key Insight
// --------------------------------------------------------------------------

export interface KeyInsightInput {
  visibility: number;
  competitorAvgVisibility?: number;
  topGapTopic?: string | null;
}

export function buildKeyInsight(input: KeyInsightInput): string {
  const v = input.visibility;
  if (v >= 0.3) {
    return 'Strong visibility. Focus on maintaining position and expanding to adjacent topics.';
  }
  if (v >= 0.1) {
    const n = Math.round(v * 100);
    const m = Math.round((input.competitorAvgVisibility ?? 0) * 100);
    const topic =
      input.topGapTopic && input.topGapTopic.trim()
        ? input.topGapTopic
        : 'key topics';
    return `You appear in ${n}% of responses; competitors average ${m}%. Focus on closing the gap on ${topic}.`;
  }
  return 'Low visibility. Priority: create comparison content and target high-citation domains.';
}

// --------------------------------------------------------------------------
// §15.E Actions
// --------------------------------------------------------------------------

export interface BuildActionsInput {
  metrics: { visibility: number };
  sources: ReadonlyArray<SourceRow>;
  rankings: ReadonlyArray<RankingsRow>;
}

export function buildActions(input: BuildActionsInput): ActionCard[] {
  const actions: ActionCard[] = [];
  const brandVisibility = input.metrics.visibility;

  const competitors = input.rankings.filter((r) => !r.isYou);
  let topCompetitor: RankingsRow | null = null;
  for (const c of competitors) {
    if (topCompetitor === null || c.visibility > topCompetitor.visibility) {
      topCompetitor = c;
    }
  }

  if (topCompetitor && topCompetitor.visibility > brandVisibility) {
    actions.push({
      side: 'earned',
      priority: 'high',
      title: `Close visibility gap with ${topCompetitor.name}`,
      description: `${topCompetitor.name} appears in ${Math.round(
        topCompetitor.visibility * 100,
      )}% of tracked responses; you appear in ${Math.round(
        brandVisibility * 100,
      )}%. Prioritize comparison and category content.`,
    });
  }

  const ugcCount = input.sources.filter((s) => s.type === 'UGC').length;
  if (ugcCount > 0) {
    actions.push({
      side: 'earned',
      priority: 'medium',
      title: 'Increase presence on UGC platforms',
      description:
        'Reddit, Quora, YouTube and review sites are surfacing in AI answers. Invest in authentic presence there.',
    });
  }

  if (brandVisibility < 0.3) {
    actions.push({
      side: 'owned',
      priority: 'high',
      title: 'Boost AI search visibility',
      description:
        'Your brand appears in fewer than 30% of tracked responses. Publish comparison, alternatives, and category content that LLMs can retrieve.',
    });
  }

  const yourSource = input.sources.find((s) => s.type === 'You');
  const yourRetrieval = yourSource?.retrievalRate ?? 0;
  if (yourRetrieval < 0.2) {
    actions.push({
      side: 'owned',
      priority: 'high',
      title: 'Optimize your domain for LLM retrieval',
      description:
        'Your own domain is retrieved in fewer than 20% of runs. Improve structured content, authoritative pages, and crawlability.',
    });
  }

  const corporateCount = input.sources.filter((s) => s.type === 'Corporate').length;
  if (corporateCount >= 3) {
    actions.push({
      side: 'earned',
      priority: 'medium',
      title: 'Get listed on top-cited corporate domains',
      description:
        'Corporate sites are heavily cited by AI answers. Pursue inclusion in industry roundups, partner pages, and review sites.',
    });
  }

  actions.push({
    side: 'owned',
    priority: 'low',
    title: 'Create an AI-optimized content hub',
    description:
      'Maintain a long-term hub of comparison, alternative, and how-to content optimized for AI answer surfaces.',
  });

  return actions;
}
