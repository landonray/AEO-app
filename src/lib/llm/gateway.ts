export type GatewayRole = "system" | "user" | "assistant" | "tool";

export interface GatewayToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
  thought_signature?: string;
}

export interface GatewayMessage {
  role: GatewayRole;
  content: string | null | unknown;
  tool_call_id?: string;
  name?: string;
  tool_calls?: GatewayToolCall[];
}

export interface CallGatewayOptions {
  model: string;
  messages: GatewayMessage[];
  max_tokens?: number;
  temperature?: number;
  run_id?: string;
  response_format?: Record<string, unknown>;
  tools?: unknown[];
  tool_choice?: string | Record<string, unknown>;
}

export interface CallGatewayResult {
  content: string | null;
  estimatedCost: number | null;
  runTotalCost: number | null;
  finishReason: string | null;
  toolCalls?: GatewayToolCall[];
}

export interface CallGatewayJSONOptions<_T = unknown>
  extends Omit<CallGatewayOptions, "response_format"> {
  schema: Record<string, unknown>;
  schemaName?: string;
}

export interface CallGatewayJSONResult<T = unknown> {
  data: T;
  raw: CallGatewayResult;
}

export class GatewayError extends Error {
  override readonly name = "GatewayError";
  readonly model: string;
  readonly status?: number;
  readonly responseBody?: string;
  constructor(
    message: string,
    model: string,
    status?: number,
    responseBody?: string,
  ) {
    super(message);
    this.model = model;
    this.status = status;
    this.responseBody = responseBody;
  }
}

export class GatewayTimeoutError extends Error {
  override readonly name = "GatewayTimeoutError";
  readonly model: string;
  readonly timeoutMs: number;
  constructor(model: string, timeoutMs: number) {
    super(
      `LLM Gateway call to model "${model}" timed out after ${timeoutMs}ms`,
    );
    this.model = model;
    this.timeoutMs = timeoutMs;
  }
}

export class GatewayJSONParseError extends Error {
  override readonly name = "GatewayJSONParseError";
  readonly model: string;
  readonly content: string | null;
  constructor(message: string, model: string, content: string | null) {
    super(message);
    this.model = model;
    this.content = content;
  }
}

export const GATEWAY_TIMEOUT_MS = 60_000;
export const GATEWAY_JSON_RETRY_SYSTEM_MESSAGE =
  "Return ONLY valid JSON matching the schema. No prose, no markdown.";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Environment variable ${name} is required but was not set.`,
    );
  }
  return value;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function scrubSecret(text: string, secret: string): string {
  if (!secret || !text) return text;
  let out = text.split(secret).join("***");
  out = out.replace(
    new RegExp(`Bearer\\s+${escapeRegex(secret)}`, "gi"),
    "Bearer ***",
  );
  return out;
}

interface GatewayResponseShape {
  content?: string | null;
  estimated_cost?: number | null;
  run_total_cost?: number | null;
  finish_reason?: string | null;
  tool_calls?: GatewayToolCall[];
}

function parseGatewayResponse(data: unknown): CallGatewayResult {
  const d = (data ?? {}) as GatewayResponseShape;
  const content =
    typeof d.content === "string" ? d.content : d.content === null ? null : null;
  const estimatedCost =
    typeof d.estimated_cost === "number" ? d.estimated_cost : null;
  const runTotalCost =
    typeof d.run_total_cost === "number" ? d.run_total_cost : null;
  const finishReason =
    typeof d.finish_reason === "string" ? d.finish_reason : null;
  const toolCalls = Array.isArray(d.tool_calls) ? d.tool_calls : undefined;
  return { content, estimatedCost, runTotalCost, finishReason, toolCalls };
}

export async function callGateway(
  opts: CallGatewayOptions,
): Promise<CallGatewayResult> {
  const base = requireEnv("LLM_GATEWAY_BASE_URL").replace(/\/+$/, "");
  const apiKey = requireEnv("LLM_GATEWAY_API_KEY");
  const url = `${base}/chat/completions`;

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
  };
  if (opts.max_tokens !== undefined) body.max_tokens = opts.max_tokens;
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.run_id !== undefined) body.run_id = opts.run_id;
  if (opts.response_format !== undefined) {
    body.response_format = opts.response_format;
  }
  if (opts.tools !== undefined) body.tools = opts.tools;
  if (opts.tool_choice !== undefined) body.tool_choice = opts.tool_choice;

  const controller = new AbortController();
  const timeoutMs = GATEWAY_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (controller.signal.aborted) {
      throw new GatewayTimeoutError(opts.model, timeoutMs);
    }
    const raw = err instanceof Error ? err.message : String(err);
    throw new GatewayError(
      `LLM Gateway request to "${opts.model}" failed: ${scrubSecret(raw, apiKey)}`,
      opts.model,
    );
  }
  clearTimeout(timer);

  if (!response.ok) {
    let bodyText = "";
    try {
      bodyText = await response.text();
    } catch {
      bodyText = "";
    }
    const scrubbed = scrubSecret(bodyText, apiKey);
    throw new GatewayError(
      `LLM Gateway returned ${response.status} for model "${opts.model}": ${scrubbed.slice(0, 1000)}`,
      opts.model,
      response.status,
      scrubbed,
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    throw new GatewayError(
      `LLM Gateway response to "${opts.model}" was not valid JSON: ${scrubSecret(raw, apiKey)}`,
      opts.model,
    );
  }

  return parseGatewayResponse(data);
}

export async function callGatewayJSON<T = unknown>(
  opts: CallGatewayJSONOptions<T>,
): Promise<CallGatewayJSONResult<T>> {
  const { schema, schemaName, messages, ...rest } = opts;
  const response_format = {
    type: "json_schema" as const,
    json_schema: {
      name: schemaName ?? "response",
      strict: true,
      schema,
    },
  };

  const first = await callGateway({
    ...rest,
    messages,
    response_format,
  });

  const firstParse = tryParseJson<T>(first.content);
  if (firstParse.ok) {
    return { data: firstParse.value, raw: first };
  }

  const retryMessages: GatewayMessage[] = [
    { role: "system", content: GATEWAY_JSON_RETRY_SYSTEM_MESSAGE },
    ...messages,
  ];
  const second = await callGateway({
    ...rest,
    messages: retryMessages,
    response_format,
  });

  const secondParse = tryParseJson<T>(second.content);
  if (secondParse.ok) {
    return { data: secondParse.value, raw: second };
  }

  throw new GatewayJSONParseError(
    `LLM Gateway model "${opts.model}" returned content that could not be parsed as JSON after one retry: ${secondParse.error}`,
    opts.model,
    second.content,
  );
}

type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function tryParseJson<T>(content: string | null): ParseResult<T> {
  if (content == null) {
    return { ok: false, error: "content was null" };
  }
  try {
    return { ok: true, value: JSON.parse(content) as T };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
