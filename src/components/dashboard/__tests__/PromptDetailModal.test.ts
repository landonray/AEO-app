import { describe, expect, it } from 'vitest';
import { buildDetailUrl, isResponseTruncated } from '../PromptDetailModal';

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

describe('isResponseTruncated', () => {
  it('is true when the full response is longer than the preview', () => {
    expect(
      isResponseTruncated({
        latestResponsePreview: 'x'.repeat(300),
        latestResponseFull: 'x'.repeat(500),
      }),
    ).toBe(true);
  });

  it('is false when the full response equals the preview (short response)', () => {
    expect(
      isResponseTruncated({
        latestResponsePreview: 'short answer',
        latestResponseFull: 'short answer',
      }),
    ).toBe(false);
  });

  it('is false when there is no response at all', () => {
    expect(
      isResponseTruncated({
        latestResponsePreview: '',
        latestResponseFull: '',
      }),
    ).toBe(false);
  });
});
