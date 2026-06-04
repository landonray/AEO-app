// Chart color palette per Refined Spec §16 "Chart colors".
// Used by Chunk 24 chart components (VisibilityChart, SourceChart) and by
// any downstream surfaces that need consistent brand/competitor coloring.

export const BRAND_CHART_COLOR = '#2eb88a';

// Brand series styling per §16 + §15.B.
export const BRAND_STROKE_WIDTH = 2;
export const BRAND_OPACITY = 1.0;

// Competitor series styling per §16 + §15.B.
export const COMPETITOR_STROKE_WIDTH = 1.5;
export const COMPETITOR_OPACITY = 0.6;

// AreaChart fill opacity per build plan §"Chunk 24" (Source chart spec).
export const AREA_FILL_OPACITY = 0.06;

// Ordered competitor palette per §16.
// The order matters: competitor 1 gets the first color, competitor 2 the
// second, and so on. When more than 6 competitors are supplied, the palette
// wraps via modulo so we never crash on an out-of-range index.
export const COMPETITOR_PALETTE: readonly string[] = [
  '#e5484d', // Competitor 1
  '#3b82f6', // Competitor 2
  '#f5a623', // Competitor 3
  '#8b5cf6', // Competitor 4
  '#ec4899', // Competitor 5
  '#06b6d4', // Competitor 6
];

// Dashed grid stroke per §15.B.
export const CHART_GRID_STROKE = '#1e1e22';

// Maximum domains shown in the Sources retrieval area chart per build plan.
export const SOURCE_CHART_MAX_DOMAINS = 5;

export interface SeriesStyle {
  color: string;
  strokeWidth: number;
  opacity: number;
}

// Pick a color for a competitor by zero-based index, wrapping the palette
// if more competitors are supplied than the palette defines.
export function competitorColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) return COMPETITOR_PALETTE[0]!;
  return COMPETITOR_PALETTE[index % COMPETITOR_PALETTE.length]!;
}

// Resolve series style for a given dataKey. `'brand'` is always the brand
// style; everything else uses the competitor style at its position in the
// `competitors` list. An unknown key (defensive) falls back to competitor 0.
export function seriesStyleFor(
  dataKey: string,
  competitors: readonly string[],
): SeriesStyle {
  if (dataKey === 'brand') {
    return {
      color: BRAND_CHART_COLOR,
      strokeWidth: BRAND_STROKE_WIDTH,
      opacity: BRAND_OPACITY,
    };
  }
  const idx = competitors.indexOf(dataKey);
  return {
    color: competitorColor(idx >= 0 ? idx : 0),
    strokeWidth: COMPETITOR_STROKE_WIDTH,
    opacity: COMPETITOR_OPACITY,
  };
}

// Source-chart series share the competitor styling: 1.5px stroke, 0.6
// opacity on the line, palette color by index. We expose this as its own
// helper so the AreaChart can build its <Area /> children deterministically.
export function sourceSeriesStyle(index: number): SeriesStyle {
  return {
    color: competitorColor(index),
    strokeWidth: COMPETITOR_STROKE_WIDTH,
    opacity: COMPETITOR_OPACITY,
  };
}
