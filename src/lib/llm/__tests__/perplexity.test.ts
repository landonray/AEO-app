import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callPerplexity, PerplexityError } from "../perplexity";

interface CapturedRequest {
  url: string;
  init: RequestInit;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetch(response: Response | Promise<Response>): {
  captured: CapturedRequest[];
} {
  const captured: CapturedRequest[] = [];
  const fetchMock = vi.fn(
    async (url: RequestInfo | URL, init?: RequestInit) => {
      captured.push({ url: String(url), init: init ?? {} });
      return response instanceof Promise ? await response : response;
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return { captured };
}

beforeEach(() => {
  process.env.PERPLEXITY_API_KEY = "pplx-test-key";
  delete process.env.MODEL_PERPLEXITY;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("callPerplexity — §5.1 request shape", () => {
  it("POSTs to the Perplexity chat completions endpoint with bearer auth and standard body", async () => {
    const { captured } = installFetch(
      jsonResponse({
        choices: [{ message: { content: "hi" } }],
        citations: [],
      }),
    );

    await callPerplexity("what is the best CRM?");

    expect(captured).toHaveLength(1);
    const [req] = captured;
    expect(req.url).toBe("https://api.perplexity.ai/chat/completions");
    expect(req.init.method).toBe("POST");

    const headers = req.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer pplx-test-key");
    expect(headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(String(req.init.body));
    expect(body.model).toBe("sonar-pro");
    expect(body.max_tokens).toBe(2000);
    expect(body.temperature).toBe(0.3);
    expect(body.messages).toEqual([
      { role: "user", content: "what is the best CRM?" },
    ]);
  });

  it("uses MODEL_PERPLEXITY env override when set", async () => {
    process.env.MODEL_PERPLEXITY = "sonar";
    const { captured } = installFetch(
      jsonResponse({
        choices: [{ message: { content: "x" } }],
      }),
    );

    await callPerplexity("q");

    const body = JSON.parse(String(captured[0].init.body));
    expect(body.model).toBe("sonar");
  });
});

describe("callPerplexity — §5.2 reads choices[0].message.content", () => {
  it("returns the assistant text from choices[0].message.content (not top-level content)", async () => {
    installFetch(
      jsonResponse({
        // Note: top-level `content` should be IGNORED — that is the gateway shape.
        content: "this-is-wrong-gateway-shape",
        choices: [
          { message: { content: "Acme is widely regarded as the leader." } },
        ],
        citations: ["https://acme.com"],
      }),
    );

    const result = await callPerplexity("tell me about acme");
    expect(result.content).toBe("Acme is widely regarded as the leader.");
  });

  it("returns empty string when choices/message/content is missing", async () => {
    installFetch(jsonResponse({ choices: [] }));
    const result = await callPerplexity("q");
    expect(result.content).toBe("");
  });
});

describe("callPerplexity — §5.3 citations fallback", () => {
  it("5.3.a uses top-level citations[] when present", async () => {
    installFetch(
      jsonResponse({
        choices: [{ message: { content: "ok" } }],
        citations: ["https://a.com", "https://b.com"],
        search_results: [{ url: "https://should-not-use.com" }],
      }),
    );

    const result = await callPerplexity("q");
    expect(result.citations).toEqual(["https://a.com", "https://b.com"]);
  });

  it("5.3.b falls back to search_results[].url when citations is absent", async () => {
    installFetch(
      jsonResponse({
        choices: [{ message: { content: "ok" } }],
        search_results: [
          { url: "https://x.com/page" },
          { url: "https://y.com" },
        ],
      }),
    );

    const result = await callPerplexity("q");
    expect(result.citations).toEqual([
      "https://x.com/page",
      "https://y.com",
    ]);
  });

  it("5.3.c returns empty citations when neither field is present", async () => {
    installFetch(
      jsonResponse({
        choices: [{ message: { content: "ok" } }],
      }),
    );

    const result = await callPerplexity("q");
    expect(result.citations).toEqual([]);
    expect(result.content).toBe("ok");
  });

  it("filters out non-string and empty entries in citations[]", async () => {
    installFetch(
      jsonResponse({
        choices: [{ message: { content: "ok" } }],
        citations: ["https://a.com", "", null, 42, "https://b.com"],
      }),
    );

    const result = await callPerplexity("q");
    expect(result.citations).toEqual(["https://a.com", "https://b.com"]);
  });

  it("falls back to search_results when citations is an empty array", async () => {
    installFetch(
      jsonResponse({
        choices: [{ message: { content: "ok" } }],
        citations: [],
        search_results: [{ url: "https://fallback.com" }],
      }),
    );

    const result = await callPerplexity("q");
    expect(result.citations).toEqual(["https://fallback.com"]);
  });
});

describe("callPerplexity — §5.5 non-2xx error", () => {
  it("throws a PerplexityError tagged with 'perplexity' on a 500 response", async () => {
    installFetch(
      new Response("upstream boom", {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      }),
    );

    await expect(callPerplexity("q")).rejects.toMatchObject({
      name: "PerplexityError",
      source: "perplexity",
      status: 500,
    });
  });

  it("throws a PerplexityError on a 401 response and includes the status", async () => {
    installFetch(
      new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    try {
      await callPerplexity("q");
      throw new Error("expected callPerplexity to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(PerplexityError);
      expect((err as PerplexityError).status).toBe(401);
      expect((err as PerplexityError).source).toBe("perplexity");
    }
  });

  it("throws a PerplexityError when PERPLEXITY_API_KEY is missing", async () => {
    delete process.env.PERPLEXITY_API_KEY;
    await expect(callPerplexity("q")).rejects.toBeInstanceOf(PerplexityError);
  });
});
