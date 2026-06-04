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
  CRAWL_EXTRACTION_SCHEMA,
  PROMPT_GENERATION_SCHEMA,
  COMPETITOR_GENERATION_SCHEMA,
  extractCrawl,
  generatePrompts,
  generateCompetitors,
} from "@/lib/generators";
import { GATEWAY_JSON_RETRY_SYSTEM_MESSAGE } from "@/lib/llm/gateway";
import type { CrawlPage, CrawlResult } from "@/types";

const BASE_URL = "https://llm-gateway.test/api/v1";
const API_KEY = "llmgw_secret_test_token";

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
  const body = init.body ? JSON.parse(init.body as string) : undefined;
  return { url, init, headers, body };
}

let originalFetch: typeof fetch | undefined;

beforeEach(() => {
  process.env.LLM_GATEWAY_BASE_URL = BASE_URL;
  process.env.LLM_GATEWAY_API_KEY = API_KEY;
  process.env.MODEL_GENERATION = "gemini-2.5-flash";
  originalFetch = global.fetch;
});

afterEach(() => {
  if (originalFetch) global.fetch = originalFetch;
  vi.restoreAllMocks();
});

const SAMPLE_CRAWL: CrawlResult = {
  title: "Acme Cloud",
  description: "The modern team workspace.",
  category: "Team collaboration software",
  targetAudience: "Engineering teams at startups",
  coreUseCase: "Real-time docs and project tracking",
  features: ["Real-time docs", "Issue tracking", "Wiki"],
  integrations: ["GitHub", "Slack"],
  pricingInfo: "Free, Pro at $10/user/month",
  competitorHints: ["Notion", "Linear"],
};

const SAMPLE_PAGES: CrawlPage[] = [
  { path: "/", text: "Acme Cloud — modern team workspace for engineering teams." },
  { path: "/pricing", text: "Free plan, Pro plan at $10/user/month." },
];

describe("extractCrawl — §9.3 crawl extraction", () => {
  it("sends a json_schema request with the §9 crawl schema to MODEL_GENERATION", async () => {
    const conformant: CrawlResult = SAMPLE_CRAWL;
    const mock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ content: JSON.stringify(conformant) }));
    global.fetch = mock as unknown as typeof fetch;

    const result = await extractCrawl(SAMPLE_PAGES, "https://acme.com/");

    expect(mock).toHaveBeenCalledTimes(1);
    const { url, headers, body } = captureRequest(mock);
    expect(url).toBe(`${BASE_URL}/chat/completions`);
    expect(headers.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(body.model).toBe("gemini-2.5-flash");
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: {
        name: "crawl_extraction",
        strict: true,
        schema: CRAWL_EXTRACTION_SCHEMA,
      },
    });
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toMatch(/ONLY valid JSON/i);
    expect(body.messages[0].content).toMatch(/no markdown/i);
    // The page contents should appear in the user message
    const userMessage = body.messages[1];
    expect(userMessage.role).toBe("user");
    expect(userMessage.content).toContain("Acme Cloud");
    expect(userMessage.content).toContain("/pricing");
    expect(userMessage.content).toContain("https://acme.com/");

    expect(result).toEqual(conformant);
  });

  it("uses MODEL_GENERATION env override when set", async () => {
    process.env.MODEL_GENERATION = "gemini-3.0-test";
    const mock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ content: JSON.stringify(SAMPLE_CRAWL) }));
    global.fetch = mock as unknown as typeof fetch;

    await extractCrawl(SAMPLE_PAGES, "https://acme.com/");

    const { body } = captureRequest(mock);
    expect(body.model).toBe("gemini-3.0-test");
  });

  it("schema declares all required keys and lists pricingInfo as optional", () => {
    expect(CRAWL_EXTRACTION_SCHEMA.required).toEqual([
      "title",
      "description",
      "category",
      "targetAudience",
      "coreUseCase",
      "features",
      "integrations",
      "competitorHints",
    ]);
    const required = CRAWL_EXTRACTION_SCHEMA.required as string[];
    expect(required).not.toContain("pricingInfo");
    const properties = CRAWL_EXTRACTION_SCHEMA.properties as Record<
      string,
      unknown
    >;
    expect(properties.pricingInfo).toBeDefined();
  });

  it("retries with the JSON-retry system message when the first response is unparseable (§4.4)", async () => {
    const conformant = SAMPLE_CRAWL;
    const mock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ content: "not json at all" }))
      .mockResolvedValueOnce(
        jsonResponse({ content: JSON.stringify(conformant) }),
      );
    global.fetch = mock as unknown as typeof fetch;

    const result = await extractCrawl(SAMPLE_PAGES, "https://acme.com/");

    expect(mock).toHaveBeenCalledTimes(2);
    expect(result).toEqual(conformant);

    const firstBody = captureRequest(mock, 0).body;
    expect(firstBody.messages[0].role).toBe("system");
    expect(firstBody.messages[0].content).not.toBe(
      GATEWAY_JSON_RETRY_SYSTEM_MESSAGE,
    );

    const secondBody = captureRequest(mock, 1).body;
    expect(secondBody.messages[0]).toEqual({
      role: "system",
      content: GATEWAY_JSON_RETRY_SYSTEM_MESSAGE,
    });
    // The original messages should still be in the retry body
    expect(secondBody.messages.length).toBeGreaterThanOrEqual(3);
  });
});

describe("generatePrompts — §9.4 prompt generation", () => {
  it("sends a json_schema request with the prompts schema and enforces no brand-name leakage in system message", async () => {
    const payload = {
      prompts: [
        { text: "best team collaboration software for engineering teams", topic: "Category" },
        { text: "top alternatives to Notion", topic: "Competitor" },
        { text: "Notion vs Linear vs Confluence", topic: "Affiliate" },
        { text: "how to track engineering projects in real time", topic: "Core" },
        { text: "free tool for team documentation", topic: "Free tool" },
      ],
    };
    const mock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ content: JSON.stringify(payload) }));
    global.fetch = mock as unknown as typeof fetch;

    const result = await generatePrompts(SAMPLE_CRAWL, "acme.com");

    expect(result).toEqual(payload.prompts);
    expect(mock).toHaveBeenCalledTimes(1);

    const { body } = captureRequest(mock);
    expect(body.model).toBe("gemini-2.5-flash");
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: {
        name: "prompt_generation",
        strict: true,
        schema: PROMPT_GENERATION_SCHEMA,
      },
    });

    const sysContent = body.messages[0].content as string;
    expect(body.messages[0].role).toBe("system");
    expect(sysContent).toMatch(/real-buyer/i);
    expect(sysContent).toMatch(/brand name/i);
    // All five topic categories are referenced
    for (const topic of ["Category", "Competitor", "Affiliate", "Core", "Free tool"]) {
      expect(sysContent).toContain(`"${topic}"`);
    }
    // Domain is passed into user message for context
    expect(body.messages[1].content).toContain("acme.com");
  });

  it("schema requires exactly 5 prompts with the five-topic enum", () => {
    const promptsProp = (PROMPT_GENERATION_SCHEMA.properties as Record<
      string,
      Record<string, unknown>
    >).prompts;
    expect(promptsProp.minItems).toBe(5);
    expect(promptsProp.maxItems).toBe(5);
    const items = promptsProp.items as Record<string, unknown>;
    const itemProps = items.properties as Record<string, Record<string, unknown>>;
    expect(itemProps.topic.enum).toEqual([
      "Category",
      "Competitor",
      "Affiliate",
      "Core",
      "Free tool",
    ]);
    expect(items.required).toEqual(["text", "topic"]);
  });

  it("retries on malformed first JSON response (§4.4)", async () => {
    const payload = {
      prompts: [
        { text: "best CRMs for small business", topic: "Category" },
        { text: "top alternatives to HubSpot", topic: "Competitor" },
        { text: "HubSpot vs Salesforce vs Pipedrive", topic: "Affiliate" },
        { text: "how to manage a sales pipeline", topic: "Core" },
        { text: "free tool for tracking leads", topic: "Free tool" },
      ],
    };
    const mock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ content: "not json" }))
      .mockResolvedValueOnce(jsonResponse({ content: JSON.stringify(payload) }));
    global.fetch = mock as unknown as typeof fetch;

    const result = await generatePrompts(SAMPLE_CRAWL, "acme.com");

    expect(mock).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(5);

    const secondBody = captureRequest(mock, 1).body;
    expect(secondBody.messages[0]).toEqual({
      role: "system",
      content: GATEWAY_JSON_RETRY_SYSTEM_MESSAGE,
    });
  });
});

describe("generateCompetitors — §9.5 competitor generation", () => {
  it("returns 4-5 bare apex domains and filters out the user's own apex", async () => {
    const payload = {
      competitors: [
        { name: "Notion", domain: "https://www.notion.so/" },
        { name: "Linear", domain: "www.linear.app" },
        { name: "Acme Cloud", domain: "acme.com" }, // own domain — should be stripped
        { name: "Confluence", domain: "atlassian.com/software/confluence?utm=1" },
        { name: "Coda", domain: "HTTP://Coda.IO" },
      ],
    };
    const mock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ content: JSON.stringify(payload) }));
    global.fetch = mock as unknown as typeof fetch;

    const result = await generateCompetitors(SAMPLE_CRAWL, "acme.com");

    // Own domain removed
    expect(result.find((c) => c.domain === "acme.com")).toBeUndefined();

    // 4 remaining after filtering own domain
    expect(result).toHaveLength(4);

    // All bare apex domains: no protocol, no www, no path
    for (const c of result) {
      expect(c.domain).not.toMatch(/^https?:\/\//);
      expect(c.domain).not.toMatch(/^www\./);
      expect(c.domain).not.toContain("/");
      expect(c.domain).toBe(c.domain.toLowerCase());
    }

    expect(result.map((c) => c.domain).sort()).toEqual(
      ["atlassian.com", "coda.io", "linear.app", "notion.so"].sort(),
    );
  });

  it("also filters the user's apex when the input domain has protocol or www", async () => {
    const payload = {
      competitors: [
        { name: "Notion", domain: "notion.so" },
        { name: "Linear", domain: "linear.app" },
        { name: "Self", domain: "https://www.acme.com/" },
        { name: "Confluence", domain: "atlassian.com" },
        { name: "Coda", domain: "coda.io" },
      ],
    };
    const mock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ content: JSON.stringify(payload) }));
    global.fetch = mock as unknown as typeof fetch;

    const result = await generateCompetitors(SAMPLE_CRAWL, "https://www.acme.com");

    expect(result).toHaveLength(4);
    expect(result.find((c) => c.domain === "acme.com")).toBeUndefined();
  });

  it("sends a json_schema request with the competitors schema", async () => {
    const payload = {
      competitors: [
        { name: "Notion", domain: "notion.so" },
        { name: "Linear", domain: "linear.app" },
        { name: "Confluence", domain: "atlassian.com" },
        { name: "Coda", domain: "coda.io" },
      ],
    };
    const mock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ content: JSON.stringify(payload) }));
    global.fetch = mock as unknown as typeof fetch;

    await generateCompetitors(SAMPLE_CRAWL, "acme.com");

    const { body } = captureRequest(mock);
    expect(body.model).toBe("gemini-2.5-flash");
    expect(body.response_format).toEqual({
      type: "json_schema",
      json_schema: {
        name: "competitor_generation",
        strict: true,
        schema: COMPETITOR_GENERATION_SCHEMA,
      },
    });

    const sysContent = body.messages[0].content as string;
    expect(sysContent).toMatch(/bare apex/i);
    expect(sysContent).toMatch(/no `www\.`/i);
  });

  it("schema requires 4–5 competitor items with name and domain", () => {
    const competitorsProp = (COMPETITOR_GENERATION_SCHEMA.properties as Record<
      string,
      Record<string, unknown>
    >).competitors;
    expect(competitorsProp.minItems).toBe(4);
    expect(competitorsProp.maxItems).toBe(5);
    const items = competitorsProp.items as Record<string, unknown>;
    expect(items.required).toEqual(["name", "domain"]);
  });

  it("retries on malformed first JSON response (§4.4)", async () => {
    const payload = {
      competitors: [
        { name: "Notion", domain: "notion.so" },
        { name: "Linear", domain: "linear.app" },
        { name: "Confluence", domain: "atlassian.com" },
        { name: "Coda", domain: "coda.io" },
      ],
    };
    const mock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ content: "totally not json" }))
      .mockResolvedValueOnce(jsonResponse({ content: JSON.stringify(payload) }));
    global.fetch = mock as unknown as typeof fetch;

    const result = await generateCompetitors(SAMPLE_CRAWL, "acme.com");

    expect(mock).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(4);

    const secondBody = captureRequest(mock, 1).body;
    expect(secondBody.messages[0]).toEqual({
      role: "system",
      content: GATEWAY_JSON_RETRY_SYSTEM_MESSAGE,
    });
  });

  it("drops competitor rows that arrive with empty name or empty domain", async () => {
    const payload = {
      competitors: [
        { name: "Notion", domain: "notion.so" },
        { name: "", domain: "ignored.com" },
        { name: "Linear", domain: "linear.app" },
        { name: "Empty Domain", domain: "" },
        { name: "Confluence", domain: "atlassian.com" },
      ],
    };
    const mock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ content: JSON.stringify(payload) }));
    global.fetch = mock as unknown as typeof fetch;

    const result = await generateCompetitors(SAMPLE_CRAWL, "acme.com");

    expect(result).toHaveLength(3);
    expect(result.map((c) => c.name).sort()).toEqual(
      ["Confluence", "Linear", "Notion"].sort(),
    );
  });
});
