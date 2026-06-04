import { cn } from '@/lib/utils';
import type { RankingsRow } from '@/types';
import {
  EM_DASH,
  changeDirection,
  formatPercentInt,
  formatPosition,
  formatSentimentScore,
  formatVisibilityChangePoints,
  sentimentDotColor,
} from './overviewFormat';

export interface RankingsTableProps {
  rankings: RankingsRow[];
  className?: string;
}

function initialsFor(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function VisibilityCell({
  value,
  change,
  isBrand,
}: {
  value: number;
  change: number | null;
  isBrand: boolean;
}) {
  const pct = Math.max(0, Math.min(1, value));
  const dir = changeDirection(change);
  const changeClass =
    dir === 'up'
      ? 'text-success'
      : dir === 'down'
        ? 'text-destructive'
        : 'text-muted-foreground';
  const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : dir === 'flat' ? '→' : '';
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1 w-14 overflow-hidden rounded-full bg-white/[0.05]">
        <div
          className={cn('absolute inset-y-0 left-0 rounded-full', isBrand ? 'bg-primary' : 'bg-muted-foreground/60')}
          style={{ width: `${pct * 100}%` }}
          aria-hidden
        />
      </div>
      <span className="tabular-nums text-[12px] font-medium text-foreground">
        {formatPercentInt(value)}
      </span>
      {dir !== 'none' && (
        <span
          data-direction={dir}
          className={cn('inline-flex items-center gap-0.5 text-[10px] tabular-nums', changeClass)}
        >
          <span aria-hidden>{arrow}</span>
          {formatVisibilityChangePoints(change)}
        </span>
      )}
    </div>
  );
}

function SentimentCell({ score }: { score: number | null }) {
  const { color, label } = sentimentDotColor(score);
  const display = formatSentimentScore(score);
  return (
    <span
      data-testid="sentiment-cell"
      data-sentiment={label}
      className="inline-flex items-center gap-1.5"
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="tabular-nums text-[12px] text-foreground">
        {display}
      </span>
    </span>
  );
}

export function RankingsTable({ rankings, className }: RankingsTableProps) {
  const sorted = [...rankings].sort((a, b) => b.visibility - a.visibility);

  if (sorted.length === 0) {
    return (
      <div
        data-testid="rankings-empty"
        className={cn(
          'flex h-full min-h-[160px] items-center justify-center rounded-lg border border-dashed border-border/40 bg-white/[0.01] p-6 text-center text-[12px] text-muted-foreground',
          className,
        )}
      >
        No rankings data for the selected window yet.
      </div>
    );
  }

  return (
    <div
      data-testid="rankings-table"
      className={cn('overflow-hidden rounded-lg border border-border/40 bg-card/60', className)}
    >
      <div className="px-5 pt-4 pb-2">
        <h3 className="text-[13px] font-semibold text-foreground">Rankings</h3>
        <p className="text-[11px] text-muted-foreground">
          You vs competitors over the selected window.
        </p>
      </div>
      <table className="w-full text-left text-[12px]">
        <thead>
          <tr className="border-b border-border/40 text-[10px] uppercase tracking-wider text-muted-foreground/40">
            <th className="px-5 py-2 font-normal">#</th>
            <th className="py-2 font-normal">Brand</th>
            <th className="py-2 font-normal">Visibility</th>
            <th className="py-2 font-normal">SOV</th>
            <th className="py-2 font-normal">Sentiment</th>
            <th className="px-5 py-2 text-right font-normal">Position</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, idx) => {
            const rank = idx + 1;
            const isBrand = row.isYou;
            return (
              <tr
                key={`${row.name}-${rank}`}
                data-testid={isBrand ? 'rankings-row-brand' : 'rankings-row-competitor'}
                data-is-brand={isBrand || undefined}
                className={cn(
                  'border-b border-border/20 last:border-b-0 transition-colors hover:bg-white/[0.015]',
                  isBrand && 'bg-primary/[0.03]',
                )}
              >
                <td className="px-5 py-3 tabular-nums text-muted-foreground/70">{rank}</td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold uppercase',
                        isBrand
                          ? 'bg-primary/15 text-primary'
                          : 'bg-white/[0.06] text-muted-foreground',
                      )}
                      aria-hidden
                    >
                      {initialsFor(row.name)}
                    </span>
                    <span
                      className={cn(
                        'font-medium',
                        isBrand ? 'text-primary' : 'text-foreground',
                      )}
                    >
                      {row.name}
                    </span>
                    {isBrand && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
                        You
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3">
                  <VisibilityCell
                    value={row.visibility}
                    change={row.visibilityChange}
                    isBrand={isBrand}
                  />
                </td>
                <td className="py-3 tabular-nums text-foreground">
                  {formatPercentInt(row.sov)}
                </td>
                <td className="py-3">
                  <SentimentCell score={row.sentiment} />
                </td>
                <td
                  className={cn(
                    'px-5 py-3 text-right tabular-nums',
                    isBrand ? 'text-primary' : 'text-foreground',
                  )}
                >
                  {row.position === null ? EM_DASH : formatPosition(row.position)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
