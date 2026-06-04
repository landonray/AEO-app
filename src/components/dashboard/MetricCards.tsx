import { Eye, MessageSquare, Smile, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OverviewMetrics } from '@/types';
import {
  EM_DASH,
  changeDirection,
  formatPercentInt,
  formatPosition,
  formatSentimentScore,
  formatVisibilityChangePoints,
} from './overviewFormat';

export interface MetricCardsProps {
  metrics: OverviewMetrics;
  className?: string;
}

interface CardProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  testId: string;
  change?: number | null;
}

function ChangeBadge({ change }: { change: number | null | undefined }) {
  const dir = changeDirection(change);
  if (dir === 'none') return null;
  const colorClass =
    dir === 'up' ? 'text-success' : dir === 'down' ? 'text-destructive' : 'text-muted-foreground';
  const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '→';
  return (
    <span
      data-testid="metric-change"
      data-direction={dir}
      className={cn('inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums', colorClass)}
    >
      <span aria-hidden="true">{arrow}</span>
      {formatVisibilityChangePoints(change)}
    </span>
  );
}

function MetricCard({ label, icon, value, testId, change }: CardProps) {
  return (
    <div
      data-testid={testId}
      className="rounded-lg border border-border/40 bg-card/60 p-5"
    >
      <div className="flex items-start justify-between">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
          {label}
        </span>
        <span aria-hidden="true" className="text-muted-foreground/50">
          {icon}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span
          data-testid={`${testId}-value`}
          className="text-[28px] font-semibold tabular-nums leading-none text-foreground"
        >
          {value}
        </span>
        {change !== undefined && <ChangeBadge change={change} />}
      </div>
      {change !== undefined && change !== null && !Number.isNaN(change) && (
        <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/50">
          vs prior
        </div>
      )}
    </div>
  );
}

export function MetricCards({ metrics, className }: MetricCardsProps) {
  const visibilityValue = formatPercentInt(metrics.visibility);
  const mentionedValue = `${metrics.mentioned} / ${metrics.totalRuns}`;
  const sentimentValue = formatSentimentScore(metrics.avgSentiment);
  const positionValue = formatPosition(metrics.avgPosition);

  return (
    <div
      data-testid="metric-cards"
      className={cn('flex w-[280px] flex-col gap-3', className)}
    >
      <MetricCard
        label="Visibility"
        icon={<Eye className="h-3.5 w-3.5" />}
        value={visibilityValue}
        testId="metric-visibility"
        change={metrics.visibilityChange}
      />
      <MetricCard
        label="Mentioned In"
        icon={<MessageSquare className="h-3.5 w-3.5" />}
        value={mentionedValue}
        testId="metric-mentioned"
      />
      <MetricCard
        label="Avg Sentiment"
        icon={<Smile className="h-3.5 w-3.5" />}
        value={sentimentValue}
        testId="metric-sentiment"
      />
      <MetricCard
        label="Avg Position"
        icon={<Hash className="h-3.5 w-3.5" />}
        value={positionValue}
        testId="metric-position"
      />
    </div>
  );
}

export { EM_DASH };
