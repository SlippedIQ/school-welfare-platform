import { cn } from '@/lib/cn';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-white border border-transparent hover:bg-accent-hover shadow-panel disabled:hover:bg-accent',
  secondary:
    'bg-white text-ink border border-line hover:border-line-strong hover:bg-surface-muted shadow-panel',
  ghost: 'bg-transparent text-ink-muted border border-transparent hover:bg-surface-sunken hover:text-ink',
  danger: 'bg-white text-rose-600 border border-rose-200 hover:bg-rose-50 shadow-panel',
};

const sizes: Record<Size, string> = {
  sm: 'h-7 gap-1 px-2 text-xs',
  md: 'h-9 gap-1.5 px-3 text-sm',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
