import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type BadgeVariant =
  | 'default'
  | 'muted'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'info'
  | 'outline';

export type BadgePriority = 'high' | 'medium' | 'low';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  priority?: BadgePriority;
  children?: ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-white/[0.06] text-foreground',
  muted: 'bg-white/[0.04] text-muted-foreground',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  destructive: 'bg-destructive/15 text-destructive',
  info: 'bg-blue-500/15 text-blue-400',
  outline: 'border border-border/60 text-muted-foreground',
};

const priorityClasses: Record<BadgePriority, string> = {
  high: 'bg-destructive/15 text-destructive',
  medium: 'bg-warning/15 text-warning',
  low: 'bg-blue-500/15 text-blue-400',
};

export function Badge({ variant = 'default', priority, className, children, ...props }: BadgeProps) {
  const palette = priority ? priorityClasses[priority] : variantClasses[variant];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider',
        palette,
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
