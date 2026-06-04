'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Badge,
  Markdown,
  Modal,
  ModelIcon,
  MODEL_META,
  MODEL_ORDER,
  Spinner,
} from '@/components/ui';
import type {
  ModelBreakdownRow,
  ModelShortId,
  PromptDetailResponse,
  Sentiment,
} from '@/types';

export interface PromptDetailModalProps {
  open: boolean;
  promptId: string | null;
  /** Filter days currently selected in the dashboard. */
  days: number;
  /** Filter model currently selected ("all" or short id). */
  model: string;
  onClose: () => void;
  /** Override the fetch function (used by tests). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

const SENTIMENT_COLOR: Record<Sentiment, string> = {
  positive: '#2eb88a',
  neutral: '#8b8b92',
  negative: '#e5484d',
};

const SENTIMENT_SCORE: Record<Sentiment, number> = {
  positive: 80,
  neutral: 55,
  negative: 30,
};

const SENTIMENT_LABEL: Record<Sentiment, string> = {
  positive: 'Positive',
  neutral: 'Neutral',
  negative: 'Negative',
};

function formatPosition(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return `#${value.toFixed(1)}`;
}

export function buildDetailUrl(
  promptId: string,
  days: number,
  model: string,
): string {
  const sp = new URLSearchParams();
  sp.set('days', String(days));
  if (model && model !== 'all') sp.set('model', model);
  return `/api/prompts/${encodeURIComponent(promptId)}?${sp.toString()}`;
}

/**
 * True when the full response is longer than the 300-char preview, i.e. there
 * is genuinely more text to reveal behind a "See more" link.
 */
export function isResponseTruncated(
  row: Pick<ModelBreakdownRow, 'latestResponseFull' | 'latestResponsePreview'>,
): boolean {
  return row.latestResponseFull.length > row.latestResponsePreview.length;
}

function ModelCard({
  row,
  expanded,
  onToggle,
}: {
  row: ModelBreakdownRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const meta = MODEL_META[row.model];
  const noRun = row.mentioned === null;
  const mentioned = row.mentioned === true;
  const sentiment = row.sentiment;
  const dotColor = sentiment ? SENTIMENT_COLOR[sentiment] : '#525259';
  const sentimentScore = sentiment ? SENTIMENT_SCORE[sentiment] : null;
  const truncated = isResponseTruncated(row);
  const [showFull, setShowFull] = useState(false);

  // Collapse back to the preview whenever the whole card is collapsed, so a
  // freshly re-opened card always starts in the short state.
  useEffect(() => {
    if (!expanded) setShowFull(false);
  }, [expanded]);

  return (
    <div
      data-testid={`model-card-${row.model}`}
      data-mentioned={mentioned || undefined}
      data-norun={noRun || undefined}
      data-expanded={expanded || undefined}
      className={cn(
        'rounded-lg border p-4 transition-colors duration-150',
        mentioned
          ? 'border-success/20 bg-success/[0.03]'
          : 'border-border/40 bg-card/40',
        noRun && 'opacity-70',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={noRun}
        aria-expanded={expanded}
        aria-controls={`model-card-${row.model}-body`}
        className={cn(
          'flex w-full items-center justify-between gap-3 text-left',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60 rounded',
          noRun ? 'cursor-default' : 'cursor-pointer',
        )}
      >
        <div className="flex items-center gap-2">
          <ModelIcon model={row.model} size="md" />
          <span className="text-[13px] font-semibold text-foreground">
            {meta.displayName}
          </span>
          {noRun ? (
            <Badge variant="muted">No run in window</Badge>
          ) : mentioned ? (
            <Badge variant="success">Mentioned</Badge>
          ) : (
            <Badge variant="muted">Not mentioned</Badge>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] tabular-nums text-muted-foreground">
          <span
            className="inline-flex items-center gap-1"
            aria-label="Position"
          >
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
              Pos
            </span>
            <span className="text-foreground">
              {formatPosition(row.position)}
            </span>
          </span>
          <span
            className="inline-flex items-center gap-1.5"
            aria-label="Sentiment"
          >
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: dotColor }}
            />
            <span className="text-foreground">
              {sentimentScore !== null
                ? sentimentScore
                : noRun
                  ? '—'
                  : SENTIMENT_LABEL[sentiment ?? 'neutral']}
            </span>
          </span>
          <span
            className="inline-flex items-center gap-1"
            aria-label="Citations"
          >
            <Link2 aria-hidden="true" className="h-3 w-3" />
            <span className="text-foreground">{row.citationCount}</span>
          </span>
        </div>
      </button>
      {expanded && !noRun && (
        <div
          id={`model-card-${row.model}-body`}
          className="mt-3 border-t border-border/30 pt-3"
        >
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
            {showFull ? 'Latest response' : 'Latest response preview'}
          </div>
          {row.latestResponsePreview ? (
            <>
              <Markdown className="mt-2">
                {showFull
                  ? row.latestResponseFull
                  : `${row.latestResponsePreview}${truncated ? '…' : ''}`}
              </Markdown>
              {truncated && (
                <button
                  type="button"
                  onClick={() => setShowFull((v) => !v)}
                  className="mt-2 text-[12px] font-medium text-primary transition-colors duration-150 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60 rounded"
                >
                  {showFull ? 'See less' : 'See more'}
                </button>
              )}
            </>
          ) : (
            <p className="mt-2 text-[12px] italic text-muted-foreground/60">
              No response captured for the latest run.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function PromptDetailModal({
  open,
  promptId,
  days,
  model,
  onClose,
  fetchImpl,
}: PromptDetailModalProps) {
  const [data, setData] = useState<PromptDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ModelShortId | null>(null);

  useEffect(() => {
    if (!open || !promptId) {
      setData(null);
      setError(null);
      setExpanded(null);
      return;
    }
    const ctl = new AbortController();
    const f = fetchImpl ?? fetch;
    setLoading(true);
    setError(null);
    f(buildDetailUrl(promptId, days, model), { signal: ctl.signal })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to load prompt (${res.status})`);
        }
        const body = (await res.json()) as PromptDetailResponse;
        setData(body);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string } | null)?.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load prompt');
      })
      .finally(() => {
        setLoading(false);
      });
    return () => ctl.abort();
  }, [open, promptId, days, model, fetchImpl]);

  const toggle = useCallback((m: ModelShortId) => {
    setExpanded((prev) => (prev === m ? null : m));
  }, []);

  const breakdown: ModelBreakdownRow[] =
    data?.modelBreakdown ??
    MODEL_ORDER.map((m) => ({
      model: m,
      mentioned: null,
      position: null,
      sentiment: null,
      citationCount: 0,
      latestResponsePreview: '',
      latestResponseFull: '',
    }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      label="PROMPT DETAIL"
      title={data?.prompt.text ?? (loading ? 'Loading prompt…' : '')}
      maxWidthClass="max-w-3xl"
      className="max-h-[70vh]"
    >
      <section data-testid="prompt-detail-body">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
          Per-Model Breakdown
        </div>

        {error && (
          <div
            role="alert"
            className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-[12px] text-destructive"
          >
            {error}
          </div>
        )}

        {loading && !data ? (
          <div className="mt-4 flex items-center gap-2 text-[12px] text-muted-foreground">
            <Spinner size="sm" />
            Loading…
          </div>
        ) : (
          <div
            data-testid="model-breakdown-grid"
            className="mt-3 flex flex-col gap-2"
          >
            {breakdown.map((row) => (
              <ModelCard
                key={row.model}
                row={row}
                expanded={expanded === row.model}
                onToggle={() => toggle(row.model)}
              />
            ))}
          </div>
        )}
      </section>
    </Modal>
  );
}
