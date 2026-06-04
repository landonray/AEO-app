import { describe, expect, it } from 'vitest';
import {
  buildMetricsUrl,
  distinctTopics,
  filterByTopic,
  TOPIC_FILTER_ALL,
} from '../PromptsTab';

describe('buildMetricsUrl', () => {
  it('includes days and omits model when "all"', () => {
    expect(buildMetricsUrl(7, 'all')).toBe('/api/prompts/metrics?days=7');
  });

  it('includes model when not "all"', () => {
    expect(buildMetricsUrl(30, 'claude')).toBe(
      '/api/prompts/metrics?days=30&model=claude',
    );
  });

  it('omits model when empty', () => {
    expect(buildMetricsUrl(90, '')).toBe('/api/prompts/metrics?days=90');
  });
});

describe('distinctTopics', () => {
  it('returns sorted unique trimmed topics', () => {
    expect(
      distinctTopics([
        { topic: 'Core' },
        { topic: 'core' },
        { topic: 'Competitor' },
        { topic: '  Affiliate  ' },
        { topic: '' },
      ]),
    ).toEqual(['Affiliate', 'Competitor', 'Core']);
  });

  it('returns empty for empty input', () => {
    expect(distinctTopics([])).toEqual([]);
  });

  it('ignores empty / whitespace topics', () => {
    expect(distinctTopics([{ topic: '   ' }, { topic: '' }])).toEqual([]);
  });
});

describe('filterByTopic', () => {
  const rows = [
    { id: '1', topic: 'Core' },
    { id: '2', topic: 'Affiliate' },
    { id: '3', topic: 'Core' },
    { id: '4', topic: 'Competitor' },
  ];

  it('returns all rows when filter is "All"', () => {
    expect(filterByTopic(rows, TOPIC_FILTER_ALL)).toHaveLength(4);
  });

  it('returns all rows when filter is empty', () => {
    expect(filterByTopic(rows, '')).toHaveLength(4);
  });

  it('filters by exact (case-insensitive) topic', () => {
    expect(filterByTopic(rows, 'core').map((r) => r.id)).toEqual(['1', '3']);
    expect(filterByTopic(rows, 'Affiliate').map((r) => r.id)).toEqual(['2']);
  });

  it('returns empty when nothing matches', () => {
    expect(filterByTopic(rows, 'Free tool')).toEqual([]);
  });
});
