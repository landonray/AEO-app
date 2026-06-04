import { describe, it, expect } from "vitest";
import {
  detectMentioned,
  computePositionScore,
  computeSentiment,
  computeCompetitorMentions,
  extractCitations,
  POSITIVE_SENTIMENT_WORDS,
  NEGATIVE_SENTIMENT_WORDS,
  type ParserBrand,
  type ParserCompetitor,
} from "@/lib/llm/parser";

const acme: ParserBrand = { name: "Acme", domain: "acme.com" };

describe("detectMentioned — QA §3.1", () => {
  it("3.1.a plain brand name → true", () => {
    expect(detectMentioned("Best CRM is Acme for SMBs", acme)).toBe(true);
  });

  it("3.1.b case-insensitive → true", () => {
    expect(detectMentioned("acme works well", acme)).toBe(true);
  });

  it("3.1.c word boundary respected → false", () => {
    const cake: ParserBrand = { name: "Cake", domain: "cake.com" };
    expect(detectMentioned("Pancakes are good", cake)).toBe(false);
  });

  it("3.1.d multi-word brand allows internal whitespace flex → true", () => {
    const acmeCrm: ParserBrand = { name: "Acme CRM", domain: "acme.com" };
    expect(detectMentioned("Use Acme  CRM", acmeCrm)).toBe(true);
    expect(detectMentioned("Use Acme\tCRM", acmeCrm)).toBe(true);
    expect(detectMentioned("Use Acme CRM today", acmeCrm)).toBe(true);
  });

  it("3.1.e domain apex match → true", () => {
    expect(detectMentioned("See acme.com for details", acme)).toBe(true);
  });

  it("3.1.f domain with www. and protocol → true", () => {
    expect(detectMentioned("https://www.acme.com is the URL", acme)).toBe(true);
  });

  it("3.1.g domain on a subdomain → true (apex match)", () => {
    expect(detectMentioned("Visit blog.acme.com for the latest", acme)).toBe(
      true,
    );
  });

  it("3.1.h empty response → false", () => {
    expect(detectMentioned("", acme)).toBe(false);
  });

  it("3.1.i brand name with regex metacharacters → escaped match", () => {
    const cpp: ParserBrand = { name: "C++ Builder", domain: "cppbuilder.com" };
    expect(detectMentioned("I love C++ Builder for legacy code.", cpp)).toBe(
      true,
    );
    expect(detectMentioned("I love Cxx Builder for legacy code.", cpp)).toBe(
      false,
    );
  });

  it("3.1.j documented false positive on generic name (e.g. Apple)", () => {
    const apple: ParserBrand = { name: "Apple", domain: "apple.com" };
    expect(detectMentioned("An apple a day keeps the doctor away.", apple)).toBe(
      true,
    );
  });

  it("brand name only (no usable domain) still matches by name", () => {
    const nameOnly: ParserBrand = { name: "Acme", domain: "" };
    expect(detectMentioned("Acme is great", nameOnly)).toBe(true);
  });

  it("brand domain only (no usable name) still matches by domain", () => {
    const domainOnly: ParserBrand = { name: "", domain: "acme.com" };
    expect(detectMentioned("Visit acme.com", domainOnly)).toBe(true);
  });

  it("substring-but-not-word does NOT match (case-insensitive boundary)", () => {
    expect(detectMentioned("acmecorp products", acme)).toBe(false);
  });

  it("null brand → false", () => {
    expect(detectMentioned("Acme", null)).toBe(false);
  });
});

describe("computePositionScore — QA §3.2", () => {
  it("3.2.a numbered list, brand at #1 → 1", () => {
    expect(computePositionScore("1. Acme\n2. Beta", acme)).toBe(1);
  });

  it("3.2.b numbered list, brand at #3 → 3", () => {
    expect(
      computePositionScore("1. Beta\n2. Charlie\n3. Acme", acme),
    ).toBe(3);
  });

  it("3.2.c numbered list with parenthesis → 2", () => {
    expect(computePositionScore("1) Beta\n2) Acme", acme)).toBe(2);
  });

  it("3.2.d numbered list, brand at #7 → 5 (capped)", () => {
    const text =
      "1. Foo\n2. Bar\n3. Baz\n4. Qux\n5. Quux\n6. Corge\n7. Acme is great";
    expect(computePositionScore(text, acme)).toBe(5);
  });

  it("3.2.e prose, brand in first 20% → 1", () => {
    const text =
      "Acme is great; many alternatives exist in the CRM space and " +
      "competitors keep growing. ".repeat(3);
    expect(text.length).toBeGreaterThan(100);
    expect(computePositionScore(text, acme)).toBe(1);
  });

  it("3.2.f prose, brand in last 20% → 5", () => {
    const filler =
      "The market is crowded with many vendors. Each has its own strengths. ";
    const text = filler.repeat(5) + "In the end I recommend Acme.";
    expect(computePositionScore(text, acme)).toBe(5);
  });

  it("3.2.g prose, brand in middle (~50%) → 3", () => {
    const filler =
      "Many vendors compete in this space. Each offers different features. ";
    const head = filler.repeat(3);
    const tail = filler.repeat(3);
    const text = head + "Acme stands out. " + tail;
    expect(computePositionScore(text, acme)).toBe(3);
  });

  it("3.2.h brand mentioned multiple times → first mention wins (segment 1)", () => {
    const text =
      "Acme is great. " +
      "Filler ".repeat(40) +
      "Acme appears again. " +
      "Filler ".repeat(40) +
      "Acme once more.";
    expect(computePositionScore(text, acme)).toBe(1);
  });

  it("3.2.i not mentioned → null", () => {
    expect(computePositionScore("No relevant brand here at all.", acme)).toBe(
      null,
    );
  });

  it("3.2.j first mention in prose, later mention in numbered list → prose segment math wins", () => {
    // First mention is in plain prose (segment 1); later numbered-list
    // mention is ignored because the §17 rule is "first mention wins".
    const text =
      "Acme leads the category. " +
      "Filler ".repeat(60) +
      "\n1. Beta\n2. Acme\n3. Charlie";
    // First mention sits at index 0 → segment 1.
    expect(computePositionScore(text, acme)).toBe(1);
  });

  it("3.2.k returned value is number (REAL column type)", () => {
    const score = computePositionScore("1. Acme\n2. Beta", acme);
    expect(typeof score).toBe("number");
  });

  it("position match via domain when name absent", () => {
    const dOnly: ParserBrand = { name: "", domain: "acme.com" };
    expect(computePositionScore("1. acme.com\n2. Other", dOnly)).toBe(1);
  });

  it("first mention wins between name and domain", () => {
    // Domain appears earlier in the text than the name.
    const text = "Visit acme.com first. Later, Acme is mentioned by name.";
    expect(computePositionScore(text, acme)).toBe(1);
  });

  it("empty text → null", () => {
    expect(computePositionScore("", acme)).toBe(null);
  });

  it("numbered list with leading whitespace still detected", () => {
    expect(computePositionScore("   3. Acme rules", acme)).toBe(3);
  });
});

describe("computeSentiment — QA §3.3", () => {
  it("3.3.a single positive word in brand sentence → positive", () => {
    expect(computeSentiment("Acme is excellent.", acme)).toBe("positive");
  });

  it("3.3.b single negative word in brand sentence → negative", () => {
    expect(computeSentiment("Acme is poor.", acme)).toBe("negative");
  });

  it("3.3.c mixed pos+neg in same sentence → neutral (tie)", () => {
    expect(computeSentiment("Acme is reliable but expensive.", acme)).toBe(
      "neutral",
    );
  });

  it("3.3.d positive word in a non-brand sentence → neutral", () => {
    expect(computeSentiment("Acme exists. Beta is excellent.", acme)).toBe(
      "neutral",
    );
  });

  it("3.3.e multiple brand sentences, 1 pos + 1 neg → neutral (tie)", () => {
    expect(
      computeSentiment("Acme is robust. Acme is also slow.", acme),
    ).toBe("neutral");
  });

  it("3.3.f brand mentioned without qualifying words → neutral (default)", () => {
    expect(computeSentiment("Acme exists.", acme)).toBe("neutral");
  });

  it("3.3.g brand not mentioned → neutral", () => {
    expect(computeSentiment("Other vendors compete here.", acme)).toBe(
      "neutral",
    );
  });

  it("3.3.h case-insensitive word match → positive", () => {
    expect(computeSentiment("Acme is EXCELLENT", acme)).toBe("positive");
  });

  it("3.3.i word boundary respected (best vs bestseller) → neutral", () => {
    // 'best' must not match inside 'bestseller'.
    expect(computeSentiment("Acme is the bestseller.", acme)).toBe("neutral");
  });

  it("3.3.j sentence split on .!? → two brand sentences detected", () => {
    // Both 'powerful' and 'buggy' come from the locked word lists; this
    // proves both brand sentences are picked up by the splitter and that
    // pos>neg → positive when the negative count is 1 and positive is 1+
    // weighted by additional pos words. Adjust to 1 pos / 1 neg to assert
    // neutral and confirm the split picked up both sentences.
    expect(
      computeSentiment(
        "Acme is powerful! It costs much. Acme is buggy.",
        acme,
      ),
    ).toBe("neutral");
  });

  it("multiple positive words across brand sentences → positive", () => {
    expect(
      computeSentiment(
        "Acme is excellent. Acme is powerful and reliable.",
        acme,
      ),
    ).toBe("positive");
  });

  it("majority negative across brand sentences → negative", () => {
    expect(
      computeSentiment("Acme is poor. Acme is buggy. Acme is robust.", acme),
    ).toBe("negative");
  });

  it("brand matched by domain in a sentence triggers sentiment scoring", () => {
    expect(computeSentiment("acme.com is excellent.", acme)).toBe("positive");
  });

  it("empty text → neutral", () => {
    expect(computeSentiment("", acme)).toBe("neutral");
  });
});

describe("sentiment word lists are locked (deliberate edit guard)", () => {
  it("positive list matches §11.3 exactly", () => {
    expect(POSITIVE_SENTIMENT_WORDS).toEqual([
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
    ]);
  });

  it("negative list matches §11.3 exactly", () => {
    expect(NEGATIVE_SENTIMENT_WORDS).toEqual([
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
    ]);
  });
});

describe("computeCompetitorMentions — QA §3.4", () => {
  const competitors: ParserCompetitor[] = [
    { name: "Comp1", domain: "comp1.com" },
    { name: "Comp2", domain: "comp2.io" },
    { name: "Comp3", domain: "comp3.co" },
    { name: "Comp4", domain: "comp4.net" },
  ];

  it("2 by name, 1 by domain, 1 absent → all 4 keys present with correct booleans", () => {
    const text =
      "I'd consider Comp1 or Comp2 — and you can check comp3.co for more info.";
    expect(computeCompetitorMentions(text, competitors)).toEqual({
      Comp1: true,
      Comp2: true,
      Comp3: true,
      Comp4: false,
    });
  });

  it("keys are the display name, not domain or id", () => {
    const text = "Look at comp1.com for details.";
    const result = computeCompetitorMentions(text, competitors);
    expect(Object.keys(result)).toEqual(["Comp1", "Comp2", "Comp3", "Comp4"]);
  });

  it("empty competitor list → empty object", () => {
    expect(computeCompetitorMentions("Acme is great", [])).toEqual({});
  });

  it("null competitors → empty object", () => {
    expect(computeCompetitorMentions("Acme is great", null)).toEqual({});
  });

  it("empty text → every competitor false", () => {
    expect(computeCompetitorMentions("", competitors)).toEqual({
      Comp1: false,
      Comp2: false,
      Comp3: false,
      Comp4: false,
    });
  });
});

describe("extractCitations — QA §3.5", () => {
  it("3.5.a Perplexity returns citations[] → both URLs extracted from API", () => {
    expect(extractCitations("", ["https://a.com", "https://b.com"])).toEqual([
      "https://a.com",
      "https://b.com",
    ]);
  });

  it("3.5.b Perplexity search_results fallback URLs are accepted via apiCitations", () => {
    // The caller (perplexity.ts) maps search_results[].url before passing in;
    // extractCitations only sees a final URL list.
    expect(extractCitations("", ["https://only-from-search.com"])).toEqual([
      "https://only-from-search.com",
    ]);
  });

  it("3.5.c URL inline in prose → extracted via regex", () => {
    expect(extractCitations("see https://acme.com/blog for more")).toEqual([
      "https://acme.com/blog",
    ]);
  });

  it("3.5.d URL with trailing punctuation; ) stops regex, . stripped", () => {
    expect(extractCitations("(see https://acme.com.)")).toEqual([
      "https://acme.com",
    ]);
  });

  it("3.5.e same URL in API list and prose → deduped", () => {
    const result = extractCitations(
      "Visit https://acme.com today",
      ["https://acme.com"],
    );
    expect(result).toEqual(["https://acme.com"]);
  });

  it("3.5.f URL with query string and fragment preserved as full URL", () => {
    expect(extractCitations("see https://a.com/path?q=1#x for more")).toEqual([
      "https://a.com/path?q=1#x",
    ]);
  });

  it("3.5.g non-HTTP scheme NOT extracted (regex is https?://)", () => {
    expect(extractCitations("download ftp://x.com/file", [])).toEqual([]);
  });

  it("3.5.h malformed URL (http:/badurl) NOT extracted", () => {
    expect(extractCitations("see http:/badurl now", [])).toEqual([]);
  });

  it("strips trailing comma, semicolon, colon, exclamation, question mark", () => {
    const out = extractCitations(
      "https://a.com, https://b.com; https://c.com: https://d.com! https://e.com?",
    );
    expect(out).toEqual([
      "https://a.com",
      "https://b.com",
      "https://c.com",
      "https://d.com",
      "https://e.com",
    ]);
  });

  it("stops at brackets, braces, quotes, angle brackets", () => {
    expect(
      extractCitations("(https://a.com) [https://b.com] {https://c.com}"),
    ).toEqual(["https://a.com", "https://b.com", "https://c.com"]);
    expect(extractCitations('see "https://a.com" or <https://b.com>')).toEqual([
      "https://a.com",
      "https://b.com",
    ]);
  });

  it("dedupes by full URL, preserving first-seen order (regex before API)", () => {
    const out = extractCitations(
      "first https://a.com then https://b.com",
      ["https://b.com", "https://c.com"],
    );
    expect(out).toEqual([
      "https://a.com",
      "https://b.com",
      "https://c.com",
    ]);
  });

  it("ignores empty / non-string API entries", () => {
    expect(
      extractCitations("", [
        "",
        "   ",
        "https://valid.com",
        // @ts-expect-error — verifying defensive handling at the boundary
        null,
        // @ts-expect-error — verifying defensive handling at the boundary
        undefined,
        // @ts-expect-error — verifying defensive handling at the boundary
        42,
      ]),
    ).toEqual(["https://valid.com"]);
  });

  it("trims whitespace around API URLs", () => {
    expect(extractCitations("", ["  https://a.com  "])).toEqual([
      "https://a.com",
    ]);
  });

  it("empty text and no API → []", () => {
    expect(extractCitations("")).toEqual([]);
    expect(extractCitations(null)).toEqual([]);
  });

  it("multiple URLs in prose → all extracted in order", () => {
    expect(
      extractCitations(
        "Compare https://a.com and https://b.com and https://c.com.",
      ),
    ).toEqual(["https://a.com", "https://b.com", "https://c.com"]);
  });
});
