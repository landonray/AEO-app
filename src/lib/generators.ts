import { callGatewayJSON } from "@/lib/llm/gateway";
import { normalizeDomain } from "@/lib/utils";
import type { CrawlPage, CrawlResult, PromptTopic } from "@/types";

const DEFAULT_GENERATION_MODEL = "gemini-2.5-flash";

function getGenerationModel(): string {
  return process.env.MODEL_GENERATION || DEFAULT_GENERATION_MODEL;
}

const CRAWL_SYSTEM_MESSAGE =
  "You extract structured product metadata from a website crawl. " +
  "Return ONLY valid JSON matching the schema. No prose, no markdown.";

export const CRAWL_EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: "object",
  required: [
    "title",
    "description",
    "category",
    "targetAudience",
    "coreUseCase",
    "features",
    "integrations",
    "competitorHints",
  ],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    category: { type: "string" },
    targetAudience: { type: "string" },
    coreUseCase: { type: "string" },
    features: { type: "array", items: { type: "string" } },
    integrations: { type: "array", items: { type: "string" } },
    pricingInfo: { type: "string" },
    competitorHints: { type: "array", items: { type: "string" } },
  },
};

const PROMPTS_SYSTEM_MESSAGE =
  "You generate buyer-intent search prompts that real people would type into ChatGPT, Claude, or Perplexity. " +
  "Return exactly 5 prompts as JSON matching the schema. No prose, no markdown. " +
  "Every prompt MUST use real-buyer phrasing — long-tail, commercial intent. " +
  "You MUST NOT include the brand name or the brand's domain in any prompt. These prompts are used to test whether the brand surfaces unprompted, so any brand-name leakage invalidates the test. " +
  "The 5 prompts MUST cover all five topic categories, exactly one of each: " +
  '"Category" (e.g. "best X for Y"), ' +
  '"Competitor" (e.g. "top alternatives to <competitor>"), ' +
  '"Affiliate" (e.g. "X vs Y vs Z"), ' +
  '"Core" (e.g. "how to <use case>"), ' +
  '"Free tool" (e.g. "free tool for <task>").';

export const PROMPT_GENERATION_SCHEMA: Record<string, unknown> = {
  type: "object",
  required: ["prompts"],
  properties: {
    prompts: {
      type: "array",
      minItems: 5,
      maxItems: 5,
      items: {
        type: "object",
        required: ["text", "topic"],
        properties: {
          text: { type: "string" },
          topic: {
            type: "string",
            enum: ["Category", "Competitor", "Affiliate", "Core", "Free tool"],
          },
        },
      },
    },
  },
};

const COMPETITORS_SYSTEM_MESSAGE =
  "You generate a list of 4 to 5 direct competitor companies for a product, based on its category and crawled hints. " +
  "Return ONLY valid JSON matching the schema. No prose, no markdown. " +
  "Each competitor MUST have a `name` and a `domain`. " +
  "The `domain` MUST be the bare apex domain — no `https://`, no `http://`, no `www.`, no trailing path. " +
  "Use the website's `competitorHints` and `category` as the primary signal. " +
  "Do NOT include consulting firms, marketing agencies, or generic SaaS that are not direct competitors. " +
  "Do NOT include the user's own brand or domain.";

export const COMPETITOR_GENERATION_SCHEMA: Record<string, unknown> = {
  type: "object",
  required: ["competitors"],
  properties: {
    competitors: {
      type: "array",
      minItems: 4,
      maxItems: 5,
      items: {
        type: "object",
        required: ["name", "domain"],
        properties: {
          name: { type: "string" },
          domain: { type: "string" },
        },
      },
    },
  },
};

function formatPagesForExtraction(pages: CrawlPage[], url: string): string {
  const lines: string[] = [`URL: ${url}`, ""];
  for (const page of pages) {
    lines.push(`--- PAGE: ${page.path} ---`);
    lines.push(page.text);
    lines.push("");
  }
  return lines.join("\n");
}

export async function extractCrawl(
  pages: CrawlPage[],
  url: string,
): Promise<CrawlResult> {
  const userContent =
    `Extract product metadata from the following crawl of ${url}.\n\n` +
    formatPagesForExtraction(pages, url);

  const { data } = await callGatewayJSON<CrawlResult>({
    model: getGenerationModel(),
    messages: [
      { role: "system", content: CRAWL_SYSTEM_MESSAGE },
      { role: "user", content: userContent },
    ],
    schema: CRAWL_EXTRACTION_SCHEMA,
    schemaName: "crawl_extraction",
    max_tokens: 2000,
    temperature: 0.3,
  });

  return data;
}

interface PromptGenerationPayload {
  prompts: { text: string; topic: PromptTopic }[];
}

export async function generatePrompts(
  crawl: CrawlResult,
  domain: string,
): Promise<{ text: string; topic: PromptTopic }[]> {
  const userContent =
    `Generate 5 prompts for tracking the AI search visibility of the brand at domain ${domain}.\n\n` +
    `Product context (JSON):\n${JSON.stringify(crawl, null, 2)}\n\n` +
    `Reminder: do NOT mention the brand "${crawl.title}" or the domain "${domain}" in any prompt. ` +
    `Use all five topic categories exactly once.`;

  const { data } = await callGatewayJSON<PromptGenerationPayload>({
    model: getGenerationModel(),
    messages: [
      { role: "system", content: PROMPTS_SYSTEM_MESSAGE },
      { role: "user", content: userContent },
    ],
    schema: PROMPT_GENERATION_SCHEMA,
    schemaName: "prompt_generation",
    max_tokens: 2000,
    temperature: 0.3,
  });

  return data.prompts;
}

interface CompetitorGenerationPayload {
  competitors: { name: string; domain: string }[];
}

function cleanCompetitorDomain(raw: string): string {
  if (!raw) return "";
  let s = String(raw).trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.replace(/^\/\//, "");
  s = s.split("/")[0] ?? "";
  s = s.split("?")[0] ?? "";
  s = s.split("#")[0] ?? "";
  s = s.replace(/^www\./, "");
  s = s.replace(/\.+$/, "");
  return s;
}

export async function generateCompetitors(
  crawl: CrawlResult,
  domain: string,
): Promise<{ name: string; domain: string }[]> {
  const userContent =
    `Generate 4 to 5 direct competitor companies for the product at domain ${domain}.\n\n` +
    `Product context (JSON):\n${JSON.stringify(crawl, null, 2)}\n\n` +
    `Do NOT include "${domain}" or any subdomain of it.`;

  const { data } = await callGatewayJSON<CompetitorGenerationPayload>({
    model: getGenerationModel(),
    messages: [
      { role: "system", content: COMPETITORS_SYSTEM_MESSAGE },
      { role: "user", content: userContent },
    ],
    schema: COMPETITOR_GENERATION_SCHEMA,
    schemaName: "competitor_generation",
    max_tokens: 2000,
    temperature: 0.3,
  });

  const ownApex = normalizeDomain(domain);

  return data.competitors
    .map((c) => ({
      name: String(c?.name ?? "").trim(),
      domain: cleanCompetitorDomain(String(c?.domain ?? "")),
    }))
    .filter((c) => c.name.length > 0 && c.domain.length > 0)
    .filter((c) => c.domain !== ownApex);
}
