// Pure helpers used by the chart components to derive series lists from
// the API row shape. Kept separate from the React components so they can be
// unit-tested in a node environment (the project's vitest config does not
// configure jsdom).

import { SOURCE_CHART_MAX_DOMAINS } from '@/lib/chartPalette';
import type { TrendRow } from '@/types';

// Format an ISO `YYYY-MM-DD` date as "MMM DD" (e.g. "Nov 17") per §15.B.
// Returns the original string if it cannot be parsed so we never break
// rendering for malformed data.
export function formatDayLabel(isoDate: string): string {
  if (!isoDate || typeof isoDate !== 'string') return String(isoDate ?? '');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!m) return isoDate;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, month, day));
  if (Number.isNaN(d.getTime())) return isoDate;
  const monthName = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const dayLabel = String(day).padStart(2, '0');
  return `${monthName} ${dayLabel}`;
}

// Compute the top-N source keys from a Sources retrieval trend by summing
// each (non-date) entity's values across all days. Used to cap the
// SourceChart at 5 domains per build plan.
export function topSourceKeys(
  data: ReadonlyArray<TrendRow>,
  limit: number = SOURCE_CHART_MAX_DOMAINS,
): string[] {
  if (!Array.isArray(data) || data.length === 0) return [];
  const totals = new Map<string, number>();
  for (const row of data) {
    for (const [key, value] of Object.entries(row)) {
      if (key === 'date') continue;
      if (typeof value !== 'number' || Number.isNaN(value)) continue;
      totals.set(key, (totals.get(key) ?? 0) + value);
    }
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, limit))
    .map(([key]) => key);
}

// True when the chart should fall back to the empty state instead of
// rendering Recharts. Used by both VisibilityChart and SourceChart.
export function isEmptyTrend(data: unknown): boolean {
  return !Array.isArray(data) || data.length === 0;
}

// Build the ordered series list for VisibilityChart: brand first (always),
// then each competitor in the order the caller passed (which preserves
// rank from §16's palette assignment). Competitors with no data in *any*
// row are still emitted — Recharts will simply draw nothing — so the
// legend stays stable as new days accumulate.
export interface VisibilitySeries {
  dataKey: string;
  isBrand: boolean;
}

export function buildVisibilitySeries(
  competitors: ReadonlyArray<string>,
): VisibilitySeries[] {
  const seen = new Set<string>(['brand']);
  const series: VisibilitySeries[] = [{ dataKey: 'brand', isBrand: true }];
  for (const name of competitors) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    series.push({ dataKey: name, isBrand: false });
  }
  return series;
}
