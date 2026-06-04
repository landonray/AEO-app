import { randomUUID } from 'node:crypto';

import { classify } from '@/lib/classify';
import { callGateway } from '@/lib/llm/gateway';
import { callGoogleAIO } from '@/lib/llm/google-aio';
import {
  computeCompetitorMentions,
  computePositionScore,
  computeSentiment,
  detectMentioned,
  extractCitations,
} from '@/lib/llm/parser';
import { callPerplexity } from '@/lib/llm/perplexity';
import { insertCitations, insertRun } from '@/lib/queries';
import { normalizeDomain } from '@/lib/utils';
import type {
  BatchResult,
  Brand,
  Competitor,
  ModelShortId,
  Prompt,
  RunBatchModelResult,
  RunBatchPromptResult,
} from '@/types';

export const MODEL_SURFACES: ReadonlyArray<ModelShortId> = [
  'openai',
  'claude',
  'gemini',
  'perplexity',
  'google_aio',
];

export type OrchestratorBrand = Pick<Brand, 'name' | 'domain'>;
export type OrchestratorCompetitor = Pick<Competitor, 'name' | 'domain'>;
export type OrchestratorPrompt = Pick<Prompt, 'id' | 'text'>;

interface SurfaceCallResult {
  content: string | null;
  apiCitations: string[];
  estimatedCost: number | null;
  runTotalCost: number | null;
}

function gatewayModelEnvFor(surface: ModelShortId): string {
  switch (surface) {
    case 'openai':
      return 'MODEL_OPENAI';
    case 'claude':
      return 'MODEL_CLAUDE';
    case 'gemini':
      return 'MODEL_GEMINI';
    default:
      throw new Error(`Unknown gateway surface: ${surface}`);
  }
}

async function callSurface(
  surface: ModelShortId,
  promptText: string,
  batchId: string,
): Promise<SurfaceCallResult> {
  if (surface === 'openai' || surface === 'claude' || surface === 'gemini') {
    const envName = gatewayModelEnvFor(surface);
    const model = process.env[envName];
    if (!model) {
      throw new Error(`Environment variable ${envName} is not set`);
    }
    const result = await callGateway({
      model,
      messages: [{ role: 'user', content: promptText }],
      max_tokens: 2000,
      temperature: 0.3,
      run_id: batchId,
    });
    return {
      content: result.content,
      apiCitations: [],
      estimatedCost: result.estimatedCost,
      runTotalCost: result.runTotalCost,
    };
  }

  if (surface === 'perplexity') {
    const result = await callPerplexity(promptText);
    return {
      content: result.content,
      apiCitations: result.citations,
      estimatedCost: null,
      runTotalCost: null,
    };
  }

  // google_aio
  const result = await callGoogleAIO(promptText);
  return {
    content: result.content,
    apiCitations: result.citations,
    estimatedCost: result.estimatedCost,
    runTotalCost: null,
  };
}

function logCallFailure(
  batchId: string,
  promptId: string,
  surface: ModelShortId,
  err: unknown,
): string {
  const message = err instanceof Error ? err.message : String(err);
  // Structured log per §10 — one entry per failed call.
  console.error('[orchestrator] call failed', {
    batchId,
    promptId,
    model: surface,
    error: message,
  });
  return message;
}

export interface RunBatchOptions {
  batchId?: string;
}

export async function runBatch(
  prompts: ReadonlyArray<OrchestratorPrompt>,
  brand: OrchestratorBrand,
  competitors: ReadonlyArray<OrchestratorCompetitor>,
  options: RunBatchOptions = {},
): Promise<BatchResult> {
  const batchId = options.batchId ?? `batch-${randomUUID()}`;

  let totalRuns = 0;
  let totalErrors = 0;
  let maxRunTotalCost = 0;

  const promptResults: RunBatchPromptResult[] = [];

  for (const prompt of prompts) {
    const modelResults: RunBatchModelResult[] = [];

    for (const surface of MODEL_SURFACES) {
      try {
        const call = await callSurface(surface, prompt.text, batchId);
        const content = call.content;

        const mentioned = detectMentioned(content, brand);
        const positionScore = computePositionScore(content, brand);
        const sentiment = computeSentiment(content, brand);
        const competitorMentions = computeCompetitorMentions(content, competitors);

        const urls = extractCitations(content, call.apiCitations);

        const runId = await insertRun({
          promptId: prompt.id,
          model: surface,
          response: content,
          mentioned,
          positionScore,
          sentiment,
          competitorMentions,
          estimatedCost: call.estimatedCost,
        });

        if (urls.length > 0) {
          const rows = urls.map((url) => ({
            domain: normalizeDomain(url),
            url,
            domainType: classify(url, brand, competitors),
          }));
          await insertCitations(runId, rows);
        }

        if (
          call.runTotalCost !== null &&
          Number.isFinite(call.runTotalCost) &&
          call.runTotalCost > maxRunTotalCost
        ) {
          maxRunTotalCost = call.runTotalCost;
        }

        totalRuns += 1;
        modelResults.push({ model: surface, success: true, runId });
      } catch (err) {
        totalErrors += 1;
        const message = logCallFailure(batchId, prompt.id, surface, err);
        modelResults.push({ model: surface, success: false, error: message });
      }
    }

    promptResults.push({ promptId: prompt.id, models: modelResults });
  }

  return {
    batchId,
    results: promptResults,
    totalRuns,
    totalErrors,
    runTotalCost: maxRunTotalCost,
  };
}
