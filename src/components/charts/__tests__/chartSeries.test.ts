import { describe, expect, it } from 'vitest';
import type { TrendRow } from '@/types';
import {
  buildVisibilitySeries,
  formatDayLabel,
  isEmptyTrend,
  topSourceKeys,
} from '../chartSeries';

describe('formatDayLabel', () => {
  it('formats ISO date as "MMM DD"', () => {
    expect(formatDayLabel('2025-11-17')).toBe('Nov 17');
    expect(formatDayLabel('2026-01-04')).toBe('Jan 04');
    expect(formatDayLabel('2026-06-01')).toBe('Jun 01');
  });

  it('returns the raw string when the date cannot be parsed', () => {
    expect(formatDayLabel('not-a-date')).toBe('not-a-date');
    expect(formatDayLabel('')).toBe('');
  });
});

describe('isEmptyTrend', () => {
  it('treats empty arrays and non-arrays as empty', () => {
    expect(isEmptyTrend([])).toBe(true);
    expect(isEmptyTrend(undefined)).toBe(true);
    expect(isEmptyTrend(null)).toBe(true);
  });

  it('treats arrays with rows as non-empty (even sparse days)', () => {
    const single: TrendRow[] = [{ date: '2026-06-01', brand: 0.1 }];
    expect(isEmptyTrend(single)).toBe(false);
  });
});

describe('buildVisibilitySeries', () => {
  it('always emits brand first', () => {
    const series = buildVisibilitySeries(['Beta', 'Gamma']);
    expect(series[0]).toEqual({ dataKey: 'brand', isBrand: true });
  });

  it('preserves competitor order from the input list', () => {
    const series = buildVisibilitySeries(['Beta', 'Gamma', 'Delta']);
    expect(series.slice(1).map((s) => s.dataKey)).toEqual(['Beta', 'Gamma', 'Delta']);
    expect(series.slice(1).every((s) => s.isBrand === false)).toBe(true);
  });

  it('drops empty / duplicate competitor names', () => {
    const series = buildVisibilitySeries(['Beta', '', 'Beta', 'Gamma']);
    expect(series.map((s) => s.dataKey)).toEqual(['brand', 'Beta', 'Gamma']);
  });

  it('returns only the brand series when no competitors are passed', () => {
    expect(buildVisibilitySeries([])).toEqual([{ dataKey: 'brand', isBrand: true }]);
  });
});

describe('topSourceKeys', () => {
  it('ranks keys by summed value and caps at the limit', () => {
    const data: TrendRow[] = [
      {
        date: '2026-05-17',
        brand: 0.1,
        a: 0.2,
        b: 0.5,
        c: 0.1,
        d: 0.05,
        e: 0.4,
        f: 0.3,
      },
      {
        date: '2026-05-24',
        brand: 0.2,
        a: 0.3,
        b: 0.6,
        c: 0.1,
        d: 0.05,
        e: 0.2,
        f: 0.4,
      },
    ];
    // SOURCE_CHART_MAX_DOMAINS = 5; top sums: b=1.1, f=0.7, e=0.6, a=0.5, brand=0.3.
    expect(topSourceKeys(data)).toEqual(['b', 'f', 'e', 'a', 'brand']);
  });

  it('breaks sum ties alphabetically for stability', () => {
    const data: TrendRow[] = [{ date: '2026-05-17', brand: 0, alpha: 0.5, beta: 0.5 }];
    expect(topSourceKeys(data, 2)).toEqual(['alpha', 'beta']);
  });

  it('ignores the date column and any non-numeric values', () => {
    const data: TrendRow[] = [
      { date: '2026-05-17', brand: 0, foo: 0.5 },
      { date: '2026-05-24', brand: 0, foo: 0.5, weird: 'oops' as unknown as number },
    ];
    // 'brand' totals 0 and is ranked below 'foo'; the helper does not special-case brand.
    expect(topSourceKeys(data).filter((k) => k !== 'brand')).toEqual(['foo']);
  });

  it('returns an empty list for empty input', () => {
    expect(topSourceKeys([])).toEqual([]);
  });

  it('respects a custom limit', () => {
    const data: TrendRow[] = [{ date: '2026-05-17', brand: 0, a: 0.4, b: 0.3, c: 0.2 }];
    expect(topSourceKeys(data, 2)).toEqual(['a', 'b']);
  });
});
