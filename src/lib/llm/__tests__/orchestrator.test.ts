import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as classifyModule from '@/lib/classify';
import * as gatewayModule from '@/lib/llm/gateway';
import * as googleAioModule from '@/lib/llm/google-aio';
import * as parserModule from '@/lib/llm/parser';
import * as perplexityModule from '@/lib/llm/perplexity';
import * as queriesModule from '@/lib/queries';

import {
  MODEL_SURFACES,
  TRACKING_MAX_TOKENS,
  TRACKING_TIMEOUT_MS,
  runBatch,
  type OrchestratorBrand,
  type OrchestratorCompetitor,
  type OrchestratorPrompt,
} from '@/lib/llm/orchestrator';
import type {
  DomainType,
  ModelShortId,
  RunBatchModelResult,
} from '@/types';

const BRAND: OrchestratorBrand = { name: 'Acme', domain: 'acme.com' };
const COMPETITORS: OrchestratorCompetitor[] = [
  { name: 'Beta', domain: 'beta.io' },
  { name: 'Charlie', domain: 'charlie.app' },
];

const PROMPT_ONE: OrchestratorPrompt = { id: 'prompt-1', text: 'Best CRM?' };
const PROMPT_TWO: OrchestratorPrompt = { id: 'prompt-2', text: 'Top SaaS?' };

interface CallTrace {
  surface: ModelShortId;
  promptId: string;
  startedAt: number;
  endedAt: number;
}

interface InsertedRun {
  runId: string;
  args: queriesModule.InsertRunInput;
}

interface InsertedCitations {
  runId: string;
  rows: queriesModule.InsertCitationRow[];
}

interface MockEnv {
  traces: CallTrace[];
  inserts: InsertedRun[];
  citations: InsertedCitations[];
  errorLogs: unknown[][];
}

function freshEnv(): MockEnv {
  return { traces: [], inserts: [], citations: [], errorLogs: [] };
}

function nowTick(): number {
  // Tiny async tick to ensure sequential calls have distinct timestamps.
  return performance.now();
}

async function microTick(): Promise<void> {
  await new Promise<void>((r) => setTimeout(r, 1));
}

function installGatewayMock(
  env: MockEnv,
  options: {
    failureSurfaces?: ReadonlySet<ModelShortId>;
    contentBySurface?: Partial<Record<ModelShortId, string>>;
    runTotalCostBySurface?: Partial<Record<ModelShortId, number>>;
    estimatedCostBySurface?: Partial<Record<ModelShortId, number>>;
  } = {},
) {
  // Track which gateway "surface" each model id maps to so we can attribute
  // the call to the right ModelShortId in the trace.
  const modelIdToSurface = new Map<string, ModelShortId>([
    [process.env.MODEL_OPENAI ?? '', 'openai'],
    [process.env.MODEL_CLAUDE ?? '', 'claude'],
    [process.env.MODEL_GEMINI ?? '', 'gemini'],
  ]);

  vi.spyOn(gatewayModule, 'callGateway').mockImplementation(async (opts) => {
    const surface = modelIdToSurface.get(opts.model);
    if (!surface) {
      throw new Error(`gateway mock: unrecognised model "${opts.model}"`);
    }
    const promptText = (opts.messages?.[0]?.content as string) ?? '';
    const promptId =
      promptText === PROMPT_ONE.text
        ? PROMPT_ONE.id
        : promptText === PROMPT_TWO.text
          ? PROMPT_TWO.id
          : 'unknown';
    const startedAt = nowTick();
    await microTick();
    const endedAt = nowTick();
    env.traces.push({ surface, promptId, startedAt, endedAt });

    if (options.failureSurfaces?.has(surface)) {
      throw new gatewayModule.GatewayError(
        `simulated ${surface} failure`,
        opts.model,
        500,
      );
    }
    return {
      content: options.contentBySurface?.[surface] ?? `content from ${surface}`,
      estimatedCost: options.estimatedCostBySurface?.[surface] ?? 0.01,
      runTotalCost: options.runTotalCostBySurface?.[surface] ?? null,
      finishReason: 'stop',
    };
  });
}

function installPerplexityMock(
  env: MockEnv,
  options: {
    fail?: boolean;
    content?: string;
    citations?: string[];
  } = {},
) {
  vi.spyOn(perplexityModule, 'callPerplexity').mockImplementation(
    async (promptText: string) => {
      const promptId =
        promptText === PROMPT_ONE.text
          ? PROMPT_ONE.id
          : promptText === PROMPT_TWO.text
            ? PROMPT_TWO.id
            : 'unknown';
      const startedAt = nowTick();
      await microTick();
      const endedAt = nowTick();
      env.traces.push({ surface: 'perplexity', promptId, startedAt, endedAt });
      if (options.fail) {
        throw new perplexityModule.PerplexityError('simulated perplexity 500');
      }
      return {
        content: options.content ?? 'perplexity says Acme is recommended',
        citations: options.citations ?? ['https://reddit.com/r/saas'],
      };
    },
  );
}

function installGoogleAIOMock(
  env: MockEnv,
  options: {
    fail?: boolean;
    content?: string | null;
    citations?: string[];
    estimatedCost?: number | null;
  } = {},
) {
  vi.spyOn(googleAioModule, 'callGoogleAIO').mockImplementation(
    async (promptText: string) => {
      const promptId =
        promptText === PROMPT_ONE.text
          ? PROMPT_ONE.id
          : promptText === PROMPT_TWO.text
            ? PROMPT_TWO.id
            : 'unknown';
      const startedAt = nowTick();
      await microTick();
      const endedAt = nowTick();
      env.traces.push({ surface: 'google_aio', promptId, startedAt, endedAt });
      if (options.fail) {
        throw new Error('[google_aio] simulated DataForSEO 401');
      }
      return {
        content: options.content === undefined ? 'Acme is mentioned' : options.content,
        citations: options.citations ?? ['https://techcrunch.com/article'],
        estimatedCost: options.estimatedCost ?? 0.0025,
      };
    },
  );
}

function installQueryMocks(env: MockEnv) {
  let runCounter = 0;
  vi.spyOn(queriesModule, 'insertRun').mockImplementation(async (input) => {
    runCounter += 1;
    const runId = `run-${runCounter}`;
    env.inserts.push({ runId, args: input });
    return runId;
  });
  vi.spyOn(queriesModule, 'insertCitations').mockImplementation(
    async (runId: string, rows) => {
      env.citations.push({ runId, rows: [...rows] });
      return rows.map((r, idx) => ({
        id: `citation-${runId}-${idx}`,
        runId,
        domain: r.domain,
        url: r.url,
        domainType: r.domainType as DomainType,
      }));
    },
  );
}

function silenceErrorLogs(env: MockEnv) {
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    env.errorLogs.push(args);
  });
}

beforeEach(() => {
  process.env.MODEL_OPENAI = 'gpt-test';
  process.env.MODEL_CLAUDE = 'claude-test';
  process.env.MODEL_GEMINI = 'gemini-test';
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.MODEL_OPENAI;
  delete process.env.MODEL_CLAUDE;
  delete process.env.MODEL_GEMINI;
});

describe('runBatch — §7.1 happy path: 1 prompt × 5 models', () => {
  it('inserts 5 runs (one per surface), shares one batchId, returns the run ids', async () => {
    const env = freshEnv();
    installGatewayMock(env, {
      runTotalCostBySurface: { openai: 0.01, claude: 0.025, gemini: 0.05 },
    });
    installPerplexityMock(env);
    installGoogleAIOMock(env);
    installQueryMocks(env);
    silenceErrorLogs(env);

    const result = await runBatch([PROMPT_ONE], BRAND, COMPETITORS);

    expect(result.batchId).toMatch(/^batch-/);
    expect(result.totalRuns).toBe(5);
    expect(result.totalErrors).toBe(0);
    expect(result.runTotalCost).toBeCloseTo(0.05, 6);
    expect(result.results).toHaveLength(1);

    const promptResult = result.results[0]!;
    expect(promptResult.promptId).toBe(PROMPT_ONE.id);
    expect(promptResult.models.map((m) => m.model)).toEqual([
      'openai',
      'claude',
      'gemini',
      'perplexity',
      'google_aio',
    ]);
    expect(promptResult.models.every((m) => m.success)).toBe(true);
    expect(promptResult.models.map((m) => m.runId)).toEqual([
      'run-1',
      'run-2',
      'run-3',
      'run-4',
      'run-5',
    ]);

    expect(env.inserts).toHaveLength(5);
    const insertedModels = env.inserts.map((i) => i.args.model);
    expect(insertedModels).toEqual([
      'openai',
      'claude',
      'gemini',
      'perplexity',
      'google_aio',
    ]);
    for (const insert of env.inserts) {
      expect(insert.args.promptId).toBe(PROMPT_ONE.id);
    }
  });

  it('forwards the same batchId as the gateway run_id on every gateway call', async () => {
    const env = freshEnv();
    installGatewayMock(env);
    installPerplexityMock(env);
    installGoogleAIOMock(env);
    installQueryMocks(env);
    silenceErrorLogs(env);

    const result = await runBatch([PROMPT_ONE], BRAND, COMPETITORS);

    const gatewaySpy = vi.mocked(gatewayModule.callGateway);
    expect(gatewaySpy).toHaveBeenCalledTimes(3);
    for (const call of gatewaySpy.mock.calls) {
      const opts = call[0]!;
      expect(opts.run_id).toBe(result.batchId);
    }
  });

  it('gives every gateway call enough output tokens and time to finish after reasoning', async () => {
    const env = freshEnv();
    installGatewayMock(env);
    installPerplexityMock(env);
    installGoogleAIOMock(env);
    installQueryMocks(env);
    silenceErrorLogs(env);

    await runBatch([PROMPT_ONE], BRAND, COMPETITORS);

    const gatewaySpy = vi.mocked(gatewayModule.callGateway);
    expect(gatewaySpy).toHaveBeenCalledTimes(3);
    for (const call of gatewaySpy.mock.calls) {
      expect(call[0]!.max_tokens).toBe(TRACKING_MAX_TOKENS);
      expect(call[0]!.timeoutMs).toBe(TRACKING_TIMEOUT_MS);
    }
    expect(TRACKING_MAX_TOKENS).toBeGreaterThanOrEqual(8000);
    expect(TRACKING_TIMEOUT_MS).toBeGreaterThan(gatewayModule.GATEWAY_TIMEOUT_MS);
  });
});

describe('runBatch — §7.2 sequential ordering', () => {
  it('runs surfaces sequentially within a prompt (no overlap)', async () => {
    const env = freshEnv();
    installGatewayMock(env);
    installPerplexityMock(env);
    installGoogleAIOMock(env);
    installQueryMocks(env);
    silenceErrorLogs(env);

    await runBatch([PROMPT_ONE], BRAND, COMPETITORS);

    expect(env.traces).toHaveLength(5);
    expect(env.traces.map((t) => t.surface)).toEqual([
      'openai',
      'claude',
      'gemini',
      'perplexity',
      'google_aio',
    ]);
    for (let i = 1; i < env.traces.length; i++) {
      expect(env.traces[i]!.startedAt).toBeGreaterThanOrEqual(
        env.traces[i - 1]!.endedAt,
      );
    }
  });

  it('runs prompts sequentially (prompt 1 finishes before prompt 2 starts)', async () => {
    const env = freshEnv();
    installGatewayMock(env);
    installPerplexityMock(env);
    installGoogleAIOMock(env);
    installQueryMocks(env);
    silenceErrorLogs(env);

    await runBatch([PROMPT_ONE, PROMPT_TWO], BRAND, COMPETITORS);

    expect(env.traces).toHaveLength(10);
    const lastPromptOne = env.traces
      .filter((t) => t.promptId === PROMPT_ONE.id)
      .reduce((latest, t) => Math.max(latest, t.endedAt), 0);
    const firstPromptTwo = env.traces
      .filter((t) => t.promptId === PROMPT_TWO.id)
      .reduce((earliest, t) => Math.min(earliest, t.startedAt), Infinity);
    expect(firstPromptTwo).toBeGreaterThanOrEqual(lastPromptOne);
  });
});

describe('runBatch — §7.3 single-model failure does not abort the batch', () => {
  it('inserts 4 surviving runs, no row for the failing surface, logs and continues', async () => {
    const env = freshEnv();
    installGatewayMock(env, { failureSurfaces: new Set<ModelShortId>(['claude']) });
    installPerplexityMock(env);
    installGoogleAIOMock(env);
    installQueryMocks(env);
    silenceErrorLogs(env);

    const result = await runBatch([PROMPT_ONE], BRAND, COMPETITORS);

    expect(result.totalRuns).toBe(4);
    expect(result.totalErrors).toBe(1);

    const surfacesInserted = env.inserts.map((i) => i.args.model);
    expect(surfacesInserted).toEqual(['openai', 'gemini', 'perplexity', 'google_aio']);

    const claudeResult = result.results[0]!.models.find((m) => m.model === 'claude');
    expect(claudeResult).toBeDefined();
    expect(claudeResult).toMatchObject<Partial<RunBatchModelResult>>({
      model: 'claude',
      success: false,
    });
    expect(claudeResult?.runId).toBeUndefined();
    expect(claudeResult?.error).toContain('claude');

    expect(env.errorLogs).toHaveLength(1);
    expect(env.errorLogs[0]![0]).toBe('[orchestrator] call failed');
    const logPayload = env.errorLogs[0]![1] as Record<string, unknown>;
    expect(logPayload).toMatchObject({
      batchId: result.batchId,
      promptId: PROMPT_ONE.id,
      model: 'claude',
    });
  });
});

describe('runBatch — §7.4 all-five-models-fail prompt', () => {
  it('inserts no rows for the failing prompt and continues to the next prompt', async () => {
    const env = freshEnv();
    installGatewayMock(env, {
      failureSurfaces: new Set<ModelShortId>(['openai', 'claude', 'gemini']),
    });
    installPerplexityMock(env, { fail: true });
    installGoogleAIOMock(env, { fail: true });
    installQueryMocks(env);
    silenceErrorLogs(env);

    const result = await runBatch([PROMPT_ONE, PROMPT_TWO], BRAND, COMPETITORS);

    // Prompt 1: all five fail. Prompt 2: all five fail. 0 runs, 10 errors.
    expect(result.totalRuns).toBe(0);
    expect(result.totalErrors).toBe(10);
    expect(env.inserts).toHaveLength(0);
    expect(env.citations).toHaveLength(0);

    expect(result.results).toHaveLength(2);
    for (const promptResult of result.results) {
      expect(promptResult.models).toHaveLength(5);
      for (const modelResult of promptResult.models) {
        expect(modelResult.success).toBe(false);
        expect(modelResult.runId).toBeUndefined();
        expect(modelResult.error).toBeTruthy();
      }
    }
  });
});

describe('runBatch — §7.5 citation persistence', () => {
  it('persists citations with normalized domain, full url, and classifier-assigned type', async () => {
    const env = freshEnv();
    installGatewayMock(env, {
      contentBySurface: {
        openai: 'See https://acme.com/blog for more.',
        claude: 'No links here.',
        gemini: 'Check https://random-saas.io/path now.',
      },
    });
    installPerplexityMock(env, {
      content: 'sources below',
      citations: ['https://reddit.com/r/saas', 'https://beta.io/landing'],
    });
    installGoogleAIOMock(env, {
      content: 'Acme is one of many options.',
      citations: ['https://techcrunch.com/news'],
    });
    installQueryMocks(env);
    silenceErrorLogs(env);

    const result = await runBatch([PROMPT_ONE], BRAND, COMPETITORS);
    expect(result.totalRuns).toBe(5);

    // claude had no urls; the other four should have citations.
    expect(env.citations).toHaveLength(4);

    const byRun: Record<string, queriesModule.InsertCitationRow[]> = {};
    for (const c of env.citations) {
      byRun[c.runId] = c.rows;
    }

    const openaiInsert = env.inserts.find((i) => i.args.model === 'openai')!;
    const openaiCitations = byRun[openaiInsert.runId];
    expect(openaiCitations).toBeDefined();
    expect(openaiCitations).toHaveLength(1);
    expect(openaiCitations![0]).toMatchObject({
      domain: 'acme.com',
      url: 'https://acme.com/blog',
      domainType: 'You',
    });

    const perplexityInsert = env.inserts.find((i) => i.args.model === 'perplexity')!;
    const perplexityCitations = byRun[perplexityInsert.runId];
    expect(perplexityCitations).toBeDefined();
    expect(perplexityCitations).toHaveLength(2);
    const types = perplexityCitations!.map((r) => r.domainType);
    expect(types).toContain('UGC');
    expect(types).toContain('Competitor');

    const aioInsert = env.inserts.find((i) => i.args.model === 'google_aio')!;
    const aioCitations = byRun[aioInsert.runId];
    expect(aioCitations).toBeDefined();
    expect(aioCitations![0]).toMatchObject({
      domain: 'techcrunch.com',
      url: 'https://techcrunch.com/news',
      domainType: 'Editorial',
    });

    const geminiInsert = env.inserts.find((i) => i.args.model === 'gemini')!;
    const geminiCitations = byRun[geminiInsert.runId];
    expect(geminiCitations).toBeDefined();
    expect(geminiCitations![0]).toMatchObject({
      domain: 'random-saas.io',
      domainType: 'Corporate',
    });
  });

  it('records google_aio runs with mentioned=false and no citations when AI Overview is empty', async () => {
    const env = freshEnv();
    installGatewayMock(env);
    installPerplexityMock(env);
    installGoogleAIOMock(env, { content: null, citations: [], estimatedCost: 0.0025 });
    installQueryMocks(env);
    silenceErrorLogs(env);

    const result = await runBatch([PROMPT_ONE], BRAND, COMPETITORS);

    expect(result.totalRuns).toBe(5);
    const aioInsert = env.inserts.find((i) => i.args.model === 'google_aio');
    expect(aioInsert).toBeDefined();
    expect(aioInsert!.args.response).toBeNull();
    expect(aioInsert!.args.mentioned).toBe(false);
    expect(aioInsert!.args.estimatedCost).toBe(0.0025);

    const aioCitations = env.citations.find((c) => c.runId === aioInsert!.runId);
    expect(aioCitations).toBeUndefined();
  });
});

describe('runBatch — §7.6 run id returned', () => {
  it('returns each runs.id from the database in the per-model result', async () => {
    const env = freshEnv();
    installGatewayMock(env);
    installPerplexityMock(env);
    installGoogleAIOMock(env);
    installQueryMocks(env);
    silenceErrorLogs(env);

    const result = await runBatch([PROMPT_ONE], BRAND, COMPETITORS);

    const returnedRunIds = result.results[0]!.models
      .map((m) => m.runId)
      .filter((id): id is string => typeof id === 'string');
    const insertedRunIds = env.inserts.map((i) => i.runId);
    expect(returnedRunIds).toEqual(insertedRunIds);
  });
});

describe('runBatch — §7.7 same shape from cron + button', () => {
  it('runBatch produces identical payload shape regardless of caller; verified by twin invocations', async () => {
    const env = freshEnv();
    installGatewayMock(env);
    installPerplexityMock(env);
    installGoogleAIOMock(env);
    installQueryMocks(env);
    silenceErrorLogs(env);

    const cronResult = await runBatch([PROMPT_ONE], BRAND, COMPETITORS);
    const buttonResult = await runBatch([PROMPT_ONE], BRAND, COMPETITORS);

    const shape = (r: Awaited<ReturnType<typeof runBatch>>) => ({
      batchId: typeof r.batchId,
      totalRuns: typeof r.totalRuns,
      totalErrors: typeof r.totalErrors,
      runTotalCost: typeof r.runTotalCost,
      resultsKeys: r.results.length > 0 ? Object.keys(r.results[0]!).sort() : [],
      modelKeys:
        r.results[0]?.models[0] !== undefined
          ? Object.keys(r.results[0]!.models[0]!).sort()
          : [],
      surfaces: r.results[0]!.models.map((m) => m.model),
    });

    expect(shape(cronResult)).toEqual(shape(buttonResult));
    expect(cronResult.batchId).not.toBe(buttonResult.batchId);
    expect(cronResult.results[0]!.models.map((m) => m.model)).toEqual([
      ...MODEL_SURFACES,
    ]);
  });
});

describe('runBatch — §7.8 no partial rows on per-call failure', () => {
  it('does NOT insert the run when parsing throws after a successful LLM call', async () => {
    const env = freshEnv();
    installGatewayMock(env);
    installPerplexityMock(env);
    installGoogleAIOMock(env);
    installQueryMocks(env);
    silenceErrorLogs(env);

    // Make the sentiment parser throw for one specific call (claude's content).
    const realComputeSentiment = parserModule.computeSentiment;
    vi.spyOn(parserModule, 'computeSentiment').mockImplementation(
      (text, brand) => {
        if (text === 'content from claude') {
          throw new Error('parser blew up');
        }
        return realComputeSentiment(text, brand);
      },
    );

    const result = await runBatch([PROMPT_ONE], BRAND, COMPETITORS);

    // Four surfaces succeed, claude fails before any DB write.
    expect(result.totalRuns).toBe(4);
    expect(result.totalErrors).toBe(1);
    const inserted = env.inserts.map((i) => i.args.model);
    expect(inserted).not.toContain('claude');

    // No orphan citations for claude either.
    const insertedRunIds = new Set(env.inserts.map((i) => i.runId));
    for (const c of env.citations) {
      expect(insertedRunIds.has(c.runId)).toBe(true);
    }

    // The failure was logged.
    expect(env.errorLogs).toHaveLength(1);
    const logPayload = env.errorLogs[0]![1] as Record<string, unknown>;
    expect(logPayload).toMatchObject({ model: 'claude', promptId: PROMPT_ONE.id });
  });

  it('still produces a runId for surfaces that succeed even if a later surface fails parsing', async () => {
    const env = freshEnv();
    installGatewayMock(env);
    installPerplexityMock(env);
    installGoogleAIOMock(env);
    installQueryMocks(env);
    silenceErrorLogs(env);

    const realDetectMentioned = parserModule.detectMentioned;
    vi.spyOn(parserModule, 'detectMentioned').mockImplementation((text, brand) => {
      if (text === 'perplexity says Acme is recommended') {
        throw new Error('mention parser blew up');
      }
      return realDetectMentioned(text, brand);
    });

    const result = await runBatch([PROMPT_ONE], BRAND, COMPETITORS);

    // Perplexity fails at parsing → no row. Other four still recorded.
    expect(result.totalRuns).toBe(4);
    expect(result.totalErrors).toBe(1);
    const perResult = result.results[0]!.models.find((m) => m.model === 'perplexity');
    expect(perResult?.success).toBe(false);
    expect(perResult?.runId).toBeUndefined();

    const otherSuccess = result.results[0]!.models.filter(
      (m) => m.model !== 'perplexity',
    );
    expect(otherSuccess.every((m) => m.success && typeof m.runId === 'string')).toBe(
      true,
    );
  });
});

describe('runBatch — environment variable validation', () => {
  it('treats a missing gateway model env var as a single-call failure (not a batch abort)', async () => {
    const env = freshEnv();
    delete process.env.MODEL_OPENAI;
    installGatewayMock(env);
    installPerplexityMock(env);
    installGoogleAIOMock(env);
    installQueryMocks(env);
    silenceErrorLogs(env);

    const result = await runBatch([PROMPT_ONE], BRAND, COMPETITORS);

    const openai = result.results[0]!.models.find((m) => m.model === 'openai');
    expect(openai?.success).toBe(false);
    expect(openai?.error).toContain('MODEL_OPENAI');
    // Other four still run.
    expect(result.totalRuns).toBe(4);
  });
});

describe('runBatch — classify is invoked per citation', () => {
  it('passes brand+competitors to classify for every extracted URL', async () => {
    const env = freshEnv();
    const classifySpy = vi.spyOn(classifyModule, 'classify');
    installGatewayMock(env, {
      contentBySurface: {
        openai: 'visit https://acme.com',
        claude: '',
        gemini: '',
      },
    });
    installPerplexityMock(env, { content: '', citations: [] });
    installGoogleAIOMock(env, { content: '', citations: [], estimatedCost: null });
    installQueryMocks(env);
    silenceErrorLogs(env);

    await runBatch([PROMPT_ONE], BRAND, COMPETITORS);

    expect(classifySpy).toHaveBeenCalled();
    const firstCall = classifySpy.mock.calls[0]!;
    expect(firstCall[1]).toEqual(BRAND);
    expect(firstCall[2]).toEqual(COMPETITORS);
  });
});
