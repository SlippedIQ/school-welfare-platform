import { cn } from '@/lib/cn';
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({ label, hint, error, required, className, children }: FieldProps) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1 flex items-center gap-1 text-xs font-medium text-ink-muted">
        {label}
        {required ? <span className="text-rose-500">*</span> : null}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-rose-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-ink-faint">{hint}</span>
      ) : null}
    </label>
  );
}

const controlBase =
  'w-full rounded-md border border-line bg-white px-3 text-sm text-ink shadow-panel transition-colors ' +
  'placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15 ' +
  'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-faint';

export function Input({
  className,
  invalid = false,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      className={cn(controlBase, 'h-9', invalid && 'border-rose-300 focus:border-rose-400 focus:ring-rose-200/40', className)}
      {...props}
    />
  );
}

export function Select({
  className,
  invalid = false,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select
      className={cn(
        controlBase,
        'h-9 appearance-none bg-[length:0] pr-8',
        invalid && 'border-rose-300',
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 0.6rem center',
        backgroundSize: '12px',
      }}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlBase, 'min-h-[84px] resize-y py-2', className)} {...props} />;
}
