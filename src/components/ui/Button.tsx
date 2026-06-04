'use client';

import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/85 disabled:bg-primary/40',
  secondary:
    'bg-white/[0.04] text-foreground hover:bg-white/[0.06] active:bg-white/[0.08] disabled:opacity-50',
  ghost:
    'bg-transparent text-muted-foreground hover:bg-white/[0.04] hover:text-foreground active:bg-white/[0.06] disabled:opacity-40',
  outline:
    'bg-transparent text-foreground border border-border/60 hover:bg-white/[0.04] active:bg-white/[0.06] disabled:opacity-50',
  destructive:
    'bg-destructive/90 text-white hover:bg-destructive active:bg-destructive disabled:opacity-50',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-[11px] rounded-md gap-1.5',
  md: 'h-9 px-3.5 text-[13px] rounded-md gap-2',
  lg: 'h-10 px-4 text-[13px] rounded-md gap-2',
  icon: 'h-8 w-8 rounded-md',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  className,
  disabled,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      data-loading={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0 disabled:cursor-not-allowed select-none whitespace-nowrap',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? <Spinner size="sm" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
}
