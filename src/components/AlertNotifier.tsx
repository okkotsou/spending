/**
 * System notifications for budget alerts.
 *
 * Renders nothing. It watches the derived alerts and, where the user has
 * opted in and the browser has granted permission, raises one notification per
 * event. Keys already notified are remembered in local storage so a reload
 * cannot repeat an alert the user has already seen.
 *
 * The body is deliberately vague. A notification lands on a lock screen where
 * other people can read it, and someone's spending is not for them.
 */
import { useEffect, useRef } from 'react';
import { useApp } from '@/state/AppProvider';
import { useI18n } from '@/i18n';

const STORAGE_KEY = 'misraf.notified';
/** Keeps the remembered set bounded on a long-lived install. */
const MAX_REMEMBERED = 200;

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return new Set(
      Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [],
    );
  } catch {
    return new Set();
  }
}

function write(keys: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys].slice(-MAX_REMEMBERED)));
  } catch {
    // Storage can be unavailable in private mode. The in-app alerts still show.
  }
}

export function AlertNotifier() {
  const { alerts, settings } = useApp();
  const { t } = useI18n();
  const rememberedRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!settings.notificationsEnabled) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    if (rememberedRef.current === null) rememberedRef.current = read();
    const remembered = rememberedRef.current;

    // Only the two levels that mean something has gone wrong are worth
    // interrupting for; informational alerts stay inside the app.
    const fresh = alerts.filter((alert) => alert.level !== 'info' && !remembered.has(alert.key));
    if (fresh.length === 0) return;
    for (const alert of fresh) remembered.add(alert.key);
    write(remembered);

    const worst = fresh.some((alert) => alert.level === 'over') ? 'over' : 'warn';
    try {
      new Notification(t('app.name'), {
        body: t(worst === 'over' ? 'notify.over' : 'notify.warn'),
        tag: 'misraf-budget',
      });
    } catch {
      // Some browsers only permit notifications from a service worker context.
    }
  }, [alerts, settings.notificationsEnabled, t]);

  return null;
}
