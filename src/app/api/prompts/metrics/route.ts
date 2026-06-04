import { NextResponse } from 'next/server';
import {
  computeAvgPosition,
  computeAvgSentiment,
  computeVisibility,
} from '@/lib/metrics';
import {
  getPrimaryBrand,
  getRuns,
  listActivePrompts,
} from '@/lib/queries';
import type {
  ModelFilter,
  ModelShortId,
  PromptMetricsRow,
  PromptsMetricsResponse,
  Run,
} from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseDays(value: string | null): number {
  if (!value) return 7;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0 || n > 3650) return 7;
  return n;
}

const MODEL_SHORT_IDS: ModelShortId[] = [
  'openai',
  'claude',
  'gemini',
  'perplexity',
  'google_aio',
];

function parseModel(value: string | null): ModelFilter | undefined {
  if (!value || value === 'all') return undefined;
  return (MODEL_SHORT_IDS as string[]).includes(value)
    ? (value as ModelShortId)
    : undefined;
}

export async function GET(req: Request): Promise<NextResponse<PromptsMetricsResponse>> {
  const url = new URL(req.url);
  const days = parseDays(url.searchParams.get('days'));
  const model = parseModel(url.searchParams.get('model'));

  const brand = await getPrimaryBrand();
  if (!brand) {
    return NextResponse.json({ prompts: [] });
  }

  const [prompts, runs] = await Promise.all([
    listActivePrompts(brand.id),
    getRuns({ brandId: brand.id, days, model }),
  ]);

  const runsByPromptId = new Map<string, Run[]>();
  for (const r of runs) {
    let arr = runsByPromptId.get(r.promptId);
    if (!arr) {
      arr = [];
      runsByPromptId.set(r.promptId, arr);
    }
    arr.push(r);
  }

  const rows: PromptMetricsRow[] = prompts.map((p) => {
    const pruns = runsByPromptId.get(p.id) ?? [];
    const visibility = computeVisibility(pruns);
    const sentiment = computeAvgSentiment(pruns);
    const position = computeAvgPosition(pruns.filter((r) => r.mentioned));
    const modelsSet = new Set<ModelShortId>();
    for (const r of pruns) modelsSet.add(r.model);
    return {
      id: p.id,
      text: p.text,
      topic: p.topic,
      visibility,
      sentiment,
      position,
      models: MODEL_SHORT_IDS.filter((m) => modelsSet.has(m)),
      activeRunCount: pruns.length,
    };
  });

  return NextResponse.json({ prompts: rows });
}
