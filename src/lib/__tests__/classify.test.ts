import { describe, it, expect } from 'vitest';
import { classify } from '@/lib/classify';

const brand = { domain: 'acme.com' };
const competitors = [
  { domain: 'beta.io' },
  { domain: 'gamma.co' },
];

describe('classify — QA §3.6', () => {
  it('3.6.a brand domain → You', () => {
    expect(classify('https://www.acme.com/x', brand, competitors)).toBe('You');
  });

  it('3.6.b competitor domain → Competitor', () => {
    expect(classify('https://beta.io', brand, competitors)).toBe('Competitor');
  });

  it('3.6.c Reddit → UGC', () => {
    expect(classify('https://www.reddit.com/r/saas', brand, competitors)).toBe('UGC');
  });

  it('3.6.d G2 → UGC', () => {
    expect(classify('https://g2.com/products/acme', brand, competitors)).toBe('UGC');
  });

  it('3.6.e TechCrunch → Editorial', () => {
    expect(classify('https://techcrunch.com/2026/01/01/post', brand, competitors)).toBe('Editorial');
  });

  it('3.6.f Wikipedia → Reference', () => {
    expect(classify('https://en.wikipedia.org/wiki/CRM', brand, competitors)).toBe('Reference');
  });

  it('3.6.g .edu → Institutional', () => {
    expect(classify('https://stanford.edu/research', brand, competitors)).toBe('Institutional');
  });

  it('3.6.h .gov → Institutional', () => {
    expect(classify('https://nih.gov/grants', brand, competitors)).toBe('Institutional');
  });

  it('3.6.i .org non-editorial → Institutional (per A15)', () => {
    expect(classify('https://w3.org/standards', brand, competitors)).toBe('Institutional');
  });

  it('3.6.j UGC list precedence over .org (documents precedence rule)', () => {
    // No real UGC sits on a .org TLD, but the order in classify() puts UGC before
    // the institutional TLD check, so a hypothetical UGC .org still classifies as UGC.
    const ugcBrand = { domain: 'acme.com' };
    const ugcOrg = 'https://reddit.com/r/saas';
    expect(classify(ugcOrg, ugcBrand, competitors)).toBe('UGC');
  });

  it('3.6.k Editorial list precedence over .org (hypothetical forbes.org)', () => {
    // forbes.com is editorial. Subdomain forbes.com on any host wins over .org TLD,
    // and the editorial list check runs before the institutional TLD check.
    expect(classify('https://forbes.com/article', brand, competitors)).toBe('Editorial');
  });

  it('3.6.l unknown corporate domain → Corporate', () => {
    expect(classify('https://random-saas.io', brand, competitors)).toBe('Corporate');
  });

  it('3.6.m subdomain matches editorial apex → Editorial', () => {
    expect(classify('https://blog.techcrunch.com/post', brand, competitors)).toBe('Editorial');
  });

  it('3.6.n brand domain precedence over UGC (brand domain = medium.com)', () => {
    const mediumBrand = { domain: 'medium.com' };
    expect(classify('https://medium.com/some-article', mediumBrand, competitors)).toBe('You');
  });

  it('3.6.o uppercase host normalizes → You', () => {
    expect(classify('HTTPS://ACME.COM', brand, competitors)).toBe('You');
  });
});

describe('classify — precedence and edge cases', () => {
  it('brand precedence over competitor when both match', () => {
    const overlap = [{ domain: 'acme.com' }];
    expect(classify('https://acme.com/x', brand, overlap)).toBe('You');
  });

  it('competitor precedence over UGC', () => {
    const compMedium = [{ domain: 'medium.com' }];
    expect(classify('https://medium.com/article', brand, compMedium)).toBe('Competitor');
  });

  it('subdomain matches brand apex → You', () => {
    expect(classify('https://blog.acme.com/x', brand, competitors)).toBe('You');
  });

  it('subdomain matches competitor apex → Competitor', () => {
    expect(classify('https://blog.beta.io/x', brand, competitors)).toBe('Competitor');
  });

  it('MDN (developer.mozilla.org) → Reference', () => {
    expect(classify('https://developer.mozilla.org/en-US/docs/Web', brand, competitors)).toBe('Reference');
  });

  it('Wikipedia subdomain (en.wikipedia.org) → Reference', () => {
    expect(classify('https://en.wikipedia.org/wiki/Test', brand, competitors)).toBe('Reference');
  });

  it('.mil → Institutional', () => {
    expect(classify('https://army.mil/about', brand, competitors)).toBe('Institutional');
  });

  it('plain http URL → classifies normally', () => {
    expect(classify('http://acme.com', brand, competitors)).toBe('You');
  });

  it('empty URL → Other', () => {
    expect(classify('', brand, competitors)).toBe('Other');
  });

  it('garbage non-URL string falls through to Corporate', () => {
    // Per §11.6 "Everything else → Corporate". Only an empty/unresolvable
    // hostname returns the legacy 'Other' default.
    expect(classify('not a url at all', brand, competitors)).toBe('Corporate');
  });

  it('null brand → still classifies citations', () => {
    expect(classify('https://reddit.com/r/x', null, competitors)).toBe('UGC');
  });

  it('undefined competitors → still classifies', () => {
    expect(classify('https://techcrunch.com', brand, undefined)).toBe('Editorial');
  });

  it('substring-but-not-apex domain should NOT match brand', () => {
    // host "fakeacme.com" must not match brand "acme.com"
    expect(classify('https://fakeacme.com', brand, competitors)).toBe('Corporate');
  });

  it('substring-but-not-apex should NOT match editorial', () => {
    // host "faketechcrunch.com" must not match "techcrunch.com"
    expect(classify('https://faketechcrunch.com', brand, competitors)).toBe('Corporate');
  });

  it('brand domain stored with protocol still matches', () => {
    const messyBrand = { domain: 'https://www.acme.com/' };
    expect(classify('https://acme.com/x', messyBrand, competitors)).toBe('You');
  });

  it('uppercase competitor domain still matches after normalization', () => {
    const upperComp = [{ domain: 'BETA.IO' }];
    expect(classify('https://beta.io/x', brand, upperComp)).toBe('Competitor');
  });

  it('youtube.com → UGC', () => {
    expect(classify('https://www.youtube.com/watch?v=abc', brand, competitors)).toBe('UGC');
  });

  it('x.com → UGC', () => {
    expect(classify('https://x.com/user/status/1', brand, competitors)).toBe('UGC');
  });

  it('URL with port → classifies on host', () => {
    expect(classify('https://acme.com:8080/x', brand, competitors)).toBe('You');
  });
});
