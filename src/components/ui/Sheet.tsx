/**
 * The one overlay component.
 *
 * A bottom sheet on phones, a centred dialog from 768px up. It traps focus,
 * closes on Escape and on a backdrop press, returns focus to whatever opened
 * it, and is labelled by its own title. The page behind it is locked from
 * scrolling but keeps its scroll position.
 */
import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { IconButton } from './primitives';
import { cx } from '@/lib/cx';
import { useI18n } from '@/i18n';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Open sheets, innermost last. A confirmation opened over an editor must be
 * the one Escape closes; without this both would close at once, because the
 * outer sheet's document listener was registered first and fires first.
 */
const stack: symbol[] = [];

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  /** Wider dialog for content that needs it, such as the review list. */
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const idRef = useRef<symbol>(Symbol('sheet'));

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!open) return;
      if (stack[stack.length - 1] !== idRef.current) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [open, onClose],
  );

  useEffect(() => {
    if (!open) return undefined;
    const id = idRef.current;
    stack.push(id);
    openerRef.current = document.activeElement as HTMLElement | null;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown, true);

    const panel = panelRef.current;
    const target = panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
    target?.focus({ preventScroll: true });

    return () => {
      const index = stack.indexOf(id);
      if (index >= 0) stack.splice(index, 1);
      body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown, true);
      openerRef.current?.focus({ preventScroll: true });
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button
        type="button"
        aria-label={t('a11y.close')}
        onClick={onClose}
        className="animate-fade absolute inset-0 h-full w-full cursor-default bg-black/35"
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cx(
          'animate-rise bg-surface border-line relative flex max-h-[92dvh] w-full flex-col',
          'rounded-t-[var(--r-md)] border shadow-[var(--shadow-pop)]',
          'md:max-h-[86dvh] md:rounded-[var(--r-md)]',
          wide ? 'md:max-w-[720px]' : 'md:max-w-[480px]',
        )}
      >
        <header className="border-line flex items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0 pt-1.5">
            <h2 id={titleId} className="text-figure text-ink">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="text-caption text-ink-3 mt-1">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton icon="x" label={t('a11y.close')} onClick={onClose} className="-me-2" />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer ? (
          <footer className="border-line safe-bottom border-t px-4 py-3">{footer}</footer>
        ) : (
          <div className="safe-bottom" />
        )}
      </div>
    </div>
  );
}

/** A destructive confirmation. Never a browser `confirm`, which cannot be styled or translated. */
export function ConfirmSheet({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  danger = true,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  body?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="border-line text-ink hover:bg-sunken h-11 flex-1 rounded-[var(--r-sm)] border text-body font-medium"
          >
            {t('action.cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={cx(
              'h-11 flex-1 rounded-[var(--r-sm)] text-body font-medium transition-colors duration-[120ms]',
              danger
                ? 'bg-over text-white hover:opacity-90'
                : 'bg-accent text-accent-fg hover:bg-accent-hover',
            )}
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      {body ? <p className="text-body text-ink-2">{body}</p> : null}
    </Sheet>
  );
}
