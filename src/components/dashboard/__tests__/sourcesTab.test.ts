import { describe, expect, it } from 'vitest';
import {
  DOMAIN_TYPE_COLOR,
  domainTypeColor,
} from '../DomainTypesPanel';
import { SOURCES_EMPTY_MESSAGE } from '../SourcesTable';
import type { DomainType } from '@/types';

describe('domainTypeColor', () => {
  it('returns the §16 color for every known domain type', () => {
    const expected: Record<DomainType, string> = {
      Corporate: '#f5a623',
      UGC: '#3b82f6',
      You: '#2eb88a',
      Competitor: '#e5484d',
      Reference: '#8b5cf6',
      Other: '#525259',
      Editorial: '#6366f1',
      Institutional: '#14b8a6',
    };
    for (const [type, color] of Object.entries(expected) as [DomainType, string][]) {
      expect(domainTypeColor(type)).toBe(color);
      expect(DOMAIN_TYPE_COLOR[type]).toBe(color);
    }
  });

  it('falls back to the Other color for unknown types', () => {
    expect(domainTypeColor('Unknown' as DomainType)).toBe(DOMAIN_TYPE_COLOR.Other);
  });
});

describe('SOURCES_EMPTY_MESSAGE', () => {
  it('matches the copy required by spec §15 / QA 12.6.d', () => {
    expect(SOURCES_EMPTY_MESSAGE).toBe(
      'No sources retrieved for this model in the selected window.',
    );
  });
});
