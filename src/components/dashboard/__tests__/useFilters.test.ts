import { describe, expect, it } from 'vitest';
import {
  buildFilterQuery,
  DEFAULT_DAYS,
  DEFAULT_MODEL,
  parseDays,
  parseFiltersFromParams,
  parseModel,
} from '../useFilters';

function makeParams(input: string): URLSearchParams {
  return new URLSearchParams(input);
}

describe('parseDays', () => {
  it('returns the default when missing or empty', () => {
    expect(parseDays(null)).toBe(DEFAULT_DAYS);
    expect(parseDays(undefined)).toBe(DEFAULT_DAYS);
    expect(parseDays('')).toBe(DEFAULT_DAYS);
  });

  it('accepts the four valid windows', () => {
    expect(parseDays('7')).toBe(7);
    expect(parseDays('30')).toBe(30);
    expect(parseDays('90')).toBe(90);
    expect(parseDays('365')).toBe(365);
  });

  it('falls back to the default for unknown or non-numeric values', () => {
    expect(parseDays('14')).toBe(DEFAULT_DAYS);
    expect(parseDays('abc')).toBe(DEFAULT_DAYS);
    expect(parseDays('-1')).toBe(DEFAULT_DAYS);
  });
});

describe('parseModel', () => {
  it('returns the default when missing', () => {
    expect(parseModel(null)).toBe(DEFAULT_MODEL);
    expect(parseModel(undefined)).toBe(DEFAULT_MODEL);
    expect(parseModel('')).toBe(DEFAULT_MODEL);
  });

  it('accepts all six valid filter values', () => {
    expect(parseModel('all')).toBe('all');
    expect(parseModel('openai')).toBe('openai');
    expect(parseModel('claude')).toBe('claude');
    expect(parseModel('gemini')).toBe('gemini');
    expect(parseModel('perplexity')).toBe('perplexity');
    expect(parseModel('google_aio')).toBe('google_aio');
  });

  it('falls back to the default for unknown values', () => {
    expect(parseModel('grok')).toBe(DEFAULT_MODEL);
    expect(parseModel('OpenAI')).toBe(DEFAULT_MODEL);
  });
});

describe('parseFiltersFromParams', () => {
  it('returns defaults when no params are present', () => {
    const filters = parseFiltersFromParams(makeParams(''));
    expect(filters).toEqual({ days: DEFAULT_DAYS, model: DEFAULT_MODEL });
  });

  it('reads days and model from search params', () => {
    const filters = parseFiltersFromParams(makeParams('days=30&model=claude'));
    expect(filters).toEqual({ days: 30, model: 'claude' });
  });

  it('treats invalid params as defaults', () => {
    const filters = parseFiltersFromParams(makeParams('days=999&model=grok'));
    expect(filters).toEqual({ days: DEFAULT_DAYS, model: DEFAULT_MODEL });
  });
});

describe('buildFilterQuery', () => {
  it('returns an empty string when both filters are the default', () => {
    expect(buildFilterQuery({ days: DEFAULT_DAYS, model: DEFAULT_MODEL })).toBe('');
  });

  it('only includes days when it is non-default', () => {
    expect(buildFilterQuery({ days: 30, model: DEFAULT_MODEL })).toBe('?days=30');
  });

  it('only includes model when it is non-default', () => {
    expect(buildFilterQuery({ days: DEFAULT_DAYS, model: 'claude' })).toBe('?model=claude');
  });

  it('includes both when both are non-default', () => {
    const q = buildFilterQuery({ days: 90, model: 'openai' });
    expect(q.startsWith('?')).toBe(true);
    const sp = new URLSearchParams(q.slice(1));
    expect(sp.get('days')).toBe('90');
    expect(sp.get('model')).toBe('openai');
  });

  it('round-trips through parseFiltersFromParams', () => {
    const original = { days: 90 as const, model: 'gemini' as const };
    const q = buildFilterQuery(original);
    const params = new URLSearchParams(q.replace(/^\?/, ''));
    expect(parseFiltersFromParams(params)).toEqual(original);
  });
});
