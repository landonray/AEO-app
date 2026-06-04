'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ModelFilter } from '@/types';

export type FilterDays = 7 | 30 | 90 | 365;

export interface DashboardFilters {
  days: FilterDays;
  model: ModelFilter;
}

export const DEFAULT_DAYS: FilterDays = 7;
export const DEFAULT_MODEL: ModelFilter = 'all';

export const DAYS_OPTIONS: FilterDays[] = [7, 30, 90, 365];
export const MODEL_OPTIONS: ModelFilter[] = [
  'all',
  'openai',
  'claude',
  'gemini',
  'perplexity',
  'google_aio',
];

export function parseDays(raw: string | null | undefined): FilterDays {
  if (!raw) return DEFAULT_DAYS;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_DAYS;
  if ((DAYS_OPTIONS as number[]).includes(n)) return n as FilterDays;
  return DEFAULT_DAYS;
}

export function parseModel(raw: string | null | undefined): ModelFilter {
  if (!raw) return DEFAULT_MODEL;
  if ((MODEL_OPTIONS as string[]).includes(raw)) return raw as ModelFilter;
  return DEFAULT_MODEL;
}

export interface ReadableSearchParams {
  get(name: string): string | null;
}

export function parseFiltersFromParams(params: ReadableSearchParams): DashboardFilters {
  return {
    days: parseDays(params.get('days')),
    model: parseModel(params.get('model')),
  };
}

export function buildFilterQuery(filters: DashboardFilters): string {
  const sp = new URLSearchParams();
  if (filters.days !== DEFAULT_DAYS) sp.set('days', String(filters.days));
  if (filters.model !== DEFAULT_MODEL) sp.set('model', filters.model);
  const qs = sp.toString();
  return qs.length > 0 ? `?${qs}` : '';
}

export interface UseFiltersResult {
  days: FilterDays;
  model: ModelFilter;
  setDays: (days: FilterDays) => void;
  setModel: (model: ModelFilter) => void;
  setFilters: (next: Partial<DashboardFilters>) => void;
}

export function useFilters(): UseFiltersResult {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(
    () => parseFiltersFromParams(searchParams),
    [searchParams],
  );

  const apply = useCallback(
    (next: DashboardFilters) => {
      const query = buildFilterQuery(next);
      router.replace(`${pathname}${query}`, { scroll: false });
    },
    [router, pathname],
  );

  const setDays = useCallback(
    (days: FilterDays) => {
      apply({ ...filters, days });
    },
    [apply, filters],
  );

  const setModel = useCallback(
    (model: ModelFilter) => {
      apply({ ...filters, model });
    },
    [apply, filters],
  );

  const setFilters = useCallback(
    (next: Partial<DashboardFilters>) => {
      apply({ ...filters, ...next });
    },
    [apply, filters],
  );

  return {
    days: filters.days,
    model: filters.model,
    setDays,
    setModel,
    setFilters,
  };
}
