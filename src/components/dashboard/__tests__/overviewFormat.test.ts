import { describe, expect, it } from 'vitest';
import {
  EM_DASH,
  changeDirection,
  domainTypeColor,
  formatPercentInt,
  formatPosition,
  formatSentimentScore,
  formatShortDate,
  formatVisibilityChangePoints,
  sentimentDotColor,
  sentimentLabelDotColor,
  truncatePromptText,
} from '../overviewFormat';

describe('formatSentimentScore', () => {
  it('renders the em-dash when sentiment is null (§13.4 — no mentioned runs)', () => {
    expect(formatSentimentScore(null)).toBe(EM_DASH);
    expect(formatSentimentScore(undefined)).toBe(EM_DASH);
    expect(formatSentimentScore(Number.NaN)).toBe(EM_DASH);
  });

  it('NEVER renders the default neutral score (55) when the value is null', () => {
    expect(formatSentimentScore(null)).not.toBe('55');
  });

  it('rounds a numeric score to an integer', () => {
    expect(formatSentimentScore(72.4)).toBe('72');
    expect(formatSentimentScore(72.6)).toBe('73');
    expect(formatSentimentScore(0)).toBe('0');
    expect(formatSentimentScore(100)).toBe('100');
  });
});

describe('formatPosition', () => {
  it('returns "—" for null/undefined/NaN (§15.A.4)', () => {
    expect(formatPosition(null)).toBe(EM_DASH);
    expect(formatPosition(undefined)).toBe(EM_DASH);
    expect(formatPosition(Number.NaN)).toBe(EM_DASH);
  });

  it('formats as "#X.X"', () => {
    expect(formatPosition(1)).toBe('#1.0');
    expect(formatPosition(2.5)).toBe('#2.5');
    expect(formatPosition(4.95)).toBe('#5.0');
  });
});

describe('formatPercentInt', () => {
  it('returns "—" for null/undefined/NaN', () => {
    expect(formatPercentInt(null)).toBe(EM_DASH);
    expect(formatPercentInt(undefined)).toBe(EM_DASH);
    expect(formatPercentInt(Number.NaN)).toBe(EM_DASH);
  });

  it('renders integer percentages', () => {
    expect(formatPercentInt(0)).toBe('0%');
    expect(formatPercentInt(0.5)).toBe('50%');
    expect(formatPercentInt(1)).toBe('100%');
    expect(formatPercentInt(0.234)).toBe('23%');
  });
});

describe('formatVisibilityChangePoints', () => {
  it('returns "—" when change is null', () => {
    expect(formatVisibilityChangePoints(null)).toBe(EM_DASH);
    expect(formatVisibilityChangePoints(undefined)).toBe(EM_DASH);
  });

  it('renders a signed percentage-point delta', () => {
    expect(formatVisibilityChangePoints(0)).toBe('0pp');
    expect(formatVisibilityChangePoints(0.05)).toBe('+5pp');
    expect(formatVisibilityChangePoints(-0.03)).toBe('-3pp');
  });
});

describe('changeDirection', () => {
  it('classifies the delta direction', () => {
    expect(changeDirection(null)).toBe('none');
    expect(changeDirection(undefined)).toBe('none');
    expect(changeDirection(Number.NaN)).toBe('none');
    expect(changeDirection(0)).toBe('flat');
    expect(changeDirection(0.01)).toBe('up');
    expect(changeDirection(-0.01)).toBe('down');
  });
});

describe('sentimentDotColor', () => {
  it('returns the muted gray and "none" label when score is null (§12.3.e)', () => {
    expect(sentimentDotColor(null).label).toBe('none');
    expect(sentimentDotColor(undefined).label).toBe('none');
    expect(sentimentDotColor(Number.NaN).label).toBe('none');
    expect(sentimentDotColor(null).color).toBe('#525259');
  });

  it('classifies positive / neutral / negative bands', () => {
    expect(sentimentDotColor(80).label).toBe('positive');
    expect(sentimentDotColor(55).label).toBe('neutral');
    expect(sentimentDotColor(30).label).toBe('negative');
  });
});

describe('sentimentLabelDotColor', () => {
  it('maps each sentiment label to its color', () => {
    expect(sentimentLabelDotColor('positive')).toBe('#30a46c');
    expect(sentimentLabelDotColor('neutral')).toBe('#8b8b92');
    expect(sentimentLabelDotColor('negative')).toBe('#e5484d');
    expect(sentimentLabelDotColor(null)).toBe('#525259');
  });
});

describe('domainTypeColor', () => {
  it('returns the §16 color for every domain type', () => {
    expect(domainTypeColor('Corporate')).toBe('#f5a623');
    expect(domainTypeColor('UGC')).toBe('#3b82f6');
    expect(domainTypeColor('You')).toBe('#2eb88a');
    expect(domainTypeColor('Competitor')).toBe('#e5484d');
    expect(domainTypeColor('Reference')).toBe('#8b5cf6');
    expect(domainTypeColor('Other')).toBe('#525259');
    expect(domainTypeColor('Editorial')).toBe('#6366f1');
    expect(domainTypeColor('Institutional')).toBe('#14b8a6');
  });
});

describe('truncatePromptText', () => {
  it('returns the original text when short enough', () => {
    expect(truncatePromptText('hello world', 20)).toBe('hello world');
  });

  it('truncates with an ellipsis when over the max', () => {
    const out = truncatePromptText('a'.repeat(50), 10);
    expect(out.length).toBe(10);
    expect(out.endsWith('…')).toBe(true);
  });

  it('handles empty input', () => {
    expect(truncatePromptText('')).toBe('');
  });
});

describe('formatShortDate', () => {
  it('returns "—" for null/undefined/empty', () => {
    expect(formatShortDate(null)).toBe(EM_DASH);
    expect(formatShortDate(undefined)).toBe(EM_DASH);
    expect(formatShortDate('')).toBe(EM_DASH);
  });

  it('formats a valid ISO date as "MMM D"', () => {
    const result = formatShortDate('2025-11-17T10:00:00Z');
    expect(result).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
  });
});
