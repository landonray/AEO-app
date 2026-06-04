import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatPercent(n: number | null | undefined, fractionDigits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${(n * 100).toFixed(fractionDigits)}%`;
}

export function extractDomain(url: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function normalizeDomain(input: string): string {
  if (!input) return '';
  let s = String(input).trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  s = s.replace(/^\/\//, '');
  s = s.split('/')[0] ?? '';
  s = s.split('?')[0] ?? '';
  s = s.split('#')[0] ?? '';
  const atIdx = s.lastIndexOf('@');
  if (atIdx >= 0) s = s.slice(atIdx + 1);
  s = s.split(':')[0] ?? '';
  s = s.replace(/^www\./, '');
  s = s.replace(/\.+$/, '');
  return s;
}

export function escapeRegex(str: string): string {
  if (!str) return '';
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const RELATIVE_TIME_UNITS: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
  { unit: 'year', seconds: 365 * 24 * 60 * 60 },
  { unit: 'month', seconds: 30 * 24 * 60 * 60 },
  { unit: 'week', seconds: 7 * 24 * 60 * 60 },
  { unit: 'day', seconds: 24 * 60 * 60 },
  { unit: 'hour', seconds: 60 * 60 },
  { unit: 'minute', seconds: 60 },
  { unit: 'second', seconds: 1 },
];

export function relativeTime(iso: string | Date | null | undefined, now: Date = new Date()): string {
  if (iso === null || iso === undefined || iso === '') return 'never';
  const then = iso instanceof Date ? iso : new Date(iso);
  const ts = then.getTime();
  if (Number.isNaN(ts)) return 'never';

  const diffSeconds = Math.round((ts - now.getTime()) / 1000);
  const absSeconds = Math.abs(diffSeconds);

  if (absSeconds < 5) return 'just now';

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const { unit, seconds } of RELATIVE_TIME_UNITS) {
    if (absSeconds >= seconds) {
      const value = Math.round(diffSeconds / seconds);
      return rtf.format(value, unit);
    }
  }
  return 'just now';
}
