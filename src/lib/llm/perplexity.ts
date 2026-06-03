const PERPLEXITY_ENDPOINT = "https://api.perplexity.ai/chat/completions";
const DEFAULT_MODEL = "sonar-pro";
const REQUEST_TIMEOUT_MS = 60_000;

export interface PerplexityResult {
  content: string;
  citations: string[];
}

export class PerplexityError extends Error {
  readonly source = "perplexity" as const;
  readonly status?: number;
  readonly responseBody?: string;

  constructor(
    message: string,
    options?: { status?: number; responseBody?: string; cause?: unknown },
  ) {
    super(message);
    this.name = "PerplexityError";
    this.status = options?.status;
    this.responseBody = options?.responseBody;
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

interface PerplexityMessage {
  content?: unknown;
}

interface PerplexityChoice {
  message?: PerplexityMessage;
}

interface PerplexitySearchResult {
  url?: unknown;
}

interface PerplexityResponseBody {
  choices?: PerplexityChoice[];
  citations?: unknown;
  search_results?: PerplexitySearchResult[];
}

export async function callPerplexity(
  promptText: string,
): Promise<PerplexityResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    throw new PerplexityError("PERPLEXITY_API_KEY is not set");
  }

  const model = process.env.MODEL_PERPLEXITY || DEFAULT_MODEL;

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  let response: Response;
  try {
    response = await fetch(PERPLEXITY_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: promptText }],
        max_tokens: 2000,
        temperature: 0.3,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof PerplexityError) throw err;
    const message =
      err instanceof Error && err.name === "AbortError"
        ? `Perplexity request timed out after ${REQUEST_TIMEOUT_MS}ms`
        : `Perplexity request failed: ${err instanceof Error ? err.message : String(err)}`;
    throw new PerplexityError(message, { cause: err });
  }
  clearTimeout(timeoutId);

  if (!response.ok) {
    let bodyText = "";
    try {
      bodyText = await response.text();
    } catch {
      // ignore body read errors
    }
    throw new PerplexityError(
      `Perplexity returned non-2xx status ${response.status}`,
      { status: response.status, responseBody: bodyText },
    );
  }

  let parsed: PerplexityResponseBody;
  try {
    parsed = (await response.json()) as PerplexityResponseBody;
  } catch (err) {
    throw new PerplexityError("Perplexity returned invalid JSON", {
      cause: err,
    });
  }

  const rawContent = parsed?.choices?.[0]?.message?.content;
  const content = typeof rawContent === "string" ? rawContent : "";

  const citations = extractCitations(parsed);

  return { content, citations };
}

function extractCitations(body: PerplexityResponseBody): string[] {
  const fromTopLevel = Array.isArray(body?.citations)
    ? body.citations.filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.length > 0,
      )
    : [];
  if (fromTopLevel.length > 0) return fromTopLevel;

  if (Array.isArray(body?.search_results)) {
    return body.search_results
      .map((entry) => entry?.url)
      .filter(
        (url): url is string => typeof url === "string" && url.length > 0,
      );
  }

  return [];
}
