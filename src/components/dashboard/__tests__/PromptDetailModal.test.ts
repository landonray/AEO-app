import { describe, expect, it } from 'vitest';
import { buildDetailUrl } from '../PromptDetailModal';

describe('buildDetailUrl', () => {
  it('includes days and omits model when "all"', () => {
    expect(buildDetailUrl('abc-123', 7, 'all')).toBe(
      '/api/prompts/abc-123?days=7',
    );
  });

  it('includes model when not "all"', () => {
    expect(buildDetailUrl('abc-123', 30, 'claude')).toBe(
      '/api/prompts/abc-123?days=30&model=claude',
    );
  });

  it('URI-encodes the prompt id', () => {
    expect(buildDetailUrl('id with spaces', 90, 'openai')).toBe(
      '/api/prompts/id%20with%20spaces?days=90&model=openai',
    );
  });
});
