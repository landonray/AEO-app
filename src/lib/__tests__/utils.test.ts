import { describe, it, expect } from 'vitest';
import {
  cn,
  formatPercent,
  extractDomain,
  normalizeDomain,
  escapeRegex,
  relativeTime,
} from '@/lib/utils';

describe('cn', () => {
  it('joins simple class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('handles falsy values from clsx', () => {
    expect(cn('a', null, undefined, false, '', 'b')).toBe('a b');
  });

  it('handles arrays and objects via clsx', () => {
    expect(cn(['a', 'b'], { c: true, d: false })).toBe('a b c');
  });

  it('merges conflicting tailwind classes via tailwind-merge', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('returns empty string when given nothing usable', () => {
    expect(cn()).toBe('');
    expect(cn(null, undefined, false)).toBe('');
  });
});

describe('formatPercent', () => {
  it('formats a 0..1 float as a whole percent', () => {
    expect(formatPercent(0.55)).toBe('55%');
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(1)).toBe('100%');
  });

  it('rounds via toFixed', () => {
    expect(formatPercent(0.1234)).toBe('12%');
    expect(formatPercent(0.1234, 1)).toBe('12.3%');
    expect(formatPercent(0.1234, 2)).toBe('12.34%');
  });

  it('returns em-dash for null / undefined / NaN (per §13.4)', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(undefined)).toBe('—');
    expect(formatPercent(Number.NaN)).toBe('—');
  });

  it('handles negative deltas like visibilityChange', () => {
    expect(formatPercent(-0.05)).toBe('-5%');
  });
});

describe('extractDomain', () => {
  it('returns hostname for valid http/https URLs', () => {
    expect(extractDomain('https://acme.com/pricing')).toBe('acme.com');
    expect(extractDomain('http://blog.acme.com/posts/1')).toBe('blog.acme.com');
  });

  it('preserves www. (unlike normalizeDomain)', () => {
    expect(extractDomain('https://www.acme.com')).toBe('www.acme.com');
  });

  it('returns empty string for unparseable input', () => {
    expect(extractDomain('not a url')).toBe('');
    expect(extractDomain('')).toBe('');
    expect(extractDomain('acme.com')).toBe('');
  });

  it('handles ports and query strings', () => {
    expect(extractDomain('https://acme.com:8080/path?x=1')).toBe('acme.com');
  });
});

describe('normalizeDomain (QA §3.6 / Q9)', () => {
  it('lowercases input (QA 3.6.o)', () => {
    expect(normalizeDomain('ACME.COM')).toBe('acme.com');
    expect(normalizeDomain('HTTPS://ACME.COM')).toBe('acme.com');
  });

  it('strips http and https protocols', () => {
    expect(normalizeDomain('http://acme.com')).toBe('acme.com');
    expect(normalizeDomain('https://acme.com')).toBe('acme.com');
  });

  it('strips leading www.', () => {
    expect(normalizeDomain('www.acme.com')).toBe('acme.com');
    expect(normalizeDomain('https://www.acme.com')).toBe('acme.com');
  });

  it('strips path / query / fragment', () => {
    expect(normalizeDomain('https://acme.com/pricing')).toBe('acme.com');
    expect(normalizeDomain('https://acme.com/path?x=1#h')).toBe('acme.com');
    expect(normalizeDomain('acme.com/pricing')).toBe('acme.com');
  });

  it('strips ports', () => {
    expect(normalizeDomain('https://acme.com:8080/path')).toBe('acme.com');
    expect(normalizeDomain('acme.com:443')).toBe('acme.com');
  });

  it('preserves non-www subdomains (chunk 7 does apex extraction itself)', () => {
    expect(normalizeDomain('https://blog.acme.com/post')).toBe('blog.acme.com');
    expect(normalizeDomain('news.ycombinator.com')).toBe('news.ycombinator.com');
  });

  it('handles trailing whitespace and dots', () => {
    expect(normalizeDomain('  https://www.acme.com/  ')).toBe('acme.com');
    expect(normalizeDomain('acme.com.')).toBe('acme.com');
  });

  it('returns empty string for empty / nullish-ish input', () => {
    expect(normalizeDomain('')).toBe('');
    expect(normalizeDomain('   ')).toBe('');
  });

  it('handles user-info segments in URLs', () => {
    expect(normalizeDomain('https://user:pass@acme.com/path')).toBe('acme.com');
  });

  it('handles protocol-relative URLs', () => {
    expect(normalizeDomain('//www.acme.com/path')).toBe('acme.com');
  });
});

describe('escapeRegex (QA §3.1.i)', () => {
  it('escapes regex metacharacters in a brand name', () => {
    expect(escapeRegex('C++ Builder')).toBe('C\\+\\+ Builder');
  });

  it('escapes . in domains', () => {
    expect(escapeRegex('acme.com')).toBe('acme\\.com');
  });

  it('escapes a comprehensive metacharacter set', () => {
    expect(escapeRegex('.*+?^${}()|[]\\')).toBe(
      '\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\',
    );
  });

  it('escaped output, recompiled, matches the literal source', () => {
    const tricky = 'C++ Builder';
    const re = new RegExp(`\\b${escapeRegex(tricky)}\\b`, 'i');
    expect(re.test('I love C++ Builder for legacy projects.')).toBe(true);
    expect(re.test('I love Cxx Builder for legacy projects.')).toBe(false);
  });

  it('passes through plain alphanumeric strings unchanged', () => {
    expect(escapeRegex('Acme')).toBe('Acme');
    expect(escapeRegex('Acme123')).toBe('Acme123');
  });

  it('handles empty string', () => {
    expect(escapeRegex('')).toBe('');
  });
});

describe('relativeTime', () => {
  const now = new Date('2026-06-03T12:00:00.000Z');

  it('says "just now" for very recent times', () => {
    expect(relativeTime(new Date('2026-06-03T11:59:58.000Z').toISOString(), now)).toBe('just now');
  });

  it('handles minutes ago', () => {
    const out = relativeTime(new Date('2026-06-03T11:55:00.000Z').toISOString(), now);
    expect(out).toMatch(/5 minutes ago/);
  });

  it('handles hours ago', () => {
    const out = relativeTime(new Date('2026-06-03T09:00:00.000Z').toISOString(), now);
    expect(out).toMatch(/3 hours ago/);
  });

  it('handles days ago', () => {
    const out = relativeTime(new Date('2026-05-31T12:00:00.000Z').toISOString(), now);
    expect(out).toMatch(/3 days ago/);
  });

  it('handles weeks ago', () => {
    const out = relativeTime(new Date('2026-05-20T12:00:00.000Z').toISOString(), now);
    expect(out).toMatch(/2 weeks ago/);
  });

  it('returns "never" for null / undefined / empty / invalid input', () => {
    expect(relativeTime(null, now)).toBe('never');
    expect(relativeTime(undefined, now)).toBe('never');
    expect(relativeTime('', now)).toBe('never');
    expect(relativeTime('not-an-iso-string', now)).toBe('never');
  });

  it('accepts a Date object directly', () => {
    const out = relativeTime(new Date('2026-06-03T11:00:00.000Z'), now);
    expect(out).toMatch(/1 hour ago|hour ago/);
  });
});
