import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: SpinnerSize;
  label?: string;
}

const sizeClasses: Record<SpinnerSize, string> = {
  sm: 'h-3.5 w-3.5 border-[1.5px]',
  md: 'h-4 w-4 border-[1.5px]',
  lg: 'h-5 w-5 border-2',
};

export function Spinner({ size = 'md', label = 'Loading', className, ...props }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn('inline-block animate-spin', className)}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'block rounded-full border-current border-t-transparent',
          sizeClasses[size],
        )}
      />
    </span>
  );
}
