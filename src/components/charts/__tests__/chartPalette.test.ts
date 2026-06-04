import { describe, expect, it } from 'vitest';
import {
  AREA_FILL_OPACITY,
  BRAND_CHART_COLOR,
  BRAND_OPACITY,
  BRAND_STROKE_WIDTH,
  COMPETITOR_OPACITY,
  COMPETITOR_PALETTE,
  COMPETITOR_STROKE_WIDTH,
  SOURCE_CHART_MAX_DOMAINS,
  competitorColor,
  seriesStyleFor,
  sourceSeriesStyle,
} from '@/lib/chartPalette';

describe('chartPalette constants', () => {
  it('matches the spec §16 brand styling', () => {
    expect(BRAND_CHART_COLOR).toBe('#2eb88a');
    expect(BRAND_STROKE_WIDTH).toBe(2);
    expect(BRAND_OPACITY).toBe(1);
  });

  it('matches the spec §16 competitor styling', () => {
    expect(COMPETITOR_STROKE_WIDTH).toBe(1.5);
    expect(COMPETITOR_OPACITY).toBe(0.6);
  });

  it('source chart fill opacity matches build plan', () => {
    expect(AREA_FILL_OPACITY).toBeCloseTo(0.06);
  });

  it('caps the source chart at 5 domains', () => {
    expect(SOURCE_CHART_MAX_DOMAINS).toBe(5);
  });

  it('exposes the §16 competitor palette in order', () => {
    expect([...COMPETITOR_PALETTE]).toEqual([
      '#e5484d',
      '#3b82f6',
      '#f5a623',
      '#8b5cf6',
      '#ec4899',
      '#06b6d4',
    ]);
  });
});

describe('competitorColor', () => {
  it('returns palette colors by index', () => {
    expect(competitorColor(0)).toBe('#e5484d');
    expect(competitorColor(1)).toBe('#3b82f6');
    expect(competitorColor(5)).toBe('#06b6d4');
  });

  it('wraps when index exceeds palette length', () => {
    expect(competitorColor(6)).toBe('#e5484d');
    expect(competitorColor(7)).toBe('#3b82f6');
    expect(competitorColor(12)).toBe('#e5484d');
  });

  it('defends against negative or non-finite indexes', () => {
    expect(competitorColor(-1)).toBe('#e5484d');
    expect(competitorColor(Number.NaN)).toBe('#e5484d');
  });
});

describe('seriesStyleFor', () => {
  const competitors = ['Beta', 'Gamma', 'Delta'];

  it('returns brand styling for the literal "brand" dataKey', () => {
    expect(seriesStyleFor('brand', competitors)).toEqual({
      color: '#2eb88a',
      strokeWidth: 2,
      opacity: 1,
    });
  });

  it('returns competitor styling at the competitor index', () => {
    expect(seriesStyleFor('Beta', competitors)).toEqual({
      color: '#e5484d',
      strokeWidth: 1.5,
      opacity: 0.6,
    });
    expect(seriesStyleFor('Gamma', competitors)).toEqual({
      color: '#3b82f6',
      strokeWidth: 1.5,
      opacity: 0.6,
    });
    expect(seriesStyleFor('Delta', competitors)).toEqual({
      color: '#f5a623',
      strokeWidth: 1.5,
      opacity: 0.6,
    });
  });

  it('falls back to the first competitor color for unknown keys', () => {
    expect(seriesStyleFor('Mystery', competitors).color).toBe('#e5484d');
  });
});

describe('sourceSeriesStyle', () => {
  it('uses competitor styling for source areas', () => {
    expect(sourceSeriesStyle(0)).toEqual({
      color: '#e5484d',
      strokeWidth: 1.5,
      opacity: 0.6,
    });
    expect(sourceSeriesStyle(4)).toEqual({
      color: '#ec4899',
      strokeWidth: 1.5,
      opacity: 0.6,
    });
  });
});
