'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import type {
  CrawlResult,
  OnboardingCompleteBody,
  OnboardingCompleteResponse,
  OnboardingCrawlResponse,
  OnboardingGenerateCompetitorsResponse,
  OnboardingGeneratePromptsResponse,
  PromptTopic,
} from '@/types';
import { cn, normalizeDomain } from '@/lib/utils';
import { ProgressDots, type OnboardingStep } from './ProgressDots';
import { Step1Url } from './Step1Url';
import { Step2Analyzing } from './Step2Analyzing';
import {
  Step3Review,
  type ReviewBrandFields,
  type ReviewCompetitor,
  type ReviewPrompt,
} from './Step3Review';

interface AnalyzeResult {
  url: string;
  domain: string;
  crawlData: CrawlResult;
  prompts: { text: string; topic: PromptTopic }[];
  competitors: { name: string; domain: string }[];
}

function randomId(): string {
  return `id-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function jsonError(payload: unknown): string | null {
  if (payload && typeof payload === 'object' && 'error' in payload) {
    const err = (payload as { error?: unknown }).error;
    if (typeof err === 'string' && err.trim()) return err;
  }
  return null;
}

async function callJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    // ignore parse errors; surfaced below
  }
  if (!res.ok) {
    const msg = jsonError(parsed) ?? `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return parsed as T;
}

export interface OnboardingFlowProps {
  onComplete?: () => void;
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps = {}) {
  const [step, setStep] = useState<OnboardingStep>(1);
  const [urlValue, setUrlValue] = useState('');
  const [analyzingDomain, setAnalyzingDomain] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const [brand, setBrand] = useState<ReviewBrandFields>({
    brandName: '',
    description: '',
    category: '',
    targetAudience: '',
  });
  const [prompts, setPrompts] = useState<ReviewPrompt[]>([]);
  const [competitors, setCompetitors] = useState<ReviewCompetitor[]>([]);
  const [finalDomain, setFinalDomain] = useState('');
  const [isLaunching, setIsLaunching] = useState(false);

  const activeRunRef = useRef(0);

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  function dismissToast() {
    setToast(null);
  }

  function resetAll() {
    activeRunRef.current += 1;
    setStep(1);
    setAnalyzingDomain('');
    setBrand({ brandName: '', description: '', category: '', targetAudience: '' });
    setPrompts([]);
    setCompetitors([]);
    setFinalDomain('');
  }

  async function runAnalyze(url: string): Promise<AnalyzeResult> {
    const crawlRes = await callJson<OnboardingCrawlResponse>('/api/onboarding/crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const [promptsRes, competitorsRes] = await Promise.all([
      callJson<OnboardingGeneratePromptsResponse>('/api/onboarding/generate-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crawlData: crawlRes.crawlData, domain: crawlRes.domain }),
      }),
      callJson<OnboardingGenerateCompetitorsResponse>('/api/onboarding/generate-competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crawlData: crawlRes.crawlData, domain: crawlRes.domain }),
      }),
    ]);
    return {
      url,
      domain: crawlRes.domain,
      crawlData: crawlRes.crawlData,
      prompts: promptsRes.prompts,
      competitors: competitorsRes.competitors,
    };
  }

  async function handleUrlSubmit(url: string) {
    setUrlValue(url);
    const domain = normalizeDomain(url);
    setAnalyzingDomain(domain);
    setToast(null);
    setStep(2);

    const runToken = ++activeRunRef.current;
    try {
      const result = await runAnalyze(url);
      if (runToken !== activeRunRef.current) return;
      setBrand({
        brandName: result.crawlData.title || domain,
        description: result.crawlData.description ?? '',
        category: result.crawlData.category ?? '',
        targetAudience: result.crawlData.targetAudience ?? '',
      });
      setPrompts(
        result.prompts.map((p) => ({
          id: randomId(),
          text: p.text,
          topic: p.topic,
        })),
      );
      setCompetitors(
        result.competitors.map((c) => ({
          id: randomId(),
          name: c.name,
          domain: c.domain,
        })),
      );
      setFinalDomain(result.domain);
      setStep(3);
    } catch (err) {
      if (runToken !== activeRunRef.current) return;
      const message = err instanceof Error ? err.message : 'Could not analyze that website';
      showToast(message);
      setStep(1);
    }
  }

  async function handleLaunch() {
    if (isLaunching) return;
    setIsLaunching(true);
    setToast(null);

    const trimmedPrompts = prompts
      .map((p) => ({ text: p.text.trim(), topic: p.topic }))
      .filter((p) => p.text.length > 0);
    const trimmedCompetitors = competitors
      .map((c) => ({ name: c.name.trim(), domain: c.domain.trim() }))
      .filter((c) => c.name.length > 0 && c.domain.length > 0);

    const body: OnboardingCompleteBody = {
      brandName: brand.brandName.trim(),
      domain: finalDomain || normalizeDomain(urlValue),
      category: brand.category.trim(),
      description: brand.description.trim(),
      prompts: trimmedPrompts,
      competitors: trimmedCompetitors,
    };

    try {
      await callJson<OnboardingCompleteResponse>('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (onComplete) {
        onComplete();
      } else if (typeof window !== 'undefined') {
        window.location.assign('/');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not launch tracking';
      showToast(message);
      setIsLaunching(false);
    }
  }

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <div className="min-h-screen bg-background text-foreground" data-testid="onboarding-flow">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-10">
        <header className="mb-10">
          <ProgressDots current={step} />
        </header>

        <main className="flex flex-1 flex-col items-center justify-start">
          {step === 1 && (
            <Step1Url
              initialUrl={urlValue}
              errorMessage={null}
              onSubmit={handleUrlSubmit}
            />
          )}
          {step === 2 && <Step2Analyzing domain={analyzingDomain} />}
          {step === 3 && (
            <Step3Review
              brand={brand}
              prompts={prompts}
              competitors={competitors}
              isLaunching={isLaunching}
              onBrandChange={setBrand}
              onPromptsChange={setPrompts}
              onCompetitorsChange={setCompetitors}
              onStartOver={resetAll}
              onLaunch={handleLaunch}
            />
          )}
        </main>
      </div>

      {toast && (
        <div
          role="alert"
          data-testid="onboarding-toast"
          className={cn(
            'fixed bottom-6 left-1/2 z-50 -translate-x-1/2',
            'flex items-start gap-2 rounded-md border border-destructive/40 bg-card/95 px-4 py-3 text-[13px] text-foreground shadow-xl',
            'max-w-md',
          )}
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-destructive" aria-hidden="true" />
          <span className="flex-1">{toast}</span>
          <button
            type="button"
            onClick={dismissToast}
            aria-label="Dismiss"
            data-testid="onboarding-toast-dismiss"
            className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-muted-foreground/60 hover:bg-white/[0.04] hover:text-foreground transition-colors duration-150"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
