/**
 * Transient confirmations.
 *
 * Announced politely so a screen reader hears the outcome of an action without
 * losing the user's place. Positioned above the tab bar on phones.
 */
import { useApp } from '@/state/AppProvider';
import { useI18n } from '@/i18n';
import { IconButton } from './ui/primitives';
import { cx } from '@/lib/cx';

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  const { t } = useI18n();

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[76px] z-40 flex flex-col items-center gap-2 px-4 md:bottom-6"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cx(
            'animate-rise pointer-events-auto flex w-full max-w-[420px] items-center gap-2',
            'rounded-[var(--r-sm)] border py-1.5 ps-3 pe-1 shadow-[var(--shadow-pop)]',
            toast.tone === 'over'
              ? 'bg-over-soft border-over/30 text-over'
              : 'bg-surface border-line text-ink',
          )}
        >
          <span className="flex-1 text-body">{toast.message}</span>
          <IconButton icon="x" label={t('action.dismiss')} onClick={() => dismissToast(toast.id)} />
        </div>
      ))}
    </div>
  );
}
