import { type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  padded?: boolean;
}

export function Card({ className, padded = true, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border/40 bg-card/60',
        padded && 'p-5',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export function CardHeader({ className, children, ...props }: CardHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between gap-3 pb-3', className)} {...props}>
      {children}
    </div>
  );
}

export interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  children?: ReactNode;
}

export function CardTitle({ className, children, ...props }: CardTitleProps) {
  return (
    <h3 className={cn('text-[13px] font-semibold text-foreground', className)} {...props}>
      {children}
    </h3>
  );
}

export interface CardSubtitleProps extends HTMLAttributes<HTMLParagraphElement> {
  children?: ReactNode;
}

export function CardSubtitle({ className, children, ...props }: CardSubtitleProps) {
  return (
    <p className={cn('text-[11px] text-muted-foreground', className)} {...props}>
      {children}
    </p>
  );
}
