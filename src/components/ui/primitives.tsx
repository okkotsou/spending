/**
 * The component vocabulary from DESIGN.md.
 *
 * Buttons, fields, cards, chips, progress bars, skeletons and empty states.
 * Nothing here reaches for a colour or a radius that is not a token, and every
 * interactive element is at least 44px on its smallest axis unless it sits in a
 * desktop-only toolbar.
 */
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Icon } from './Icon';
import { cx } from '@/lib/cx';

// -- Button ------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-[var(--r-sm)] font-medium ' +
  'transition-colors duration-[120ms] ease-out disabled:opacity-45 disabled:pointer-events-none ' +
  'select-none whitespace-nowrap';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  secondary: 'bg-surface text-ink border border-line hover:bg-sunken',
  ghost: 'text-ink-2 hover:bg-sunken hover:text-ink',
  danger: 'bg-surface text-over border border-line hover:bg-over-soft',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** 36px with a mouse, the full 44px on touch. See `.control-compact`. */
  compact?: boolean;
  icon?: string;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', compact = false, icon, block = false, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      {...rest}
      className={cx(
        BUTTON_BASE,
        BUTTON_VARIANTS[variant],
        compact ? 'control-compact px-3 text-caption' : 'h-11 px-4 text-body',
        block && 'w-full',
        className,
      )}
    >
      {icon ? <Icon name={icon} size={compact ? 14 : 16} /> : null}
      {children}
    </button>
  );
});

/** Icon-only control. The 44px hit area is padding, not a visible box. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string; active?: boolean }
>(function IconButton({ icon, label, active = false, className, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cx(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r-sm)]',
        'transition-colors duration-[120ms] ease-out disabled:opacity-45',
        active ? 'text-accent bg-accent-soft' : 'text-ink-2 hover:bg-sunken hover:text-ink',
        className,
      )}
    >
      <Icon name={icon} size={18} />
    </button>
  );
});

// -- Surfaces ----------------------------------------------------------------

export function Card({
  children,
  className,
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
}) {
  return <Tag className={cx('card p-4', className)}>{children}</Tag>;
}

export function CardHeader({
  title,
  meta,
  action,
}: {
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-title text-ink">{title}</h2>
        {meta ? <p className="text-caption text-ink-3 mt-0.5">{meta}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('label', className)}>{children}</span>;
}

// -- Fields ------------------------------------------------------------------

const CONTROL =
  'h-11 w-full rounded-[var(--r-sm)] border border-line-strong bg-sunken px-3 text-body text-ink ' +
  'placeholder:text-ink-3 transition-colors duration-[120ms] focus:border-accent';

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-caption font-medium text-ink-2">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-caption text-ink-3">{hint}</p> : null}
      {error ? (
        <p className="text-caption text-over" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} {...rest} className={cx(CONTROL, 'num', className)} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        {...rest}
        className={cx(CONTROL, 'h-auto min-h-[140px] resize-y py-3 leading-relaxed', className)}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <div className="relative">
        <select ref={ref} {...rest} className={cx(CONTROL, 'appearance-none pe-9', className)}>
          {children}
        </select>
        <span className="text-ink-3 pointer-events-none absolute inset-y-0 end-3 flex items-center">
          <Icon name="chevron-down" size={16} />
        </span>
      </div>
    );
  },
);

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  id?: string;
}) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-11 cursor-pointer items-center justify-between gap-4 py-1"
    >
      <span className="min-w-0">
        <span className="text-body text-ink block">{label}</span>
        {hint ? <span className="text-caption text-ink-3 mt-0.5 block">{hint}</span> : null}
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <span
          aria-hidden="true"
          className={cx(
            'block h-6 w-11 rounded-[var(--r-full)] transition-colors duration-[120ms]',
            'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2',
            'peer-focus-visible:outline-[var(--c-accent)]',
            checked ? 'bg-accent' : 'bg-line-strong',
          )}
        >
          <span
            className={cx(
              'mt-0.5 block h-5 w-5 rounded-[var(--r-full)] bg-white transition-transform duration-[120ms]',
              // The knob travels to the far end when on. `translateX` is not
              // direction-aware, so RTL takes the negative of the same offset.
              checked
                ? 'translate-x-[22px] rtl:-translate-x-[22px]'
                : 'translate-x-0.5 rtl:-translate-x-0.5',
            )}
          />
        </span>
      </span>
    </label>
  );
}

// -- Indicators --------------------------------------------------------------

export type ProgressTone = 'accent' | 'warn' | 'over' | 'muted';

const PROGRESS_FILL: Record<ProgressTone, string> = {
  accent: 'bg-accent',
  warn: 'bg-warn',
  over: 'bg-over',
  muted: 'bg-line-strong',
};

export function Progress({
  value,
  tone = 'accent',
  /** Position of the even-pace tick, 0 to 1. Omit to hide it. */
  marker,
  label,
}: {
  value: number;
  tone?: ProgressTone;
  marker?: number;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <div
      className="bg-sunken relative h-1.5 w-full overflow-hidden rounded-[var(--r-full)]"
      role="progressbar"
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cx('h-full rounded-[var(--r-full)] transition-[width] duration-[180ms]', PROGRESS_FILL[tone])}
        style={{ width: `${clamped * 100}%` }}
      />
      {marker !== undefined && marker > 0 && marker < 1 ? (
        <span
          aria-hidden="true"
          className="bg-ink-3 absolute inset-y-0 w-px opacity-70"
          style={{ insetInlineStart: `${Math.min(100, marker * 100)}%` }}
        />
      ) : null}
    </div>
  );
}

export function Chip({
  children,
  color,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  /** A category colour; renders as a tinted chip with a solid dot. */
  color?: string;
  tone?: 'neutral' | 'warn' | 'over' | 'income' | 'accent';
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-sunken text-ink-2',
    warn: 'bg-warn-soft text-warn',
    over: 'bg-over-soft text-over',
    income: 'bg-income-soft text-income',
    accent: 'bg-accent-soft text-accent',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-[var(--r-full)] px-2 py-0.5 text-caption font-medium',
        color ? 'text-ink-2' : tones[tone],
        className,
      )}
      style={color ? { backgroundColor: `${color}24` } : undefined}
    >
      {color ? (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-[var(--r-full)]"
          style={{ backgroundColor: color }}
        />
      ) : null}
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden="true" />;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: string;
  title: ReactNode;
  body: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 py-8">
      <span className="text-ink-3">
        <Icon name={icon} size={20} />
      </span>
      <h3 className="text-title text-ink">{title}</h3>
      <p className="text-body text-ink-2 max-w-prose">{body}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** A number rendered on the type ramp with tabular figures. */
export function Figure({
  value,
  size = 'figure',
  tone = 'ink',
  className,
}: {
  value: ReactNode;
  size?: 'display' | 'figure' | 'body' | 'caption';
  tone?: 'ink' | 'over' | 'income' | 'muted';
  className?: string;
}) {
  const sizes = {
    display: 'text-display',
    figure: 'text-figure',
    body: 'text-body font-medium',
    caption: 'text-caption font-medium',
  } as const;
  const tones = {
    ink: 'text-ink',
    over: 'text-over',
    income: 'text-income',
    muted: 'text-ink-3',
  } as const;
  return <span className={cx('num', sizes[size], tones[tone], className)}>{value}</span>;
}
