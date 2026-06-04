/**
 * Google AI Overview client via DataForSEO.
 *
 * Not an LLM call — this is a SERP scrape. We POST the prompt as a US-English Google
 * search and pull out either the AI Overview block or, failing that, the featured
 * snippet. If neither is present we still return successfully so the orchestrator
 * records a no-mention run (§6.4, §8 of the refined spec).
 */

import type { ModelShortId } from '@/types';

const DATAFORSEO_URL =
  'https://api.dataforseo.com/v3/serp/google/organic/live/advanced';
const DEFAULT_TIMEOUT_MS = 60_000;
const MODEL_ID: ModelShortId = 'google_aio';

export interface GoogleAIOResult {
  content: string | null;
  citations: string[];
  estimatedCost: number | null;
}

export interface GoogleAIOOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function buildBasicAuth(login: string, password: string): string {
  const credentials = `${login}:${password}`;
  const encoded =
    typeof Buffer !== 'undefined'
      ? Buffer.from(credentials, 'utf-8').toString('base64')
      : btoa(credentials);
  return `Basic ${encoded}`;
}

type ResultItem = Record<string, unknown> & { type?: string };

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function extractText(item: ResultItem): string | null {
  const markdown = asString(item.markdown);
  if (markdown) return markdown.trim();

  const subItems = asArray<Record<string, unknown>>(item.items);
  if (subItems.length > 0) {
    const parts: string[] = [];
    for (const sub of subItems) {
      if (!sub || typeof sub !== 'object') continue;
      const t = asString((sub as Record<string, unknown>).text);
      if (t) parts.push(t.trim());
    }
    if (parts.length > 0) return parts.join('\n\n');
  }

  const text = asString(item.text);
  if (text) return text.trim();

  const description = asString(item.description);
  if (description) return description.trim();

  return null;
}

function extractCitations(item: ResultItem): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const push = (value: unknown) => {
    const u = asString(value);
    if (u && !seen.has(u)) {
      seen.add(u);
      urls.push(u);
    }
  };

  for (const ref of asArray<Record<string, unknown>>(item.references)) {
    if (ref && typeof ref === 'object') push(ref.url);
  }
  for (const link of asArray<Record<string, unknown>>(item.links)) {
    if (link && typeof link === 'object') push(link.url);
  }
  push(item.url);

  return urls;
}

function findItemByType(
  items: ResultItem[],
  type: string,
): ResultItem | undefined {
  return items.find((i) => i && typeof i === 'object' && i.type === type);
}

/**
 * Call DataForSEO's live SERP endpoint for the given prompt and return the
 * AI Overview (or featured snippet fallback) text + reference URLs.
 *
 * Throws on missing credentials, non-2xx responses, network errors, and timeouts.
 * Returning successfully with `content: null` means the SERP had neither an
 * AI Overview nor a featured snippet — the orchestrator should still write a run.
 */
export async function callGoogleAIO(
  promptText: string,
  options: GoogleAIOOptions = {},
): Promise<GoogleAIOResult> {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    throw new Error(
      `[${MODEL_ID}] missing DATAFORSEO_LOGIN or DATAFORSEO_PASSWORD env var`,
    );
  }

  const { timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(DATAFORSEO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: buildBasicAuth(login, password),
      },
      body: JSON.stringify([
        {
          language_code: 'en',
          location_code: 2840,
          keyword: promptText,
          depth: 10,
        },
      ]),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`[${MODEL_ID}] timeout after ${timeoutMs}ms`);
    }
    throw new Error(`[${MODEL_ID}] network error: ${message}`);
  }
  clearTimeout(timer);

  if (!response.ok) {
    throw new Error(
      `[${MODEL_ID}] DataForSEO HTTP ${response.status} ${response.statusText || ''}`.trim(),
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`[${MODEL_ID}] DataForSEO returned non-JSON response`);
  }

  const tasks = asArray<Record<string, unknown>>(
    (payload as Record<string, unknown>)?.tasks,
  );
  const task = tasks[0];
  const estimatedCost =
    typeof task?.cost === 'number' && Number.isFinite(task.cost)
      ? (task.cost as number)
      : null;

  const results = asArray<Record<string, unknown>>(task?.result);
  const items = asArray<ResultItem>(results[0]?.items);

  const aiOverview = findItemByType(items, 'ai_overview');
  if (aiOverview) {
    return {
      content: extractText(aiOverview),
      citations: extractCitations(aiOverview),
      estimatedCost,
    };
  }

  const featured = findItemByType(items, 'featured_snippet');
  if (featured) {
    return {
      content: extractText(featured),
      citations: extractCitations(featured),
      estimatedCost,
    };
  }

  return { content: null, citations: [], estimatedCost };
}
