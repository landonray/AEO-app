import { type NextRequest, NextResponse } from 'next/server';
import {
  getCitations,
  getPrimaryBrand,
  getRuns,
} from '@/lib/queries';
import { computeDomainSources, computeUrlSources } from '@/lib/metrics';
import { normalizeDomain } from '@/lib/utils';
import type {
  Citation,
  DomainTypeBreakdownRow,
  ModelFilter,
  ModelShortId,
  Run,
  SourceRow,
  SourcesResponse,
  SourcesView,
  TrendRow,
} from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL_SHORT_IDS: ReadonlySet<ModelShortId> = new Set([
  'openai',
  'claude',
  'gemini',
  'perplexity',
  'google_aio',
]);

const MS_PER_DAY = 86_400_000;
const TOP_TREND_ENTITIES = 5;

function parseDays(raw: string | null): number {
  if (!raw) return 7;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return 7;
  return Math.min(n, 3650);
}

function parseModel(raw: string | null): ModelFilter | undefined {
  if (!raw || raw === 'all') return undefined;
  if (MODEL_SHORT_IDS.has(raw as ModelShortId)) {
    return raw as ModelShortId;
  }
  return undefined;
}

function parseView(raw: string | null): SourcesView {
  return raw === 'urls' ? 'urls' : 'domains';
}

function formatYMD(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function computeDomainTypeBreakdown(
  citations: ReadonlyArray<Citation>,
): DomainTypeBreakdownRow[] {
  if (citations.length === 0) return [];
  const counts = new Map<Citation['domainType'], number>();
  for (const c of citations) {
    counts.set(c.domainType, (counts.get(c.domainType) ?? 0) + 1);
  }
  const total = citations.length;
  return Array.from(counts.entries())
    .map(([type, count]) => ({
      type,
      count,
      percentage: total === 0 ? 0 : count / total,
    }))
    .sort((a, b) => b.count - a.count);
}

function entityKey(view: SourcesView, source: SourceRow): string {
  if (view === 'urls') return source.url ?? '';
  return source.domain;
}

function citationKey(view: SourcesView, citation: Citation): string {
  if (view === 'urls') return citation.url ?? '';
  return normalizeDomain(citation.domain);
}

function computeSourcesTrend(
  runs: ReadonlyArray<Run>,
  citations: ReadonlyArray<Citation>,
  sources: ReadonlyArray<SourceRow>,
  view: SourcesView,
  days: number,
  now: Date = new Date(),
): TrendRow[] {
  if (runs.length === 0 || sources.length === 0) return [];

  const topEntities = sources
    .slice(0, TOP_TREND_ENTITIES)
    .map((s) => entityKey(view, s))
    .filter((k) => k.length > 0);
  if (topEntities.length === 0) return [];

  const topSet = new Set(topEntities);
  const windowDays = Math.max(days, 28);
  const cutoff = now.getTime() - windowDays * MS_PER_DAY;

  const runDay = new Map<string, string>();
  const totalRunsPerDay = new Map<string, number>();
  for (const r of runs) {
    const t = new Date(r.createdAt).getTime();
    if (!Number.isFinite(t) || t < cutoff) continue;
    const day = formatYMD(new Date(t));
    runDay.set(r.id, day);
    totalRunsPerDay.set(day, (totalRunsPerDay.get(day) ?? 0) + 1);
  }

  const entityRunsPerDay = new Map<string, Map<string, Set<string>>>();
  for (const c of citations) {
    const day = runDay.get(c.runId);
    if (!day) continue;
    const key = citationKey(view, c);
    if (!key || !topSet.has(key)) continue;
    let perDay = entityRunsPerDay.get(day);
    if (!perDay) {
      perDay = new Map();
      entityRunsPerDay.set(day, perDay);
    }
    let runSet = perDay.get(key);
    if (!runSet) {
      runSet = new Set();
      perDay.set(key, runSet);
    }
    runSet.add(c.runId);
  }

  const dayKeys = Array.from(totalRunsPerDay.keys()).sort();
  return dayKeys.map((date) => {
    const total = totalRunsPerDay.get(date) ?? 0;
    const row: TrendRow = { date, brand: 0 };
    for (const key of topEntities) {
      const cited = entityRunsPerDay.get(date)?.get(key)?.size ?? 0;
      row[key] = total === 0 ? 0 : cited / total;
    }
    return row;
  });
}

export async function GET(
  req: NextRequest,
): Promise<NextResponse<SourcesResponse>> {
  const url = new URL(req.url);
  const days = parseDays(url.searchParams.get('days'));
  const model = parseModel(url.searchParams.get('model'));
  const view = parseView(url.searchParams.get('view'));

  const brand = await getPrimaryBrand();
  if (!brand) {
    return NextResponse.json({
      sources: [],
      domainTypes: [],
      trend: [],
      view,
    });
  }

  const [runs, citations] = await Promise.all([
    getRuns({ brandId: brand.id, days, model }),
    getCitations({ brandId: brand.id, days, model, view }),
  ]);

  const sources =
    view === 'urls'
      ? computeUrlSources(runs, citations)
      : computeDomainSources(runs, citations);

  const domainTypes = computeDomainTypeBreakdown(citations);
  const trend = computeSourcesTrend(runs, citations, sources, view, days);

  return NextResponse.json({ sources, domainTypes, trend, view });
}
