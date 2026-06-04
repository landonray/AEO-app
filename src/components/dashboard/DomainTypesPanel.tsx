import { cn, formatPercent } from '@/lib/utils';
import type { DomainType, DomainTypeBreakdownRow } from '@/types';

// Domain type color palette per Refined Spec §16.
export const DOMAIN_TYPE_COLOR: Record<DomainType, string> = {
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
  return DOMAIN_TYPE_COLOR[type] ?? DOMAIN_TYPE_COLOR.Other;
}

export interface DomainTypesPanelProps {
  rows: ReadonlyArray<DomainTypeBreakdownRow>;
  className?: string;
  title?: string;
  emptyMessage?: string;
}

export function DomainTypesPanel({
  rows,
  className,
  title = 'Domain Types',
  emptyMessage = 'No domain types to show.',
}: DomainTypesPanelProps) {
  return (
    <div
      data-testid="domain-types-panel"
      className={cn(
        'rounded-lg border border-border/40 bg-card/60 p-5',
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
          {title}
        </h3>
      </div>
      {rows.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => {
            const color = domainTypeColor(row.type);
            const widthPct = Math.max(0, Math.min(100, row.percentage * 100));
            return (
              <li
                key={row.type}
                data-type={row.type}
                className="flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="flex items-center gap-2 text-foreground">
                    <span
                      aria-hidden
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span>{row.type}</span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatPercent(row.percentage)}
                  </span>
                </div>
                <div
                  className="h-1 w-full overflow-hidden rounded-full bg-white/[0.04]"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(widthPct)}
                  aria-label={`${row.type} share`}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${widthPct}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default DomainTypesPanel;
