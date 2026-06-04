'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { SourceChart } from '@/components/charts/SourceChart';
import { Toggle, type ToggleOption } from '@/components/ui';
import type { SourcesResponse, SourcesView } from '@/types';

import { DomainTypesPanel } from './DomainTypesPanel';
import { SourcesTable, SOURCES_EMPTY_MESSAGE } from './SourcesTable';
import { useFilters } from './useFilters';

const VIEW_OPTIONS: ToggleOption<SourcesView>[] = [
  { value: 'domains', label: 'Domains' },
  { value: 'urls', label: 'URLs' },
];

function parseView(raw: string | null | undefined): SourcesView {
  return raw === 'urls' ? 'urls' : 'domains';
}

export interface SourcesTabProps {
  /** Initial data from the server; client refetches on filter/view change. */
  initialData?: SourcesResponse | null;
}

export function SourcesTab({ initialData = null }: SourcesTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { days, model } = useFilters();

  const view = useMemo(
    () => parseView(searchParams.get('view')),
    [searchParams],
  );

  const [data, setData] = useState<SourcesResponse | null>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setView = useCallback(
    (next: SourcesView) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (next === 'domains') sp.delete('view');
      else sp.set('view', next);
      const qs = sp.toString();
      router.replace(qs.length > 0 ? `${pathname}?${qs}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const sp = new URLSearchParams();
        sp.set('days', String(days));
        if (model !== 'all') sp.set('model', model);
        if (view === 'urls') sp.set('view', 'urls');
        const res = await fetch(`/api/sources?${sp.toString()}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error(`Request failed (${res.status})`);
        }
        const body = (await res.json()) as SourcesResponse;
        if (!cancelled) setData(body);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load sources');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [days, model, view]);

  const sources = data?.sources ?? [];
  const domainTypes = data?.domainTypes ?? [];
  const trend = data?.trend ?? [];

  return (
    <div className="flex flex-col gap-6" data-testid="sources-tab">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Sources</h1>
          <p className="text-[12px] text-muted-foreground">
            Domains and URLs cited across AI answers in the selected window.
          </p>
        </div>
        <Toggle<SourcesView>
          options={VIEW_OPTIONS}
          value={view}
          onChange={setView}
          aria-label="Source view"
          data-testid="sources-view-toggle"
        />
      </div>

      <div
        data-testid="sources-chart-card"
        className="rounded-lg border border-border/40 bg-card/60 p-5"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
            Source Retrieval
          </h2>
          {loading && data ? (
            <span className="text-[10px] text-muted-foreground/60">Updating…</span>
          ) : null}
        </div>
        <SourceChart data={trend} height={240} />
      </div>

      {error ? (
        <div
          role="alert"
          data-testid="sources-error"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-[12px] text-destructive"
        >
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SourcesTable
            rows={sources}
            view={view}
            emptyMessage={SOURCES_EMPTY_MESSAGE}
          />
        </div>
        <div>
          <DomainTypesPanel rows={domainTypes} />
        </div>
      </div>
    </div>
  );
}

export default SourcesTab;
