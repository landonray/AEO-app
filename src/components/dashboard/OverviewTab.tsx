import { VisibilityChart } from '@/components/charts/VisibilityChart';
import { cn } from '@/lib/utils';
import type { OverviewResponse } from '@/types';

import { ActionCards } from './ActionCards';
import { AISearchImpact } from './AISearchImpact';
import { MetricCards } from './MetricCards';
import { RankingsTable } from './RankingsTable';
import { RecentChats } from './RecentChats';
import { SourcesSummary } from './SourcesSummary';

export interface OverviewTabProps {
  data: OverviewResponse;
  className?: string;
}

export function OverviewTab({ data, className }: OverviewTabProps) {
  const competitorNames = data.competitors.map((c) => c.name);

  return (
    <div
      data-testid="overview-tab"
      className={cn('flex flex-col gap-6', className)}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <MetricCards metrics={data.metrics} />
        <section
          data-testid="visibility-chart-wrapper"
          className="rounded-lg border border-border/40 bg-card/60 p-5"
          aria-label="Visibility trend"
        >
          <header className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <h3 className="text-[13px] font-semibold text-foreground">Visibility Trend</h3>
              <p className="text-[11px] text-muted-foreground">
                Weekly brand visibility vs competitors.
              </p>
            </div>
          </header>
          <VisibilityChart
            data={data.trend}
            competitors={competitorNames}
            brandLabel={data.brand.name}
            height={260}
          />
        </section>
      </div>

      <RankingsTable rankings={data.rankings} />

      <AISearchImpact
        competitiveRank={data.metrics.competitiveRank}
        visibility={data.metrics.visibility}
        totalCitations={data.metrics.totalCitations}
        keyInsight={data.keyInsight}
      />

      <ActionCards actions={data.actions} />

      <SourcesSummary sources={data.sources} domainTypes={data.domainTypes} />

      <RecentChats chats={data.recentChats} />
    </div>
  );
}
