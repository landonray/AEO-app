'use client';

import { useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Box, MessageSquareText, Users, X, Zap, Pencil } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import type { PromptTopic } from '@/types';

export interface ReviewBrandFields {
  brandName: string;
  description: string;
  category: string;
  targetAudience: string;
}

export interface ReviewPrompt {
  id: string;
  text: string;
  topic: PromptTopic;
}

export interface ReviewCompetitor {
  id: string;
  name: string;
  domain: string;
}

export interface Step3ReviewProps {
  brand: ReviewBrandFields;
  prompts: ReviewPrompt[];
  competitors: ReviewCompetitor[];
  isLaunching?: boolean;
  onBrandChange: (next: ReviewBrandFields) => void;
  onPromptsChange: (next: ReviewPrompt[]) => void;
  onCompetitorsChange: (next: ReviewCompetitor[]) => void;
  onStartOver: () => void;
  onLaunch: () => void;
}

interface EditableTextProps {
  value: string;
  label: string;
  multiline?: boolean;
  placeholder?: string;
  testId?: string;
  onChange: (next: string) => void;
}

function EditableText({
  value,
  label,
  multiline = false,
  placeholder,
  testId,
  onChange,
}: EditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function startEdit() {
    setDraft(value);
    setEditing(true);
  }

  function commit() {
    const trimmed = draft.trim();
    onChange(trimmed);
    setEditing(false);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !multiline) {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (e.key === 'Enter' && multiline && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commit();
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        aria-label={`Edit ${label}`}
        data-testid={testId}
        onClick={startEdit}
        className={cn(
          'group block w-full rounded-md px-2 py-1.5 text-left text-[13px] text-foreground',
          'hover:bg-white/[0.03] transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60',
        )}
      >
        <span className="flex items-start justify-between gap-2">
          <span className={cn('flex-1 whitespace-pre-wrap break-words', !value && 'text-muted-foreground/60')}>
            {value || placeholder || `Add ${label}`}
          </span>
          <Pencil
            className="mt-0.5 h-3 w-3 flex-shrink-0 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity"
            aria-hidden="true"
          />
        </span>
      </button>
    );
  }

  const commonClass = cn(
    'w-full rounded-md border border-input bg-secondary px-2 py-1.5 text-[13px] text-foreground',
    'focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60',
    'transition-colors duration-150',
  );

  return multiline ? (
    <textarea
      autoFocus
      aria-label={label}
      data-testid={testId ? `${testId}-input` : undefined}
      value={draft}
      onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKey}
      rows={3}
      className={cn(commonClass, 'resize-none')}
    />
  ) : (
    <input
      autoFocus
      aria-label={label}
      data-testid={testId ? `${testId}-input` : undefined}
      value={draft}
      onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={handleKey}
      className={commonClass}
    />
  );
}

export function Step3Review({
  brand,
  prompts,
  competitors,
  isLaunching = false,
  onBrandChange,
  onPromptsChange,
  onCompetitorsChange,
  onStartOver,
  onLaunch,
}: Step3ReviewProps) {
  function updateBrandField<K extends keyof ReviewBrandFields>(key: K, value: ReviewBrandFields[K]) {
    onBrandChange({ ...brand, [key]: value });
  }

  function updatePromptText(id: string, text: string) {
    onPromptsChange(prompts.map((p) => (p.id === id ? { ...p, text } : p)));
  }

  function removePrompt(id: string) {
    onPromptsChange(prompts.filter((p) => p.id !== id));
  }

  function updateCompetitorField(
    id: string,
    key: keyof Omit<ReviewCompetitor, 'id'>,
    value: string,
  ) {
    onCompetitorsChange(
      competitors.map((c) => (c.id === id ? { ...c, [key]: value } : c)),
    );
  }

  function removeCompetitor(id: string) {
    onCompetitorsChange(competitors.filter((c) => c.id !== id));
  }

  const launchDisabled =
    isLaunching ||
    !brand.brandName.trim() ||
    prompts.length === 0 ||
    competitors.length === 0;

  return (
    <div className="w-full max-w-2xl mx-auto" data-testid="onboarding-step-3">
      <div className="flex flex-col gap-4">
        <Card padded>
          <div className="mb-3 flex items-center gap-2">
            <Box className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground/70 font-semibold">
              Product Summary
            </h3>
          </div>
          <div className="flex flex-col gap-2">
            <FieldRow label="Name">
              <EditableText
                label="Name"
                value={brand.brandName}
                testId="onboarding-brand-name"
                onChange={(v) => updateBrandField('brandName', v)}
              />
            </FieldRow>
            <FieldRow label="Description">
              <EditableText
                label="Description"
                value={brand.description}
                multiline
                testId="onboarding-brand-description"
                onChange={(v) => updateBrandField('description', v)}
              />
            </FieldRow>
            <FieldRow label="Category">
              <EditableText
                label="Category"
                value={brand.category}
                testId="onboarding-brand-category"
                onChange={(v) => updateBrandField('category', v)}
              />
            </FieldRow>
            <FieldRow label="Target audience">
              <EditableText
                label="Target audience"
                value={brand.targetAudience}
                testId="onboarding-brand-audience"
                onChange={(v) => updateBrandField('targetAudience', v)}
              />
            </FieldRow>
          </div>
        </Card>

        <Card padded>
          <div className="mb-3 flex items-center gap-2">
            <MessageSquareText
              className="h-3.5 w-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground/70 font-semibold">
              Generated Prompts
            </h3>
            <span className="ml-auto text-[11px] text-muted-foreground/60 tabular-nums">
              {prompts.length}
            </span>
          </div>
          <ul
            data-testid="onboarding-prompts-list"
            className="flex flex-col gap-1.5"
          >
            {prompts.map((p) => (
              <li
                key={p.id}
                data-testid="onboarding-prompt-row"
                className="group flex items-start gap-2 rounded-md border border-border/30 bg-white/[0.015] px-2 py-1.5"
              >
                <span className="mt-1.5 inline-flex h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary/40" aria-hidden="true" />
                <div className="flex-1">
                  <EditableText
                    label={`Prompt: ${p.topic}`}
                    value={p.text}
                    multiline
                    testId={`onboarding-prompt-${p.id}`}
                    onChange={(v) => updatePromptText(p.id, v)}
                  />
                  <span className="ml-2 inline-block text-[10px] uppercase tracking-wider text-muted-foreground/50">
                    {p.topic}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label={`Remove prompt: ${p.text.slice(0, 40)}`}
                  data-testid={`onboarding-prompt-remove-${p.id}`}
                  onClick={() => removePrompt(p.id)}
                  className="mt-1 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground/50 hover:bg-white/[0.04] hover:text-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          {prompts.length === 0 && (
            <p className="text-[12px] text-muted-foreground/60 italic">
              All prompts removed. Add some after launch from the Prompts tab.
            </p>
          )}
        </Card>

        <Card padded>
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <h3 className="text-[11px] uppercase tracking-widest text-muted-foreground/70 font-semibold">
              Competitors
            </h3>
            <span className="ml-auto text-[11px] text-muted-foreground/60 tabular-nums">
              {competitors.length}
            </span>
          </div>
          <ul
            data-testid="onboarding-competitors-list"
            className="flex flex-col gap-1.5"
          >
            {competitors.map((c) => (
              <li
                key={c.id}
                data-testid="onboarding-competitor-row"
                className="group flex items-center gap-2 rounded-md border border-border/30 bg-white/[0.015] px-2 py-1.5"
              >
                <div className="flex flex-1 flex-col gap-0.5">
                  <EditableText
                    label="Competitor name"
                    value={c.name}
                    testId={`onboarding-competitor-name-${c.id}`}
                    onChange={(v) => updateCompetitorField(c.id, 'name', v)}
                  />
                  <div className="text-[11px] text-muted-foreground">
                    <EditableText
                      label="Competitor domain"
                      value={c.domain}
                      testId={`onboarding-competitor-domain-${c.id}`}
                      onChange={(v) => updateCompetitorField(c.id, 'domain', v)}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Remove competitor: ${c.name}`}
                  data-testid={`onboarding-competitor-remove-${c.id}`}
                  onClick={() => removeCompetitor(c.id)}
                  className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground/50 hover:bg-white/[0.04] hover:text-foreground transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          {competitors.length === 0 && (
            <p className="text-[12px] text-muted-foreground/60 italic">
              All competitors removed. Start over to regenerate.
            </p>
          )}
        </Card>

        <div className="flex items-center justify-between gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            data-testid="onboarding-start-over"
            onClick={onStartOver}
            disabled={isLaunching}
          >
            Start Over
          </Button>
          <Button
            type="button"
            data-testid="onboarding-launch"
            loading={isLaunching}
            disabled={launchDisabled}
            onClick={onLaunch}
            leftIcon={<Zap className="h-4 w-4" aria-hidden="true" />}
          >
            Launch Tracking
          </Button>
        </div>
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-start gap-3 py-1">
      <span className="pt-1.5 text-[11px] uppercase tracking-wider text-muted-foreground/60">
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
