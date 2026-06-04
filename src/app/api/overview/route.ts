import { NextResponse, type NextRequest } from 'next/server';

import {
  getCitations,
  getLastRunTimestamp,
  getPrimaryBrand,
  getRuns,
  listCompetitors,
  listPrompts,
} from '@/lib/queries';
import {
  buildActions,
  buildKeyInsight,
  computeAvgPosition,
  computeAvgSentiment,
  computeCompetitiveRank,
  computeDomainSources,
  computeRankings,
  computeSOV,
  computeVisibility,
  computeVisibilityChange,
  computeDailyTrend,
} from '@/lib/metrics';
import type {
  Brand,
  Citation,
  Competitor,
  DomainType,
  DomainTypeBreakdownRow,
  ModelFilter,
  ModelShortId,
  OverviewMetrics,
  OverviewResponse,
  Prompt,
  RecentChatRow,
  Run,
  Sentiment,
  SourceRow,
} from '@/types';

const MS_PER_DAY = 86_400_000;
const RECENT_CHATS_LIMIT = 6;
const SOURCES_LIMIT = 8;
const MAX_DAYS = 3650;

const VALID_MODEL_FILTERS: ReadonlyArray<ModelFilter> = [
  'all',
  'openai',
  'claude',
  'gemini',
  'perplexity',
  'google_aio',
];

const SENTIMENT_SCORE: Record<Sentiment, number> = {
  positive: 80,
  neutral: 55,
  negative: 30,
};

function parseDays(input: string | null): number {
  if (input === null || input === '') return 7;
  const n = Number(input);
  if (!Number.isFinite(n) || n < 1) return 7;
  return Math.min(Math.floor(n), MAX_DAYS);
}

function parseModel(input: string | null): ModelFilter | undefined {
  if (input === null || input === '') return undefined;
  if ((VALID_MODEL_FILTERS as readonly string[]).includes(input)) {
    return input as ModelFilter;
  }
  return undefined;
}

function tsOf(run: { createdAt: string }): number {
  const t = new Date(run.createdAt).getTime();
  return Number.isFinite(t) ? t : -Infinity;
}

function runsBetween(
  runs: ReadonlyArray<Run>,
  fromInclusive: number,
  toExclusive: number,
): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    const t = tsOf(r);
    if (t === -Infinity) continue;
    if (t >= fromInclusive && t < toExclusive) out.push(r);
  }
  return out;
}

function computeDomainTypes(
  citations: ReadonlyArray<Citation>,
): DomainTypeBreakdownRow[] {
  const total = citations.length;
  if (total === 0) return [];
  const counts = new Map<DomainType, number>();
  for (const c of citations) {
    counts.set(c.domainType, (counts.get(c.domainType) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([type, count]) => ({
      type,
      count,
      percentage: count / total,
    }))
    .sort((a, b) => b.count - a.count);
}

function computeRecentChats(
  prompts: ReadonlyArray<Pick<Prompt, 'id' | 'text'>>,
  windowRuns: ReadonlyArray<Run>,
  windowCitations: ReadonlyArray<Citation>,
): RecentChatRow[] {
  const promptMeta = new Map(prompts.map((p) => [p.id, p]));

  const citationsByRun = new Map<string, number>();
  for (const c of windowCitations) {
    citationsByRun.set(c.runId, (citationsByRun.get(c.runId) ?? 0) + 1);
  }

  const runsByPrompt = new Map<string, Run[]>();
  for (const r of windowRuns) {
    let arr = runsByPrompt.get(r.promptId);
    if (!arr) {
      arr = [];
      runsByPrompt.set(r.promptId, arr);
    }
    arr.push(r);
  }

  type Entry = { promptId: string; latestTs: number; runs: Run[] };
  const entries: Entry[] = [];
  for (const [promptId, runs] of runsByPrompt) {
    let latest = -Infinity;
    for (const r of runs) {
      const t = tsOf(r);
      if (t > latest) latest = t;
    }
    entries.push({ promptId, latestTs: latest, runs });
  }
  entries.sort((a, b) => b.latestTs - a.latestTs);

  const rows: RecentChatRow[] = [];
  for (const entry of entries.slice(0, RECENT_CHATS_LIMIT)) {
    const meta = promptMeta.get(entry.promptId);
    if (!meta) continue;

    const modelsSet = new Set<ModelShortId>();
    for (const r of entry.runs) modelsSet.add(r.model);

    let citationCount = 0;
    for (const r of entry.runs) {
      citationCount += citationsByRun.get(r.id) ?? 0;
    }

    const mentionedRuns = entry.runs.filter((r) => r.mentioned);
    const sentimentScore =
      mentionedRuns.length === 0
        ? null
        : mentionedRuns.reduce(
            (acc, r) => acc + SENTIMENT_SCORE[r.sentiment],
            0,
          ) / mentionedRuns.length;

    let latestRun: Run | null = null;
    for (const r of entry.runs) {
      if (latestRun === null || tsOf(r) > tsOf(latestRun)) latestRun = r;
    }
    const sentimentLabel: Sentiment = latestRun?.sentiment ?? 'neutral';
    const position = computeAvgPosition(mentionedRuns);

    rows.push({
      promptId: entry.promptId,
      text: meta.text,
      models: Array.from(modelsSet),
      citationCount,
      sentiment: { label: sentimentLabel, score: sentimentScore },
      position,
      date: latestRun?.createdAt ?? new Date(entry.latestTs).toISOString(),
    });
  }
  return rows;
}

function computeTopGapTopic(
  competitors: ReadonlyArray<Pick<Competitor, 'name'>>,
  prompts: ReadonlyArray<Pick<Prompt, 'id' | 'topic'>>,
  runs: ReadonlyArray<Run>,
): string | null {
  if (competitors.length === 0) return null;
  const topicByPrompt = new Map(prompts.map((p) => [p.id, p.topic]));
  const runsByTopic = new Map<string, Run[]>();
  for (const r of runs) {
    const t = topicByPrompt.get(r.promptId);
    if (!t) continue;
    let arr = runsByTopic.get(t);
    if (!arr) {
      arr = [];
      runsByTopic.set(t, arr);
    }
    arr.push(r);
  }
  let best: { topic: string; gap: number } | null = null;
  for (const [topic, topicRuns] of runsByTopic) {
    if (topicRuns.length === 0) continue;
    let brandMentioned = 0;
    for (const r of topicRuns) {
      if (r.mentioned) brandMentioned++;
    }
    const brandVis = brandMentioned / topicRuns.length;

    let compMentions = 0;
    for (const c of competitors) {
      for (const r of topicRuns) {
        if ((r.competitorMentions ?? {})[c.name] === true) compMentions++;
      }
    }
    const compVis = compMentions / (topicRuns.length * competitors.length);
    const gap = compVis - brandVis;
    if (gap > 0 && (best === null || gap > best.gap)) {
      best = { topic, gap };
    }
  }
  return best?.topic ?? null;
}

export interface ComposeOverviewInput {
  brand: Brand;
  competitors: ReadonlyArray<Competitor>;
  prompts: ReadonlyArray<Pick<Prompt, 'id' | 'text' | 'topic'>>;
  allRuns: ReadonlyArray<Run>;
  windowCitations: ReadonlyArray<Citation>;
  lastUpdated: string | null;
  days: number;
  now: Date;
}

export function composeOverview(input: ComposeOverviewInput): OverviewResponse {
  const { brand, competitors, prompts, allRuns, windowCitations, lastUpdated, days, now } =
    input;

  const nowMs = now.getTime();
  const currentStart = nowMs - days * MS_PER_DAY;
  const priorStart = nowMs - days * 2 * MS_PER_DAY;
  const trendStart = nowMs - Math.max(days, 28) * MS_PER_DAY;

  const currentRuns = runsBetween(allRuns, currentStart, nowMs + 1);
  const priorRuns = runsBetween(allRuns, priorStart, currentStart);
  const trendRuns = runsBetween(allRuns, trendStart, nowMs + 1);

  const visibility = computeVisibility(currentRuns);
  const visibilityChange = computeVisibilityChange(currentRuns, priorRuns);
  let mentioned = 0;
  for (const r of currentRuns) if (r.mentioned) mentioned++;
  const totalRuns = currentRuns.length;
  const avgSentiment = computeAvgSentiment(currentRuns);
  const avgPosition = computeAvgPosition(currentRuns);
  const sov = computeSOV(currentRuns, competitors);
  const totalCitations = windowCitations.length;

  const rankings = computeRankings(brand, competitors, currentRuns, priorRuns);
  const competitorVis = rankings
    .filter((r) => !r.isYou)
    .map((r) => ({ visibility: r.visibility }));
  const competitiveRank = computeCompetitiveRank({ visibility }, competitorVis);

  const metrics: OverviewMetrics = {
    visibility,
    visibilityChange,
    mentioned,
    totalRuns,
    avgSentiment,
    avgPosition,
    sov,
    competitiveRank,
    totalCitations,
  };

  const trend = computeDailyTrend(trendRuns, brand, competitors, days, now);

  const allSources: SourceRow[] = computeDomainSources(currentRuns, windowCitations);
  const sources = allSources.slice(0, SOURCES_LIMIT);

  const domainTypes = computeDomainTypes(windowCitations);

  const recentChats = computeRecentChats(prompts, currentRuns, windowCitations);

  const competitorAvgVisibility =
    competitorVis.length === 0
      ? 0
      : competitorVis.reduce((acc, c) => acc + c.visibility, 0) /
        competitorVis.length;
  const topGapTopic = computeTopGapTopic(competitors, prompts, currentRuns);

  const keyInsight = buildKeyInsight({
    visibility,
    competitorAvgVisibility,
    topGapTopic,
  });

  const actions = buildActions({
    metrics: { visibility },
    sources: allSources,
    rankings,
  });

  return {
    brand: {
      id: brand.id,
      name: brand.name,
      domain: brand.domain,
      category: brand.category,
      description: brand.description,
    },
    competitors: competitors.map((c) => ({ name: c.name, domain: c.domain })),
    metrics,
    rankings,
    trend,
    sources,
    domainTypes,
    recentChats,
    lastUpdated,
    keyInsight,
    actions,
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const days = parseDays(url.searchParams.get('days'));
  const model = parseModel(url.searchParams.get('model'));

  const brand = await getPrimaryBrand();
  if (!brand) {
    return NextResponse.json(
      { error: 'No primary brand. Complete onboarding first.' },
      { status: 404 },
    );
  }

  const fetchWindowDays = Math.max(days * 2, 28);

  const [competitors, prompts, allRuns, windowCitations, lastUpdated] =
    await Promise.all([
      listCompetitors(brand.id),
      listPrompts(brand.id),
      getRuns({ brandId: brand.id, days: fetchWindowDays, model }),
      getCitations({ brandId: brand.id, days, model }),
      getLastRunTimestamp(brand.id),
    ]);

  const payload = composeOverview({
    brand,
    competitors,
    prompts,
    allRuns,
    windowCitations,
    lastUpdated,
    days,
    now: new Date(),
  });

  return NextResponse.json(payload);
}
