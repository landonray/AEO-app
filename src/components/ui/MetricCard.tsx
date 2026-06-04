import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface MetricCardProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  /**
   * Change vs prior window, expressed as a percentage point delta (e.g. 0.05 = +5%).
   * Positive renders teal up-arrow, negative red down-arrow, null/undefined hides.
   */
  change?: number | null;
  changeFractionDigits?: number;
  comparisonLabel?: string;
}

function formatChange(change: number, digits: number): string {
  const pct = change * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(digits)}%`;
}

export function MetricCard({
  label,
  value,
  icon,
  change,
  changeFractionDigits = 1,
  comparisonLabel = 'vs prior',
  className,
  ...props
}: MetricCardProps) {
  const hasChange = change !== null && change !== undefined && !Number.isNaN(change);
  const positive = hasChange && (change as number) > 0;
  const negative = hasChange && (change as number) < 0;

  return (
    <div
      className={cn(
        'rounded-lg border border-border/40 bg-card/60 p-5',
        className,
      )}
      {...props}
    >
      <div className="flex items-start justify-between">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
          {label}
        </span>
        {icon && (
          <span aria-hidden="true" className="text-muted-foreground/50">
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-[28px] font-semibold tabular-nums leading-none text-foreground">
          {value}
        </span>
        {hasChange && (
          <span
            data-direction={positive ? 'up' : negative ? 'down' : 'flat'}
            className={cn(
              'inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums',
              positive && 'text-success',
              negative && 'text-destructive',
              !positive && !negative && 'text-muted-foreground',
            )}
          >
            <span aria-hidden="true">
              {positive ? '↑' : negative ? '↓' : '→'}
            </span>
            {formatChange(change as number, changeFractionDigits)}
          </span>
        )}
      </div>
      {hasChange && (
        <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/50">
          {comparisonLabel}
        </div>
      )}
    </div>
  );
}
