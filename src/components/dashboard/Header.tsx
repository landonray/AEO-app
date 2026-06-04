'use client';

import { type ReactNode, useEffect, useState } from 'react';
import { cn, relativeTime } from '@/lib/utils';
import { Dropdown, MODEL_META, MODEL_ORDER, type DropdownOption } from '@/components/ui';
import type { ModelFilter, ModelShortId } from '@/types';
import {
  DAYS_OPTIONS,
  MODEL_OPTIONS,
  useFilters,
  type FilterDays,
} from './useFilters';

export interface HeaderProps {
  brandName: string;
  lastUpdated: string | null;
  /** Override for the rendered "last updated" string. Used by tests for determinism. */
  lastUpdatedLabel?: string;
  /** Optional right-side slot (e.g. an action button). */
  rightSlot?: ReactNode;
}

const DAYS_LABEL: Record<FilterDays, string> = {
  7: '7 days',
  30: '30 days',
  90: '90 days',
  365: '365 days',
};

const MODEL_LABEL: Record<ModelFilter, string> = {
  all: 'All Models',
  openai: 'ChatGPT',
  claude: 'Claude',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
  google_aio: 'AI Overview',
};

const DAYS_DROPDOWN_OPTIONS: DropdownOption<string>[] = DAYS_OPTIONS.map((d) => ({
  value: String(d),
  label: DAYS_LABEL[d],
}));

const MODEL_DROPDOWN_OPTIONS: DropdownOption<ModelFilter>[] = MODEL_OPTIONS.map((m) => ({
  value: m,
  label: MODEL_LABEL[m],
  dotColor: m === 'all' ? undefined : MODEL_META[m as ModelShortId].color,
}));

function ModelStatusPill({
  model,
  dimmed,
}: {
  model: ModelShortId;
  dimmed: boolean;
}) {
  const meta = MODEL_META[model];
  return (
    <span
      data-testid={`model-pill-${model}`}
      data-dimmed={dimmed || undefined}
      className={cn(
        'inline-flex h-5 items-center rounded px-1.5 text-[10px] font-semibold uppercase tracking-wider tabular-nums transition-opacity duration-150',
        dimmed && 'opacity-30',
      )}
      style={{
        color: meta.color,
        backgroundColor: `${meta.color}1f`,
      }}
      aria-label={`${meta.displayName} status`}
    >
      {meta.label}
    </span>
  );
}

export function Header({
  brandName,
  lastUpdated,
  lastUpdatedLabel,
  rightSlot,
}: HeaderProps) {
  const { days, model, setDays, setModel } = useFilters();

  // Relative time depends on the current clock, which advances between the
  // server render and client hydration ("9 seconds ago" vs "10 seconds ago").
  // Track a client-side "now" that starts null so the first client render
  // matches the server, then recompute after mount and tick every 30s so the
  // label stays accurate.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const relative = lastUpdatedLabel ?? relativeTime(lastUpdated, now ?? undefined);

  return (
    <header
      data-testid="dashboard-header"
      className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-border/40 bg-background/85 px-6 backdrop-blur"
    >
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
        <span className="text-[13px] font-semibold text-foreground">{brandName}</span>
      </div>

      <div className="flex items-center gap-2">
        <Dropdown
          options={DAYS_DROPDOWN_OPTIONS}
          value={String(days)}
          onChange={(v) => setDays(Number(v) as FilterDays)}
          label="Range:"
          aria-label="Date range"
        />
        <Dropdown<ModelFilter>
          options={MODEL_DROPDOWN_OPTIONS}
          value={model}
          onChange={(v) => setModel(v)}
          label="Model:"
          aria-label="Model filter"
        />
      </div>

      <div className="ml-auto flex items-center gap-4">
        <span
          data-testid="last-updated"
          className="text-[11px] text-muted-foreground tabular-nums"
          suppressHydrationWarning
        >
          Last updated {relative}
        </span>
        <div
          data-testid="model-status-pills"
          className="flex items-center gap-1"
          aria-label="Model status"
        >
          {MODEL_ORDER.map((m) => (
            <ModelStatusPill
              key={m}
              model={m}
              dimmed={model !== 'all' && model !== m}
            />
          ))}
        </div>
        {rightSlot}
      </div>
    </header>
  );
}
