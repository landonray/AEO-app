import { describe, it, expect } from 'vitest';
import { normalizeOnboardingUrl } from '../Step1Url';

describe('normalizeOnboardingUrl', () => {
  it('returns null for empty/whitespace input', () => {
    expect(normalizeOnboardingUrl('')).toBeNull();
    expect(normalizeOnboardingUrl('   ')).toBeNull();
  });

  it('passes through valid https URLs', () => {
    const out = normalizeOnboardingUrl('https://example.com');
    expect(out).toMatch(/^https:\/\/example\.com\/?$/);
  });

  it('passes through valid http URLs', () => {
    const out = normalizeOnboardingUrl('http://example.com');
    expect(out).toMatch(/^http:\/\/example\.com\/?$/);
  });

  it('prepends https:// to bare domains', () => {
    const out = normalizeOnboardingUrl('example.com');
    expect(out).toMatch(/^https:\/\/example\.com\/?$/);
  });

  it('handles subdomains', () => {
    const out = normalizeOnboardingUrl('blog.example.com');
    expect(out).toMatch(/^https:\/\/blog\.example\.com\/?$/);
  });

  it('rejects non-http(s) protocols', () => {
    expect(normalizeOnboardingUrl('ftp://example.com')).toBeNull();
    expect(normalizeOnboardingUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeOnboardingUrl('file:///etc/passwd')).toBeNull();
  });

  it('rejects bare text without a TLD', () => {
    expect(normalizeOnboardingUrl('not-a-url')).toBeNull();
    expect(normalizeOnboardingUrl('hello world')).toBeNull();
  });

  it('rejects malformed input that has a slashed prefix but no host', () => {
    expect(normalizeOnboardingUrl('https://')).toBeNull();
  });

  it('trims surrounding whitespace before validating', () => {
    const out = normalizeOnboardingUrl('   example.com   ');
    expect(out).toMatch(/^https:\/\/example\.com\/?$/);
  });

  it('keeps paths intact on bare domain input', () => {
    const out = normalizeOnboardingUrl('example.com/pricing');
    expect(out).toMatch(/^https:\/\/example\.com\/pricing$/);
  });
});
