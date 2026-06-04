import { escapeRegex, normalizeDomain } from "@/lib/utils";
import type { Brand, Competitor, Sentiment } from "@/types";

export type ParserBrand = Pick<Brand, "name" | "domain">;
export type ParserCompetitor = Pick<Competitor, "name" | "domain">;

export const POSITIVE_SENTIMENT_WORDS: readonly string[] = [
  "best",
  "top",
  "leading",
  "recommended",
  "popular",
  "trusted",
  "excellent",
  "powerful",
  "robust",
  "reliable",
  "innovative",
  "strong",
  "favorite",
  "preferred",
  "standout",
  "highest-rated",
  "comprehensive",
  "intuitive",
  "seamless",
];

export const NEGATIVE_SENTIMENT_WORDS: readonly string[] = [
  "worst",
  "poor",
  "limited",
  "expensive",
  "outdated",
  "weak",
  "lacking",
  "mediocre",
  "slow",
  "buggy",
  "complicated",
  "confusing",
  "frustrating",
  "inferior",
  "underwhelming",
];

const CITATION_URL_REGEX = /https?:\/\/[^\s)\]\}"'<>]+/g;
const TRAILING_PUNCT_REGEX = /[.,;:!?]+$/;
const NUMBERED_LIST_LINE_REGEX = /^\s*(\d+)[.)]\s/;
const SENTENCE_SPLIT_REGEX = /[.!?]+\s+/;

function buildNameRegex(name: string | null | undefined): RegExp | null {
  if (name === null || name === undefined) return null;
  const trimmed = String(name).trim();
  if (!trimmed) return null;
  const escaped = escapeRegex(trimmed).replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${escaped}\\b`, "i");
}

function buildDomainRegex(domain: string | null | undefined): RegExp | null {
  if (domain === null || domain === undefined) return null;
  const apex = normalizeDomain(String(domain));
  if (!apex) return null;
  return new RegExp(`\\b${escapeRegex(apex)}\\b`, "i");
}

interface MentionIndex {
  index: number;
  length: number;
}

function firstMentionIndex(
  text: string,
  brand: ParserBrand,
): MentionIndex | null {
  if (!text) return null;
  const nameRe = buildNameRegex(brand?.name);
  const domainRe = buildDomainRegex(brand?.domain);

  let best: MentionIndex | null = null;

  if (nameRe) {
    const m = text.match(nameRe);
    if (m && m.index !== undefined) {
      best = { index: m.index, length: m[0].length };
    }
  }
  if (domainRe) {
    const m = text.match(domainRe);
    if (m && m.index !== undefined) {
      if (best === null || m.index < best.index) {
        best = { index: m.index, length: m[0].length };
      }
    }
  }

  return best;
}

export function detectMentioned(
  text: string | null | undefined,
  brand: ParserBrand | null | undefined,
): boolean {
  if (!text || !brand) return false;
  return firstMentionIndex(text, brand) !== null;
}

export function computePositionScore(
  text: string | null | undefined,
  brand: ParserBrand | null | undefined,
): number | null {
  if (!text || !brand) return null;
  const mention = firstMentionIndex(text, brand);
  if (mention === null) return null;

  const lineStart = text.lastIndexOf("\n", mention.index - 1) + 1;
  let lineEnd = text.indexOf("\n", mention.index);
  if (lineEnd === -1) lineEnd = text.length;
  const line = text.slice(lineStart, lineEnd);

  const listMatch = line.match(NUMBERED_LIST_LINE_REGEX);
  if (listMatch) {
    const parsed = Number.parseInt(listMatch[1] ?? "", 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(parsed, 5);
    }
  }

  const len = text.length;
  if (len === 0) return null;
  const segmentLength = len / 5;
  let segment = Math.floor(mention.index / segmentLength) + 1;
  if (segment < 1) segment = 1;
  if (segment > 5) segment = 5;
  return segment;
}

function countOccurrences(text: string, words: readonly string[]): number {
  if (!text) return 0;
  let count = 0;
  for (const w of words) {
    if (!w) continue;
    const re = new RegExp(`\\b${escapeRegex(w)}\\b`, "gi");
    const matches = text.match(re);
    if (matches) count += matches.length;
  }
  return count;
}

export function computeSentiment(
  text: string | null | undefined,
  brand: ParserBrand | null | undefined,
): Sentiment {
  if (!text || !brand) return "neutral";

  const nameRe = buildNameRegex(brand.name);
  const domainRe = buildDomainRegex(brand.domain);
  if (!nameRe && !domainRe) return "neutral";

  const sentences = text.split(SENTENCE_SPLIT_REGEX);
  const brandSentences: string[] = [];
  for (const s of sentences) {
    if (!s) continue;
    if (nameRe && nameRe.test(s)) {
      brandSentences.push(s);
      continue;
    }
    if (domainRe && domainRe.test(s)) {
      brandSentences.push(s);
    }
  }

  if (brandSentences.length === 0) return "neutral";

  let pos = 0;
  let neg = 0;
  for (const s of brandSentences) {
    pos += countOccurrences(s, POSITIVE_SENTIMENT_WORDS);
    neg += countOccurrences(s, NEGATIVE_SENTIMENT_WORDS);
  }

  if (pos > neg) return "positive";
  if (neg > pos) return "negative";
  return "neutral";
}

export function computeCompetitorMentions(
  text: string | null | undefined,
  competitors: ReadonlyArray<ParserCompetitor> | null | undefined,
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  if (!competitors) return result;
  for (const c of competitors) {
    if (!c || typeof c.name !== "string") continue;
    result[c.name] = detectMentioned(text, c);
  }
  return result;
}

export function extractCitations(
  text: string | null | undefined,
  apiCitations?: ReadonlyArray<string> | null,
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  if (typeof text === "string" && text.length > 0) {
    const matches = text.match(CITATION_URL_REGEX);
    if (matches) {
      for (const raw of matches) {
        const cleaned = raw.replace(TRAILING_PUNCT_REGEX, "");
        if (cleaned && !seen.has(cleaned)) {
          seen.add(cleaned);
          result.push(cleaned);
        }
      }
    }
  }

  if (apiCitations) {
    for (const url of apiCitations) {
      if (typeof url !== "string") continue;
      const trimmed = url.trim();
      if (!trimmed) continue;
      if (!seen.has(trimmed)) {
        seen.add(trimmed);
        result.push(trimmed);
      }
    }
  }

  return result;
}
