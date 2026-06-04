import { describe, expect, it } from 'vitest';
import { buildSuggestions } from '../AddPromptForm';

describe('buildSuggestions', () => {
  it('returns the spec base topics merged with existing ones (deduped)', () => {
    const out = buildSuggestions('', ['Core', 'New Topic']);
    expect(out).toContain('Category');
    expect(out).toContain('Competitor');
    expect(out).toContain('Affiliate');
    expect(out).toContain('Core');
    expect(out).toContain('Free tool');
    expect(out).toContain('New Topic');
    // No duplicate "Core"
    expect(out.filter((t) => t.toLowerCase() === 'core')).toHaveLength(1);
  });

  it('filters by case-insensitive substring of the input', () => {
    const out = buildSuggestions('co', ['Custom Topic']);
    expect(out).toContain('Core');
    expect(out).toContain('Competitor');
    expect(out).not.toContain('Affiliate');
    expect(out).not.toContain('Free tool');
  });

  it('handles whitespace input as no filter', () => {
    const out = buildSuggestions('   ', []);
    expect(out.length).toBeGreaterThanOrEqual(5);
  });

  it('returns empty when no suggestion matches the query', () => {
    expect(buildSuggestions('xyzz', [])).toEqual([]);
  });

  it('ignores blank topics in the existing list', () => {
    const out = buildSuggestions('', ['', '   ', 'Real']);
    expect(out).toContain('Real');
    expect(out.every((t) => t.trim().length > 0)).toBe(true);
  });
});
