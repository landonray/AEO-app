// Pure formatters and color resolvers shared by Overview tab subcomponents.
// Kept separate from the React modules so they can be unit-tested under the
// project's node-only vitest config.

import type { DomainType, Sentiment } from '@/types';

export const EM_DASH = '—';

// Sentiment dot color per the spec narrative (positive = success teal,
// neutral = muted gray, negative = destructive red). Used by every surface
// that shows a sentiment dot (Rankings, Recent Chats, Prompt Detail).
export function sentimentDotColor(
  score: number | null | undefined,
): { color: string; label: 'positive' | 'neutral' | 'negative' | 'none' } {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return { color: '#525259', label: 'none' };
  }
  if (score >= 65) return { color: '#30a46c', label: 'positive' };
  if (score >= 45) return { color: '#8b8b92', label: 'neutral' };
  return { color: '#e5484d', label: 'negative' };
}

export function sentimentLabelDotColor(label: Sentiment | null | undefined): string {
  if (label === 'positive') return '#30a46c';
  if (label === 'negative') return '#e5484d';
  if (label === 'neutral') return '#8b8b92';
  return '#525259';
}

// Format avg sentiment 0..100 as integer per §15.A.3.
// Returns "—" when the value is null so we never accidentally render "55".
export function formatSentimentScore(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score)) return EM_DASH;
  return String(Math.round(score));
}

// Format avg position 1..5 as "#X.X" per §15.A.4 / §15.C.
// Returns "—" when the value is null.
export function formatPosition(position: number | null | undefined): string {
  if (position === null || position === undefined || Number.isNaN(position)) return EM_DASH;
  return `#${position.toFixed(1)}`;
}

// Format a visibility/SOV fraction as an integer percent.
// Returns "—" for null/NaN so the table never renders "NaN%".
export function formatPercentInt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EM_DASH;
  return `${Math.round(value * 100)}%`;
}

// Format the visibility change delta as a signed percentage-point delta
// ("+5pp" / "-3pp"). Returns "—" for null.
export function formatVisibilityChangePoints(
  change: number | null | undefined,
): string {
  if (change === null || change === undefined || Number.isNaN(change)) return EM_DASH;
  const pp = change * 100;
  const sign = pp > 0 ? '+' : '';
  return `${sign}${pp.toFixed(0)}pp`;
}

export function changeDirection(
  change: number | null | undefined,
): 'up' | 'down' | 'flat' | 'none' {
  if (change === null || change === undefined || Number.isNaN(change)) return 'none';
  if (change > 0) return 'up';
  if (change < 0) return 'down';
  return 'flat';
}

// Format a date string as "MMM D" (e.g. "Nov 17") for Recent Chats footers.
// Falls back to the original string when parsing fails.
export function formatShortDate(input: string | null | undefined): string {
  if (!input) return EM_DASH;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return String(input);
  const month = d.toLocaleString('en-US', { month: 'short' });
  return `${month} ${d.getDate()}`;
}

// Domain type → §16 color. Used by the Sources Summary right column and
// (via Chunk 28's SourcesTable) by the left column too.
const DOMAIN_TYPE_COLORS: Record<DomainType, string> = {
  Corporate: '#f5a623',
  UGC: '#3b82f6',
  You: '#2eb88a',
  Competitor: '#e5484d',
  Reference: '#8b5cf6',
  Other: '#525259',
  Editorial: '#6366f1',
  Institutional: '#14b8a6',
};

export function domainTypeColor(type: DomainType): string {
  return DOMAIN_TYPE_COLORS[type] ?? '#525259';
}

// Truncate a prompt text to N characters with an ellipsis for Recent Chats.
export function truncatePromptText(text: string, max = 120): string {
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
