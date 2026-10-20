import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

import {
  callGateway,
  callGatewayJSON,
  GATEWAY_JSON_RETRY_SYSTEM_MESSAGE,
  GATEWAY_TIMEOUT_MS,
  GatewayError,
  GatewayJSONParseError,
  GatewayTimeoutError,
  scrubSecret,
} from "../gateway";

const BASE_URL = "https://llm-gateway.test/api/v1";
const API_KEY = "llmgw_secret_test_token_DO_NOT_LEAK";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function captureRequest(mock: Mock, callIndex = 0) {
  const call = mock.mock.calls[callIndex];
  if (!call) throw new Error(`no fetch call at index ${callIndex}`);
  const [url, init] = call as [string, RequestInit];
  const headers = init.headers as Record<string, string>;
  const body = init.body
    ? JSON.parse(init.body as string)
    : undefined;
  return { url, init, headers, body };
}

let originalFetch: typeof fetch | undefined;

beforeEach(() => {
  process.env.LLM_GATEWAY_BASE_URL = BASE_URL;
  process.env.LLM_GATEWAY_API_KEY = API_KEY;
  originalFetch = global.fetch;
});

afterEach(() => {
  if (originalFetch) global.fetch = originalFetch;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("callGateway — §4.1 request shape", () => {
  it("POSTs to /chat/completions with bearer auth and forwards expected body fields; never sends stream", async () => {
    const mock = vi.fn().mockResolvedValue(
      jsonResponse({
        content: "hi",
        estimated_cost: 0.001,
        run_total_cost: 0.002,
        finish_reason: "stop",
      }),
    );
    global.fetch = mock as unknown as typeof fetch;

    await callGateway({
      model: "claude-opus-4-8",
      messages: [{ role: "user", content: "What is the best CRM?" }],
      max_tokens: 2000,
      temperature: 0.3,
      run_id: "batch-abc",
    });

    expect(mock).toHaveBeenCalledTimes(1);
    const { url, init, headers, body } = captureRequest(mock);
    expect(url).toBe(`${BASE_URL}/chat/completions`);
    expect(init.method).toBe("POST");
    expect(headers.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(body).toEqual({
      model: "claude-opus-4-8",
      messages: [{ role: "user", content: "What is the best CRM?" }],
      max_tokens: 2000,
      temperature: 0.3,
      run_id: "batch-abc",
    });
    expect(body.stream).toBeUndefined();
  });

  it("omits optional fields when not supplied", async () => {
    const mock = vi.fn().mockResolvedValue(
      jsonResponse({ content: "ok" }),
    );
    global.fetch = mock as unknown as typeof fetch;

    await callGateway({
      model: "gpt-5.5",
      messages: [{ role: "user", content: "ping" }],
    });

    const { body } = captureRequest(mock);
    expect(body).toEqual({
      model: "gpt-5.5",
      messages: [{ role: "user", content: "ping" }],
    });
    expect(body.max_tokens).toBeUndefined();
    expect(body.temperature).toBeUndefined();
    expect(body.run_id).toBeUndefined();
    expect(body.response_format).toBeUndefined();
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
  });

  it("forwards tools and tool_choice when supplied", async () => {
    const mock = vi.fn().mockResolvedValue(jsonResponse({ content: null }));
    global.fetch = mock as unknown as typeof fetch;

    const tools = [
      {
        type: "function",
        function: { name: "get_weather", parameters: { type: "object" } },
      },
    ];

    await callGateway({
      model: "gpt-5.5",
      messages: [{ role: "user", content: "weather?" }],
      tools,
      tool_choice: "auto",
    });

    const { body } = captureRequest(mock);
    expect(body.tools).toEqual(tools);
    expect(body.tool_choice).toBe("auto");
  });
});

describe("callGateway — §4.2 top-level content (NOT choices[0].message.content)", () => {
  it("reads top-level content and ignores choices entirely", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        content: "hello",
        estimated_cost: 0.012,
        run_total_cost: 0.05,
        finish_reason: "stop",
      }),
    ) as unknown as typeof fetch;

    const result = await callGateway({
      model: "claude-opus-4-8",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result).toEqual({
      content: "hello",
      estimatedCost: 0.012,
      runTotalCost: 0.05,
      finishReason: "stop",
      toolCalls: undefined,
    });
  });

  it("does NOT fall back to choices[0].message.content (streaming SSE shape)", async () => {
    // Bake a fixture where the SSE shape is present but the top-level content
    // is undefined. The client must NOT read from choices.
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [
          { index: 0, message: { content: "WRONG_PATH" }, finish_reason: "stop" },
        ],
      }),
    ) as unknown as typeof fetch;

    const result = await callGateway({
      model: "claude-opus-4-8",
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result.content).toBeNull();
    expect(result.content).not.toBe("WRONG_PATH");
  });

  it("surfaces tool_calls when present", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        content: null,
        finish_reason: "tool_calls",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "get_weather", arguments: '{"x":1}' },
          },
        ],
      }),
    ) as unknown as typeof fetch;

    const result = await callGateway({
      model: "claude-opus-4-8",
      messages: [{ role: "user", content: "weather?" }],
    });

    expect(result.content).toBeNull();
    expect(result.toolCalls).toEqual([
      {
        id: "call_1",
        type: "function",
        function: { name: "get_weather", arguments: '{"x":1}' },
      },
    ]);
    expect(result.finishReason).toBe("tool_calls");
  });
});

describe("callGateway — §4.3 response_format passthrough", () => {
  it("forwards response_format json_schema verbatim", async () => {
    const mock = vi.fn().mockResolvedValue(
      jsonResponse({ content: '{"name":"a","age":1}' }),
    );
    global.fetch = mock as unknown as typeof fetch;

    const schema = {
      type: "object",
      required: ["name", "age"],
      properties: { name: { type: "string" }, age: { type: "integer" } },
    };

    await callGateway({
      model: "claude-opus-4-8",
      messages: [{ role: "user", content: "make a person" }],
      response_format: {
        type: "json_schema",
        json_schema: { name: "person", strict: true, schema },
      },
    });

    const { body } = captureRequest(mock);
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "person", strict: true, schema },
    });
  });

  it("callGatewayJSON wraps schema in json_schema response_format", async () => {
    const mock = vi.fn().mockResolvedValue(
      jsonResponse({ content: '{"ok":true}' }),
    );
    global.fetch = mock as unknown as typeof fetch;

    const schema = {
      type: "object",
      required: ["ok"],
      properties: { ok: { type: "boolean" } },
    };

    const result = await callGatewayJSON<{ ok: boolean }>({
      model: "claude-opus-4-8",
      messages: [{ role: "user", content: "respond" }],
      schema,
      schemaName: "my_schema",
    });

    expect(result.data).toEqual({ ok: true });
    const { body } = captureRequest(mock);
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "my_schema", strict: true, schema },
    });
  });
});

describe("callGatewayJSON — §4.4 JSON parse failure retries once", () => {
  it("retries once with prepended system message when first content is not valid JSON", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ content: "this is not json" }))
      .mockResolvedValueOnce(jsonResponse({ content: '{"ok":true}' }));
    global.fetch = mock as unknown as typeof fetch;

    const result = await callGatewayJSON<{ ok: boolean }>({
      model: "claude-opus-4-8",
      messages: [{ role: "user", content: "respond" }],
      schema: { type: "object" },
    });

    expect(mock).toHaveBeenCalledTimes(2);
    expect(result.data).toEqual({ ok: true });

    const firstBody = captureRequest(mock, 0).body;
    expect(firstBody.messages).toEqual([
      { role: "user", content: "respond" },
    ]);

    const secondBody = captureRequest(mock, 1).body;
    expect(secondBody.messages[0]).toEqual({
      role: "system",
      content: GATEWAY_JSON_RETRY_SYSTEM_MESSAGE,
    });
    expect(secondBody.messages[1]).toEqual({
      role: "user",
      content: "respond",
    });
    expect(secondBody.response_format).toBeDefined();
  });

  it("throws GatewayJSONParseError tagged with model after second failure", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ content: "still not json" }))
      .mockResolvedValueOnce(jsonResponse({ content: "again not json" }));
    global.fetch = mock as unknown as typeof fetch;

    let caught: unknown;
    try {
      await callGatewayJSON({
        model: "claude-opus-4-8",
        messages: [{ role: "user", content: "respond" }],
        schema: { type: "object" },
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(GatewayJSONParseError);
    expect((caught as GatewayJSONParseError).model).toBe("claude-opus-4-8");
    expect(mock).toHaveBeenCalledTimes(2);
  });

  it("does not retry when the first attempt parses successfully", async () => {
    const mock = vi.fn().mockResolvedValue(jsonResponse({ content: '{"a":1}' }));
    global.fetch = mock as unknown as typeof fetch;

    await callGatewayJSON({
      model: "claude-opus-4-8",
      messages: [{ role: "user", content: "respond" }],
      schema: { type: "object" },
    });

    expect(mock).toHaveBeenCalledTimes(1);
  });
});

describe("callGateway — temperature-unsupported retry", () => {
  it("retries once without temperature when a 400 reports temperature is deprecated", async () => {
    const mock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              type: "invalid_request_error",
              message: "`temperature` is deprecated for this model.",
            },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ content: "recovered" }));
    global.fetch = mock as unknown as typeof fetch;

    const result = await callGateway({
      model: "claude-opus-4-8",
      messages: [{ role: "user", content: "What is the best CRM?" }],
      max_tokens: 2000,
      temperature: 0.3,
      run_id: "batch-abc",
    });

    expect(mock).toHaveBeenCalledTimes(2);
    expect(result.content).toBe("recovered");

    // First attempt includes temperature…
    expect(captureRequest(mock, 0).body.temperature).toBe(0.3);
    // …retry drops it but keeps everything else.
    const retryBody = captureRequest(mock, 1).body;
    expect(retryBody.temperature).toBeUndefined();
    expect(retryBody).toEqual({
      model: "claude-opus-4-8",
      messages: [{ role: "user", content: "What is the best CRM?" }],
      max_tokens: 2000,
      run_id: "batch-abc",
    });
  });

  it("does not retry a 400 that is unrelated to temperature", async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: "context length exceeded" } }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );
    global.fetch = mock as unknown as typeof fetch;

    await expect(
      callGateway({
        model: "claude-opus-4-8",
        messages: [{ role: "user", content: "ping" }],
        temperature: 0.3,
      }),
    ).rejects.toBeInstanceOf(GatewayError);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("does not retry when no temperature was sent", async () => {
    const mock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: "temperature not allowed" } }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    );
    global.fetch = mock as unknown as typeof fetch;

    await expect(
      callGateway({
        model: "claude-opus-4-8",
        messages: [{ role: "user", content: "ping" }],
      }),
    ).rejects.toBeInstanceOf(GatewayError);
    expect(mock).toHaveBeenCalledTimes(1);
  });
});

describe("callGateway — §4.5 5xx surfaces typed error", () => {
  it("throws GatewayError with status and body on HTTP 500", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("upstream provider error", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      }),
    ) as unknown as typeof fetch;

    let caught: unknown;
    try {
      await callGateway({
        model: "gpt-5.5",
        messages: [{ role: "user", content: "ping" }],
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(GatewayError);
    const e = caught as GatewayError;
    expect(e.status).toBe(500);
    expect(e.model).toBe("gpt-5.5");
    expect(e.message).toContain("500");
    expect(e.message).toContain("gpt-5.5");
    expect(e.message).toContain("upstream provider error");
  });

  it("throws GatewayError on a 502 even when body is empty", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("", { status: 502 }),
    ) as unknown as typeof fetch;

    let caught: unknown;
    try {
      await callGateway({
        model: "claude-opus-4-8",
        messages: [{ role: "user", content: "ping" }],
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(GatewayError);
    expect((caught as GatewayError).status).toBe(502);
  });
});

describe("callGateway — §4.6 60s timeout", () => {
  it("rejects with GatewayTimeoutError after 60 seconds when fetch never resolves", async () => {
    vi.useFakeTimers();

    global.fetch = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) => {
          const signal = init.signal;
          if (signal) {
            signal.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          }
        }),
    ) as unknown as typeof fetch;

    const promise = callGateway({
      model: "claude-opus-4-8",
      messages: [{ role: "user", content: "ping" }],
    });

    // Attach a catch handler immediately so the rejection is observed.
    const settled: Promise<{ ok: boolean; err?: unknown }> = promise
      .then(() => ({ ok: true as const }))
      .catch((err: unknown) => ({ ok: false as const, err }));

    await vi.advanceTimersByTimeAsync(GATEWAY_TIMEOUT_MS);

    const outcome = await settled;
    expect(outcome.ok).toBe(false);
    expect(outcome.err).toBeInstanceOf(GatewayTimeoutError);
    const e = outcome.err as GatewayTimeoutError;
    expect(e.model).toBe("claude-opus-4-8");
    expect(e.timeoutMs).toBe(GATEWAY_TIMEOUT_MS);
    expect(e.message).toContain("claude-opus-4-8");
  });

  it("does not time out a request that completes promptly", async () => {
    vi.useFakeTimers();

    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ content: "ok" }),
    ) as unknown as typeof fetch;

    const promise = callGateway({
      model: "claude-opus-4-8",
      messages: [{ role: "user", content: "ping" }],
    });

    await vi.advanceTimersByTimeAsync(100);
    const result = await promise;
    expect(result.content).toBe("ok");
  });

  it("honours a per-call timeoutMs instead of the 60s default, and does not send it in the body", async () => {
    vi.useFakeTimers();

    const mock = vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) => {
          const signal = init.signal;
          if (signal) {
            signal.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
          }
        }),
    );
    global.fetch = mock as unknown as typeof fetch;

    const promise = callGateway({
      model: "claude-opus-5-5",
      messages: [{ role: "user", content: "ping" }],
      timeoutMs: 180_000,
    });
    let settledAt: number | null = null;
    const settled = promise.catch((err: unknown) => {
      settledAt = Date.now();
      return err;
    });
    const start = Date.now();

    await vi.advanceTimersByTimeAsync(GATEWAY_TIMEOUT_MS);
    expect(settledAt).toBeNull();

    await vi.advanceTimersByTimeAsync(180_000 - GATEWAY_TIMEOUT_MS);
    const err = await settled;
    expect(err).toBeInstanceOf(GatewayTimeoutError);
    expect((err as GatewayTimeoutError).timeoutMs).toBe(180_000);
    expect(settledAt! - start).toBe(180_000);

    const { body } = captureRequest(mock);
    expect(body).not.toHaveProperty("timeoutMs");
  });
});

describe("callGateway — §4.7 / §14.1.c no secrets in errors or logs", () => {
  it("does not include the bearer token in HTTP error messages", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        `unauthorized: token=${API_KEY} please rotate`,
        { status: 401 },
      ),
    ) as unknown as typeof fetch;

    let caught: unknown;
    try {
      await callGateway({
        model: "claude-opus-4-8",
        messages: [{ role: "user", content: "ping" }],
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(GatewayError);
    const e = caught as GatewayError;
    expect(e.message).not.toContain(API_KEY);
    expect(e.responseBody ?? "").not.toContain(API_KEY);
  });

  it("does not include the bearer token in fetch-failure error messages", async () => {
    global.fetch = vi.fn().mockImplementation(() => {
      throw new Error(
        `network error while sending Authorization: Bearer ${API_KEY}`,
      );
    }) as unknown as typeof fetch;

    let caught: unknown;
    try {
      await callGateway({
        model: "claude-opus-4-8",
        messages: [{ role: "user", content: "ping" }],
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(GatewayError);
    expect((caught as GatewayError).message).not.toContain(API_KEY);
  });

  it("scrubSecret strips bare and Bearer-prefixed secret occurrences", () => {
    const text = `error: Authorization: Bearer ${API_KEY} and raw ${API_KEY} too`;
    const scrubbed = scrubSecret(text, API_KEY);
    expect(scrubbed).not.toContain(API_KEY);
    expect(scrubbed).toContain("Bearer ***");
  });
});

describe("callGateway — env validation", () => {
  it("throws if LLM_GATEWAY_BASE_URL is missing", async () => {
    delete process.env.LLM_GATEWAY_BASE_URL;
    global.fetch = vi.fn() as unknown as typeof fetch;
    await expect(
      callGateway({
        model: "claude-opus-4-8",
        messages: [{ role: "user", content: "ping" }],
      }),
    ).rejects.toThrow(/LLM_GATEWAY_BASE_URL/);
  });

  it("throws if LLM_GATEWAY_API_KEY is missing", async () => {
    delete process.env.LLM_GATEWAY_API_KEY;
    global.fetch = vi.fn() as unknown as typeof fetch;
    await expect(
      callGateway({
        model: "claude-opus-4-8",
        messages: [{ role: "user", content: "ping" }],
      }),
    ).rejects.toThrow(/LLM_GATEWAY_API_KEY/);
  });
});
