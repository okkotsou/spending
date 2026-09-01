/**
 * The application shell.
 *
 * Mobile: a compact top bar and a fixed bottom tab bar, both respecting the
 * safe-area insets so nothing sits under the notch or the home indicator.
 * From 768px the tab bar becomes a side rail on the leading edge, which in RTL
 * is the right-hand side, handled entirely by logical properties.
 */
import type { ReactNode } from 'react';
import { useI18n } from '@/i18n';
import { navigate, NAV_ORDER, type RouteName } from '@/state/router';
import { Icon } from './ui/Icon';
import { IconButton } from './ui/primitives';
import { cx } from '@/lib/cx';
import { useApp } from '@/state/AppProvider';
import { saveSettings } from '@/db/repo';

const NAV_ICONS: Record<RouteName, string> = {
  dashboard: 'layout-dashboard',
  transactions: 'receipt',
  add: 'plus',
  budgets: 'wallet',
  settings: 'settings',
};

const NAV_LABELS: Record<RouteName, 'nav.dashboard' | 'nav.transactions' | 'nav.add' | 'nav.budgets' | 'nav.settings'> = {
  dashboard: 'nav.dashboard',
  transactions: 'nav.transactions',
  add: 'nav.add',
  budgets: 'nav.budgets',
  settings: 'nav.settings',
};

export function Shell({ route, children }: { route: RouteName; children: ReactNode }) {
  const { t, language } = useI18n();
  const { settings } = useApp();

  const toggleLanguage = () => {
    void saveSettings({ language: language === 'ar' ? 'en' : 'ar' });
  };

  const toggleTheme = () => {
    const order = ['system', 'light', 'dark'] as const;
    const next = order[(order.indexOf(settings.theme) + 1) % order.length] ?? 'system';
    void saveSettings({ theme: next });
  };

  const themeIcon =
    settings.theme === 'dark' ? 'moon' : settings.theme === 'light' ? 'sun' : 'sun-moon';

  return (
    <div className="min-h-dvh md:flex">
      <a
        href="#main"
        className="bg-accent text-accent-fg sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-[var(--r-sm)] focus:px-3 focus:py-2"
      >
        {t('nav.skipToContent')}
      </a>

      {/* Desktop rail */}
      <nav
        aria-label={t('app.name')}
        className="border-line bg-surface safe-top sticky top-0 hidden h-dvh w-[212px] shrink-0 flex-col border-e px-3 py-4 md:flex"
      >
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="text-accent">
            <Icon name="wallet" size={18} />
          </span>
          <span className="text-title text-ink">{t('app.name')}</span>
        </div>
        <ul className="flex flex-col gap-0.5">
          {NAV_ORDER.map((name) => (
            <li key={name}>
              <button
                type="button"
                onClick={() => navigate(name)}
                aria-current={route === name ? 'page' : undefined}
                className={cx(
                  'flex h-11 w-full items-center gap-3 rounded-[var(--r-sm)] px-3 text-body',
                  'transition-colors duration-[120ms]',
                  route === name
                    ? 'bg-accent-soft text-accent font-medium'
                    : 'text-ink-2 hover:bg-sunken hover:text-ink',
                )}
              >
                <Icon name={NAV_ICONS[name]} size={17} />
                {t(NAV_LABELS[name])}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-auto flex gap-1 px-1">
          <IconButton icon="languages" label={t('a11y.languageToggle')} onClick={toggleLanguage} />
          <IconButton icon={themeIcon} label={t('a11y.themeToggle')} onClick={toggleTheme} />
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="border-line bg-bg/95 safe-top safe-x sticky top-0 z-30 border-b backdrop-blur-[2px] md:hidden">
          <div className="flex h-14 items-center justify-between gap-2 px-4">
            <div className="flex items-center gap-2">
              <span className="text-accent">
                <Icon name="wallet" size={17} />
              </span>
              <span className="text-title text-ink">{t('app.name')}</span>
            </div>
            <div className="-me-2 flex">
              <IconButton icon="languages" label={t('a11y.languageToggle')} onClick={toggleLanguage} />
              <IconButton icon={themeIcon} label={t('a11y.themeToggle')} onClick={toggleTheme} />
            </div>
          </div>
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="safe-x mx-auto w-full max-w-[1120px] flex-1 px-4 pt-4 pb-[96px] md:px-6 md:pt-6 md:pb-10"
        >
          {children}
        </main>

        {/* Mobile tab bar */}
        <nav
          aria-label={t('app.name')}
          className="border-line bg-surface safe-bottom safe-x fixed inset-x-0 bottom-0 z-30 border-t md:hidden"
        >
          <ul className="flex">
            {NAV_ORDER.map((name) => (
              <li key={name} className="flex-1">
                <button
                  type="button"
                  onClick={() => navigate(name)}
                  aria-current={route === name ? 'page' : undefined}
                  className={cx(
                    'flex h-14 w-full flex-col items-center justify-center gap-1',
                    'transition-colors duration-[120ms]',
                    route === name ? 'text-accent' : 'text-ink-3',
                  )}
                >
                  <Icon name={NAV_ICONS[name]} size={19} />
                  <span className="text-[10px] leading-none font-medium">{t(NAV_LABELS[name])}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
