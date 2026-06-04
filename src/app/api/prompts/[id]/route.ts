import { NextResponse } from 'next/server';
import {
  getCitationsForRunIds,
  getPrompt,
  getRunsForPrompt,
  getRunsForPromptInWindow,
} from '@/lib/queries';
import type {
  ModelBreakdownRow,
  ModelFilter,
  ModelShortId,
  PromptDetailCitation,
  PromptDetailResponse,
  Run,
} from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RUNS_LIMIT = 50;

const MODEL_SHORT_IDS: ModelShortId[] = [
  'openai',
  'claude',
  'gemini',
  'perplexity',
  'google_aio',
];

function parseDays(value: string | null): number {
  if (!value) return 7;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0 || n > 3650) return 7;
  return n;
}

function parseModel(value: string | null): ModelFilter | undefined {
  if (!value || value === 'all') return undefined;
  return (MODEL_SHORT_IDS as string[]).includes(value)
    ? (value as ModelShortId)
    : undefined;
}

function previewOf(text: string | null): string {
  if (!text) return '';
  return text.slice(0, 300);
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse<PromptDetailResponse | { error: string }>> {
  const { id } = await context.params;
  const url = new URL(req.url);
  const days = parseDays(url.searchParams.get('days'));
  const model = parseModel(url.searchParams.get('model'));

  const prompt = await getPrompt(id);
  if (!prompt) {
    return NextResponse.json({ error: 'Prompt not found' }, { status: 404 });
  }

  const [recentRuns, windowRuns] = await Promise.all([
    getRunsForPrompt(id, RUNS_LIMIT),
    getRunsForPromptInWindow(id, days, model),
  ]);

  const recentRunIds = recentRuns.map((r) => r.id);
  const citationRows = await getCitationsForRunIds(recentRunIds);

  const citations: PromptDetailCitation[] = citationRows.map((c) => ({
    domain: c.domain,
    url: c.url,
    type: c.domainType,
    runId: c.runId,
  }));

  const latestByModel = new Map<ModelShortId, Run>();
  for (const r of windowRuns) {
    if (!latestByModel.has(r.model)) {
      latestByModel.set(r.model, r);
    }
  }

  const citationCountByRunId = new Map<string, number>();
  for (const c of citationRows) {
    citationCountByRunId.set(c.runId, (citationCountByRunId.get(c.runId) ?? 0) + 1);
  }

  const modelBreakdown: ModelBreakdownRow[] = MODEL_SHORT_IDS.map((m) => {
    const latest = latestByModel.get(m);
    if (!latest) {
      return {
        model: m,
        mentioned: null,
        position: null,
        sentiment: null,
        citationCount: 0,
        latestResponsePreview: '',
        latestResponseFull: '',
      };
    }
    return {
      model: m,
      mentioned: latest.mentioned,
      position: latest.positionScore,
      sentiment: latest.sentiment,
      citationCount: citationCountByRunId.get(latest.id) ?? 0,
      latestResponsePreview: previewOf(latest.response),
      latestResponseFull: latest.response ?? '',
    };
  });

  return NextResponse.json({
    prompt: {
      id: prompt.id,
      text: prompt.text,
      topic: prompt.topic,
      isActive: prompt.isActive,
    },
    runs: recentRuns,
    citations,
    modelBreakdown,
  });
}
