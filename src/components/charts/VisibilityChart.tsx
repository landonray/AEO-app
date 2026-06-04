'use client';

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  CHART_GRID_STROKE,
  seriesStyleFor,
} from '@/lib/chartPalette';
import { cn } from '@/lib/utils';
import type { TrendRow } from '@/types';

import {
  buildVisibilitySeries,
  formatDayLabel,
  isEmptyTrend,
} from './chartSeries';

export interface VisibilityChartProps {
  data: TrendRow[];
  competitors: string[];
  brandLabel?: string;
  height?: number;
  className?: string;
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

function VisibilityEmptyState({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex h-full min-h-[200px] w-full items-center justify-center rounded-md border border-dashed border-border/40 bg-white/[0.01] p-6 text-center text-[12px] text-muted-foreground',
        className,
      )}
      role="status"
    >
      No visibility data for the selected window yet.
    </div>
  );
}

export function VisibilityChart({
  data,
  competitors,
  brandLabel = 'You',
  height = 280,
  className,
}: VisibilityChartProps) {
  if (isEmptyTrend(data)) {
    return (
      <div className={cn('w-full', className)} style={{ height }}>
        <VisibilityEmptyState />
      </div>
    );
  }

  const series = buildVisibilitySeries(competitors);
  const chartData = data.map((row) => ({
    ...row,
    dateLabel: formatDayLabel(row.date),
  }));

  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke={CHART_GRID_STROKE} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="dateLabel"
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
          {series.map((s) => {
            const style = seriesStyleFor(s.dataKey, competitors);
            return (
              <Line
                key={s.dataKey}
                type="monotone"
                dataKey={s.dataKey}
                name={s.isBrand ? brandLabel : s.dataKey}
                stroke={style.color}
                strokeOpacity={style.opacity}
                strokeWidth={style.strokeWidth}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default VisibilityChart;
