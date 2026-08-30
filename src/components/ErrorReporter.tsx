/**
 * The safety net.
 *
 * Every write in this app is a promise, and a promise that rejects without a
 * handler fails silently: the user presses a button, nothing happens, and
 * nothing says why. This listens for unhandled rejections and uncaught errors
 * and turns them into a toast, so a failure is always visible even where the
 * call site did not anticipate it.
 *
 * It reports, it does not diagnose. The detail goes to the console for anyone
 * looking; the toast says only that nothing was changed, which is true because
 * every multi-row write in the repository runs inside a Dexie transaction.
 */
import { useEffect } from 'react';
import { useApp } from '@/state/AppProvider';
import { useI18n } from '@/i18n';

export function ErrorReporter() {
  const { pushToast } = useApp();
  const { t } = useI18n();

  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled rejection', event.reason);
      pushToast(t('error.unexpected'), 'over');
    };
    const onError = (event: ErrorEvent) => {
      console.error('Uncaught error', event.error ?? event.message);
      pushToast(t('error.unexpected'), 'over');
    };
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onError);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError);
    };
  }, [pushToast, t]);

  return null;
}
