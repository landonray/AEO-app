import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import type { ModelShortId } from '@/types';

export const MODEL_META: Record<
  ModelShortId,
  { label: string; displayName: string; color: string }
> = {
  openai: { label: 'GPT', displayName: 'ChatGPT', color: '#10a37f' },
  claude: { label: 'CL', displayName: 'Claude', color: '#d97640' },
  gemini: { label: 'GM', displayName: 'Gemini', color: '#4285f4' },
  perplexity: { label: 'PX', displayName: 'Perplexity', color: '#20b2aa' },
  google_aio: { label: 'AIO', displayName: 'AI Overview', color: '#ea4335' },
};

export const MODEL_ORDER: ModelShortId[] = [
  'openai',
  'claude',
  'gemini',
  'perplexity',
  'google_aio',
];

export type ModelIconSize = 'sm' | 'md' | 'lg';

export interface ModelIconProps extends HTMLAttributes<HTMLSpanElement> {
  model: ModelShortId;
  size?: ModelIconSize;
  dimmed?: boolean;
  title?: string;
}

const sizeClasses: Record<ModelIconSize, string> = {
  sm: 'h-4 min-w-[20px] px-1 text-[8px] rounded',
  md: 'h-5 min-w-[26px] px-1.5 text-[9px] rounded',
  lg: 'h-6 min-w-[32px] px-1.5 text-[10px] rounded-md',
};

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace('#', '');
  const value = cleaned.length === 3
    ? cleaned.split('').map((c) => c + c).join('')
    : cleaned;
  const num = parseInt(value, 16);
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  };
}

export function ModelIcon({
  model,
  size = 'md',
  dimmed = false,
  className,
  title,
  style,
  ...props
}: ModelIconProps) {
  const meta = MODEL_META[model];
  const { r, g, b } = hexToRgb(meta.color);
  const bgAlpha = dimmed ? 0.04 : 0.12;
  const textColor = dimmed ? 'rgba(139, 139, 146, 0.6)' : meta.color;
  return (
    <span
      aria-label={meta.displayName}
      title={title ?? meta.displayName}
      data-model={model}
      data-dimmed={dimmed || undefined}
      className={cn(
        'inline-flex items-center justify-center font-semibold uppercase tracking-wider tabular-nums select-none',
        sizeClasses[size],
        className,
      )}
      style={{
        backgroundColor: `rgba(${r}, ${g}, ${b}, ${bgAlpha})`,
        color: textColor,
        ...style,
      }}
      {...props}
    >
      {meta.label}
    </span>
  );
}

export interface ModelIconGroupProps extends HTMLAttributes<HTMLDivElement> {
  activeModels: ModelShortId[];
  size?: ModelIconSize;
}

export function ModelIconGroup({
  activeModels,
  size = 'md',
  className,
  ...props
}: ModelIconGroupProps) {
  const active = new Set(activeModels);
  return (
    <div className={cn('inline-flex items-center gap-1', className)} {...props}>
      {MODEL_ORDER.map((m) => (
        <ModelIcon key={m} model={m} size={size} dimmed={!active.has(m)} />
      ))}
    </div>
  );
}
