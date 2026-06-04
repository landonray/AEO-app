'use client';

import { useState, type FormEvent } from 'react';
import { ArrowRight, Globe } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export interface Step1UrlProps {
  initialUrl?: string;
  errorMessage?: string | null;
  onSubmit: (url: string) => void;
}

const VALID_PROTOCOL_RE = /^https?:\/\//i;
const ANY_PROTOCOL_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+/i;

export function normalizeOnboardingUrl(raw: string): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  if (VALID_PROTOCOL_RE.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      if (!u.hostname || !u.hostname.includes('.')) return null;
      return u.toString();
    } catch {
      return null;
    }
  }
  if (ANY_PROTOCOL_RE.test(trimmed)) return null;
  const hostPart = trimmed.split('/')[0] ?? '';
  if (!DOMAIN_RE.test(hostPart)) return null;
  try {
    const u = new URL(`https://${trimmed}`);
    return u.toString();
  } catch {
    return null;
  }
}

export function Step1Url({ initialUrl = '', errorMessage = null, onSubmit }: Step1UrlProps) {
  const [value, setValue] = useState(initialUrl);
  const [localError, setLocalError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const normalized = normalizeOnboardingUrl(value);
    if (!normalized) {
      setLocalError('Enter a valid URL (e.g. https://yourproduct.com)');
      return;
    }
    setLocalError(null);
    onSubmit(normalized);
  }

  const displayError = localError ?? errorMessage;

  return (
    <div className="w-full max-w-md mx-auto">
      <Card padded className="p-8" data-testid="onboarding-step-1">
        <div className="flex flex-col items-center gap-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
            <Globe className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-foreground">
              Track your AI search visibility
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Enter your website and we&apos;ll set up tracking automatically.
            </p>
          </div>
          <form onSubmit={handleSubmit} className="flex w-full flex-col gap-2">
            <div className="flex w-full items-center gap-2">
              <Input
                aria-label="Website URL"
                data-testid="onboarding-url-input"
                placeholder="https://yourproduct.com"
                value={value}
                invalid={Boolean(displayError)}
                onChange={(e) => {
                  setValue(e.target.value);
                  if (localError) setLocalError(null);
                }}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                inputMode="url"
              />
              <Button
                type="submit"
                aria-label="Analyze website"
                data-testid="onboarding-url-submit"
                size="icon"
              >
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            {displayError && (
              <p
                role="alert"
                data-testid="onboarding-url-error"
                className="text-[11px] text-destructive"
              >
                {displayError}
              </p>
            )}
          </form>
        </div>
      </Card>
    </div>
  );
}
