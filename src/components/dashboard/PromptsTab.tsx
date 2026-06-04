'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Archive, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Button,
  ModelIcon,
  MODEL_META,
  MODEL_ORDER,
  Spinner,
} from '@/components/ui';
import { useFilters } from './useFilters';
import { AddPromptForm } from './AddPromptForm';
import { PromptDetailModal } from './PromptDetailModal';
import type {
  ModelShortId,
  PromptMetricsRow,
  PromptsMetricsResponse,
} from '@/types';

export interface PromptsTabProps {
  /** Override fetch (tests). */
  fetchImpl?: typeof fetch;
}

export const TOPIC_FILTER_ALL = 'All';

export function buildMetricsUrl(days: number, model: string): string {
  const sp = new URLSearchParams();
  sp.set('days', String(days));
  if (model && model !== 'all') sp.set('model', model);
  return `/api/prompts/metrics?${sp.toString()}`;
}

export function distinctTopics(prompts: { topic: string }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of prompts) {
    const t = (p.topic ?? '').trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export function filterByTopic<T extends { topic: string }>(
  prompts: T[],
  topic: string,
): T[] {
  if (!topic || topic === TOPIC_FILTER_ALL) return prompts;
  const q = topic.trim().toLowerCase();
  return prompts.filter((p) => (p.topic ?? '').trim().toLowerCase() === q);
}

function formatVisibility(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `${Math.round(value * 100)}%`;
}

function formatPosition(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `#${value.toFixed(1)}`;
}

function sentimentColor(score: number | null): string {
  if (score === null) return '#525259';
  if (score >= 70) return '#2eb88a';
  if (score <= 40) return '#e5484d';
  return '#8b8b92';
}

function SentimentCell({ score }: { score: number | null }) {
  const color = sentimentColor(score);
  return (
    <span
      className="inline-flex items-center gap-1.5 tabular-nums"
      data-testid="sentiment-cell"
      data-empty={score === null || undefined}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className={score === null ? 'text-muted-foreground' : 'text-foreground'}>
        {score === null ? '—' : score}
      </span>
    </span>
  );
}

function ModelsCell({ models }: { models: ModelShortId[] }) {
  const active = new Set(models);
  return (
    <div className="inline-flex items-center gap-1">
      {MODEL_ORDER.map((m) => (
        <ModelIcon key={m} model={m} size="sm" dimmed={!active.has(m)} />
      ))}
    </div>
  );
}

type RowState = { running: boolean; archiving: boolean; faded: boolean };

interface PromptRowProps {
  row: PromptMetricsRow;
  state: RowState;
  onPlay: (id: string) => void;
  onArchive: (id: string) => void;
  onOpen: (id: string) => void;
}

function PromptRow({ row, state, onPlay, onArchive, onOpen }: PromptRowProps) {
  return (
    <tr
      data-testid="prompt-row"
      data-prompt-id={row.id}
      data-faded={state.faded || undefined}
      className={cn(
        'border-t border-border/30 transition-opacity duration-300 hover:bg-white/[0.015]',
        state.faded && 'opacity-30 pointer-events-none',
      )}
    >
      <td className="max-w-[400px] px-4 py-3">
        <button
          type="button"
          onClick={() => onOpen(row.id)}
          className="block w-full truncate text-left text-[13px] text-foreground hover:text-primary focus-visible:outline-none focus-visible:underline"
          title={row.text}
        >
          {row.text}
        </button>
        <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/60">
          {row.topic}
        </div>
      </td>
      <td className="px-4 py-3 text-[12px] tabular-nums">
        {formatVisibility(row.visibility)}
      </td>
      <td className="px-4 py-3 text-[12px]">
        <SentimentCell score={row.sentiment} />
      </td>
      <td className="px-4 py-3 text-[12px] tabular-nums">
        {formatPosition(row.position)}
      </td>
      <td className="px-4 py-3">
        <ModelsCell models={row.models} />
      </td>
      <td className="px-4 py-3">
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            data-testid="play-button"
            aria-label={`Run prompt: ${row.text.slice(0, 40)}`}
            onClick={() => onPlay(row.id)}
            disabled={state.running || state.archiving}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-white/[0.04] hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
          >
            {state.running ? (
              <Spinner size="sm" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            data-testid="archive-button"
            aria-label={`Archive prompt: ${row.text.slice(0, 40)}`}
            onClick={() => onArchive(row.id)}
            disabled={state.running || state.archiving}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-white/[0.04] hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
          >
            {state.archiving ? (
              <Spinner size="sm" />
            ) : (
              <Archive className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </td>
    </tr>
  );
}

function TopicFilterPills({
  options,
  active,
  onChange,
}: {
  options: string[];
  active: string;
  onChange: (next: string) => void;
}) {
  return (
    <div
      data-testid="topic-filter-pills"
      className="flex flex-wrap items-center gap-1.5"
      role="tablist"
      aria-label="Topic filter"
    >
      {options.map((opt) => {
        const isActive = active === opt;
        return (
          <button
            key={opt}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-active={isActive || undefined}
            onClick={() => onChange(opt)}
            className={cn(
              'inline-flex h-7 items-center rounded-md px-2.5 text-[12px] font-medium transition-colors duration-150',
              isActive
                ? 'bg-white/[0.08] text-foreground'
                : 'bg-white/[0.02] text-muted-foreground hover:bg-white/[0.04] hover:text-foreground',
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

export function PromptsTab({ fetchImpl }: PromptsTabProps) {
  const { days, model } = useFilters();
  const [rows, setRows] = useState<PromptMetricsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState<string>(TOPIC_FILTER_ALL);
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [openPromptId, setOpenPromptId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const fetchFn = fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined);

  useEffect(() => {
    if (!fetchFn) return;
    const ctl = new AbortController();
    setLoading(true);
    setError(null);
    fetchFn(buildMetricsUrl(days, model), { signal: ctl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load prompts (${res.status})`);
        const body = (await res.json()) as PromptsMetricsResponse;
        setRows(body.prompts ?? []);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string } | null)?.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load prompts');
      })
      .finally(() => setLoading(false));
    return () => ctl.abort();
  }, [days, model, reloadKey, fetchFn]);

  const topics = useMemo(() => distinctTopics(rows), [rows]);
  const topicOptions = useMemo(
    () => [TOPIC_FILTER_ALL, ...topics],
    [topics],
  );
  const visibleRows = useMemo(
    () => filterByTopic(rows, topic),
    [rows, topic],
  );

  const reload = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  const setRowState = useCallback(
    (id: string, patch: Partial<RowState>) => {
      setRowStates((prev) => ({
        ...prev,
        [id]: {
          running: prev[id]?.running ?? false,
          archiving: prev[id]?.archiving ?? false,
          faded: prev[id]?.faded ?? false,
          ...patch,
        },
      }));
    },
    [],
  );

  const handlePlay = useCallback(
    async (id: string) => {
      const current = rowStates[id];
      if (current?.running || current?.archiving) return;
      setRowState(id, { running: true });
      try {
        const f = fetchFn ?? fetch;
        const res = await f('/api/prompts/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ promptId: id }),
        });
        if (!res.ok) throw new Error(`Run failed (${res.status})`);
        reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Run failed');
      } finally {
        setRowState(id, { running: false });
      }
    },
    [rowStates, setRowState, fetchFn, reload],
  );

  const handleArchive = useCallback(
    async (id: string) => {
      const current = rowStates[id];
      if (current?.running || current?.archiving) return;
      setRowState(id, { archiving: true, faded: true });
      try {
        const f = fetchFn ?? fetch;
        const res = await f('/api/prompts', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
        if (!res.ok) throw new Error(`Archive failed (${res.status})`);
        reload();
      } catch (err) {
        setRowState(id, { archiving: false, faded: false });
        setError(err instanceof Error ? err.message : 'Archive failed');
      }
    },
    [rowStates, setRowState, fetchFn, reload],
  );

  let body: ReactNode;
  if (loading) {
    body = (
      <div className="flex items-center gap-2 px-4 py-8 text-[12px] text-muted-foreground">
        <Spinner size="sm" />
        Loading prompts…
      </div>
    );
  } else if (visibleRows.length === 0) {
    body = (
      <div className="px-4 py-8 text-center text-[12px] text-muted-foreground">
        {rows.length === 0
          ? 'No prompts yet. Add one above to start tracking.'
          : `No prompts under "${topic}".`}
      </div>
    );
  } else {
    body = (
      <table className="w-full border-collapse" data-testid="prompts-table">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground/40">
            <th className="px-4 py-2 font-medium">Prompt</th>
            <th className="px-4 py-2 font-medium">Visibility</th>
            <th className="px-4 py-2 font-medium">Sentiment</th>
            <th className="px-4 py-2 font-medium">Position</th>
            <th className="px-4 py-2 font-medium">Models</th>
            <th className="px-4 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => (
            <PromptRow
              key={row.id}
              row={row}
              state={
                rowStates[row.id] ?? { running: false, archiving: false, faded: false }
              }
              onPlay={handlePlay}
              onArchive={handleArchive}
              onOpen={(id) => setOpenPromptId(id)}
            />
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <section data-testid="prompts-tab" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Prompts</h1>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Track buyer-intent prompts across all five AI surfaces.
          </p>
        </div>
      </div>

      <AddPromptForm
        existingTopics={topics}
        onCreated={() => reload()}
        fetchImpl={fetchImpl}
      />

      <TopicFilterPills
        options={topicOptions}
        active={topic}
        onChange={setTopic}
      />

      {error && (
        <div
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-[12px] text-destructive"
        >
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border/40 bg-card/60">
        {body}
      </div>

      <PromptDetailModal
        open={openPromptId !== null}
        promptId={openPromptId}
        days={days}
        model={model}
        onClose={() => setOpenPromptId(null)}
        fetchImpl={fetchImpl}
      />
    </section>
  );
}
