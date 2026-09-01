/**
 * The application root.
 *
 * Owns three cross-cutting concerns: keeping `<html>` in step with the language
 * and theme settings, importing anything the URL brought with it, and choosing
 * which screen to render.
 */
import { useEffect, useRef } from 'react';
import { AppProvider, useApp } from '@/state/AppProvider';
import { I18nProvider, useI18n } from '@/i18n';
import { useRoute } from '@/state/router';
import { clearUrlIngest, readUrlIngest } from '@/state/urlIngest';
import { ingestSilently } from '@/db/repo';
import { Shell } from '@/components/Shell';
import { Toasts } from '@/components/Toasts';
import { AlertNotifier } from '@/components/AlertNotifier';
import { ErrorReporter } from '@/components/ErrorReporter';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button, Card, EmptyState } from '@/components/ui/primitives';
import { Dashboard } from '@/screens/Dashboard';
import { Transactions } from '@/screens/Transactions';
import { AddScreen } from '@/screens/AddScreen';
import { Budgets } from '@/screens/Budgets';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { DashboardSkeleton } from '@/screens/DashboardSkeleton';

/** Mirrors the stored appearance settings onto the document element. */
function useDocumentChrome() {
  const { settings } = useApp();
  const { language, dir, t } = useI18n();

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('lang', language);
    root.setAttribute('dir', dir);
    document.title = `${t('app.name')} — ${t('app.tagline')}`;
  }, [language, dir, t]);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && media.matches);
      root.setAttribute('data-theme', dark ? 'dark' : 'light');
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings.theme]);

  // The pre-paint script in index.html reads this, so a cold start opens in the
  // right theme and direction with no flash.
  useEffect(() => {
    try {
      localStorage.setItem(
        'misraf.appearance',
        JSON.stringify({ theme: settings.theme, language: settings.language }),
      );
    } catch {
      // Private mode: the app still works, it just starts on the defaults.
    }
  }, [settings.theme, settings.language]);
}

function Routes() {
  const route = useRoute();
  const { ready, pushToast } = useApp();
  const { t } = useI18n();
  const importedRef = useRef(false);

  // URL ingestion runs once per load and needs no loading state of its own:
  // the imported rows arrive through the same live query as everything else,
  // and the toast reports the outcome.
  useEffect(() => {
    if (importedRef.current) return;
    importedRef.current = true;
    const pending = readUrlIngest(window.location);
    if (!pending) return;
    void ingestSilently(pending.inputs, 'url')
      .then((result) => {
        if (result.added > 0) pushToast(t('ingest.url.imported', { count: result.added }));
        else if (result.merged > 0) pushToast(t('ingest.url.duplicate'));
        else pushToast(t('ingest.url.failed'), 'over');
        clearUrlIngest(window.location, window.history);
      })
      .catch(() => {
        // The payload stays in the address bar so a reload can retry it.
        pushToast(t('ingest.url.failed'), 'over');
      });
  }, [pushToast, t]);

  useDocumentChrome();

  if (!ready) {
    return (
      <Shell route={route.name}>
        <DashboardSkeleton />
      </Shell>
    );
  }

  return (
    <Shell route={route.name}>
      <ErrorBoundary
        // Keyed on the route so navigating away from a screen that failed
        // gives the next one a clean boundary rather than a stuck error.
        key={route.name}
        fallback={(reset) => (
          <Card>
            <EmptyState
              icon="triangle-alert"
              title={t('error.crashTitle')}
              body={t('error.crashBody')}
              action={
                <div className="flex gap-2">
                  <Button variant="primary" onClick={() => window.location.reload()}>
                    {t('action.reload')}
                  </Button>
                  <Button onClick={reset}>{t('action.retry')}</Button>
                </div>
              }
            />
          </Card>
        )}
      >
      {route.name === 'dashboard' ? <Dashboard /> : null}
      {route.name === 'transactions' ? (
        <Transactions key={route.params.toString()} params={route.params} />
      ) : null}
      {route.name === 'add' ? <AddScreen /> : null}
      {route.name === 'budgets' ? <Budgets /> : null}
      {route.name === 'settings' ? <SettingsScreen /> : null}
      </ErrorBoundary>
    </Shell>
  );
}

function Localised() {
  const { settings } = useApp();
  return (
    <I18nProvider language={settings.language}>
      <Routes />
      <Toasts />
      <AlertNotifier />
      <ErrorReporter />
    </I18nProvider>
  );
}

export function App() {
  return (
    <AppProvider>
      <Localised />
    </AppProvider>
  );
}
