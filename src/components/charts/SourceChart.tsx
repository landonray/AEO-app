'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  AREA_FILL_OPACITY,
  CHART_GRID_STROKE,
  COMPETITOR_OPACITY,
  COMPETITOR_STROKE_WIDTH,
  sourceSeriesStyle,
} from '@/lib/chartPalette';
import { cn } from '@/lib/utils';
import type { TrendRow } from '@/types';

import {
  formatWeekLabel,
  isEmptyTrend,
  topSourceKeys,
} from './chartSeries';

export interface SourceChartProps {
  data: TrendRow[];
  // Optional explicit ordering; falls back to top-by-sum derivation if omitted.
  domains?: string[];
  maxDomains?: number;
  height?: number;
  className?: string;
  // Custom message for the empty state. Lets the Sources tab show the
  // "No sources retrieved for this model in the selected window." copy
  // from §15 without baking it into the component.
  emptyMessage?: string;
}

interface TooltipPayloadEntry {
  dataKey?: string | number;
  name?: string;
  value?: number | string;
  color?: string;
}

interface TooltipShape {
  active?: boolean;
  label?: string;
  payload?: TooltipPayloadEntry[];
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return `${Math.round(value * 100)}%`;
}

function ChartTooltip({ active, label, payload }: TooltipShape) {
  if (!active || !payload || payload.length === 0) return null;
  const rows = payload
    .map((entry) => ({
      key: String(entry.dataKey ?? entry.name ?? ''),
      name: String(entry.name ?? entry.dataKey ?? ''),
      value: typeof entry.value === 'number' ? entry.value : Number(entry.value),
      color: entry.color ?? '#8b8b92',
    }))
    .filter((row) => Number.isFinite(row.value))
    .sort((a, b) => b.value - a.value);

  if (rows.length === 0) return null;

  return (
    <div
      className="rounded-md border border-border/60 bg-card/95 px-3 py-2 text-[11px] shadow-xl backdrop-blur-sm"
      role="tooltip"
    >
      {label ? (
        <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground/60">
          {label}
        </div>
      ) : null}
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-foreground">
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: row.color }}
              />
              <span>{row.name}</span>
            </span>
            <span className="tabular-nums font-semibold" style={{ color: row.color }}>
              {formatPercent(row.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SourceEmptyState({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-full min-h-[200px] w-full items-center justify-center rounded-md border border-dashed border-border/40 bg-white/[0.01] p-6 text-center text-[12px] text-muted-foreground',
        className,
      )}
      role="status"
    >
      {message}
    </div>
  );
}

export function SourceChart({
  data,
  domains,
  maxDomains,
  height = 240,
  className,
  emptyMessage = 'No sources retrieved for this model in the selected window.',
}: SourceChartProps) {
  if (isEmptyTrend(data)) {
    return (
      <div className={cn('w-full', className)} style={{ height }}>
        <SourceEmptyState message={emptyMessage} />
      </div>
    );
  }

  const derivedKeys = domains && domains.length > 0 ? domains : topSourceKeys(data, maxDomains);

  if (derivedKeys.length === 0) {
    return (
      <div className={cn('w-full', className)} style={{ height }}>
        <SourceEmptyState message={emptyMessage} />
      </div>
    );
  }

  const chartData = data.map((row) => ({
    ...row,
    weekLabel: formatWeekLabel(row.weekStart),
  }));

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <defs>
            {derivedKeys.map((key, idx) => {
              const color = sourceSeriesStyle(idx).color;
              const gradientId = `sourceChartGradient-${idx}`;
              return (
                <linearGradient key={gradientId} id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={AREA_FILL_OPACITY} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              );
            })}
          </defs>
          <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="weekLabel"
            tick={{ fill: '#8b8b92', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: CHART_GRID_STROKE }}
          />
          <YAxis
            tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
            tick={{ fill: '#8b8b92', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: CHART_GRID_STROKE }}
            domain={[0, 'auto']}
          />
          <Tooltip
            cursor={{ stroke: CHART_GRID_STROKE, strokeDasharray: '3 3' }}
            content={<ChartTooltip />}
          />
          <Legend
            verticalAlign="bottom"
            align="center"
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, color: '#8b8b92', paddingTop: 8 }}
          />
          {derivedKeys.map((key, idx) => {
            const color = sourceSeriesStyle(idx).color;
            const gradientId = `sourceChartGradient-${idx}`;
            return (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                name={key}
                stroke={color}
                strokeOpacity={COMPETITOR_OPACITY}
                strokeWidth={COMPETITOR_STROKE_WIDTH}
                fill={`url(#${gradientId})`}
                fillOpacity={1}
                activeDot={{ r: 3, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default SourceChart;
