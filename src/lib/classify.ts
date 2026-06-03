import { normalizeDomain } from '@/lib/utils';
import type { Brand, Competitor, DomainType } from '@/types';

const UGC_DOMAINS: readonly string[] = [
  'reddit.com',
  'youtube.com',
  'quora.com',
  'medium.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'g2.com',
  'capterra.com',
  'trustpilot.com',
  'getapp.com',
  'softwareadvice.com',
];

const EDITORIAL_DOMAINS: readonly string[] = [
  'techcrunch.com',
  'wired.com',
  'forbes.com',
  'bloomberg.com',
  'nytimes.com',
  'wsj.com',
  'theverge.com',
  'arstechnica.com',
  'businessinsider.com',
  'engadget.com',
  'vox.com',
];

const REFERENCE_DOMAINS: readonly string[] = [
  'wikipedia.org',
  'developer.mozilla.org',
];

const INSTITUTIONAL_TLDS: readonly string[] = ['.edu', '.gov', '.mil', '.org'];

function matchesApex(host: string, apex: string): boolean {
  if (!host || !apex) return false;
  return host === apex || host.endsWith('.' + apex);
}

function matchesAny(host: string, list: readonly string[]): boolean {
  for (const apex of list) {
    if (matchesApex(host, apex)) return true;
  }
  return false;
}

function hostnameFromUrl(url: string): string {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (!trimmed) return '';
  try {
    return normalizeDomain(new URL(trimmed).hostname);
  } catch {
    return normalizeDomain(trimmed);
  }
}

export function classify(
  url: string,
  brand: Pick<Brand, 'domain'> | null | undefined,
  competitors: ReadonlyArray<Pick<Competitor, 'domain'>> | null | undefined,
): DomainType {
  const host = hostnameFromUrl(url);
  if (!host) return 'Other';

  const brandApex = brand ? normalizeDomain(brand.domain) : '';
  if (brandApex && matchesApex(host, brandApex)) return 'You';

  if (competitors) {
    for (const c of competitors) {
      const apex = normalizeDomain(c.domain);
      if (apex && matchesApex(host, apex)) return 'Competitor';
    }
  }

  if (matchesAny(host, UGC_DOMAINS)) return 'UGC';
  if (matchesAny(host, EDITORIAL_DOMAINS)) return 'Editorial';
  if (matchesAny(host, REFERENCE_DOMAINS)) return 'Reference';

  for (const tld of INSTITUTIONAL_TLDS) {
    if (host.endsWith(tld)) return 'Institutional';
  }

  return 'Corporate';
}
