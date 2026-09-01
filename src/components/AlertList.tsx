/**
 * Alerts.
 *
 * Each alert states the number that triggered it, so it can be checked rather
 * than trusted. Colour is never the only signal: an over-limit alert also
 * carries a warning glyph and says "over limit" in words.
 */
import type { AlertItem } from '@/types';
import { useApp } from '@/state/AppProvider';
import { useI18n } from '@/i18n';
import { dismissAlert } from '@/db/repo';
import { formatDayMonth, formatMoney } from '@/lib/format';
import { categoryName } from '@/lib/category';
import { Icon } from './ui/Icon';
import { IconButton } from './ui/primitives';
import { cx } from '@/lib/cx';

const LEVEL_STYLE = {
  over: 'bg-over-soft border-over/25 text-over',
  warn: 'bg-warn-soft border-warn/25 text-warn',
  info: 'bg-surface border-line text-ink-2',
} as const;

const LEVEL_ICON = {
  over: 'triangle-alert',
  warn: 'circle-alert',
  info: 'info',
} as const;

export function AlertList({ alerts }: { alerts: AlertItem[] }) {
  const { categoryById } = useApp();
  const { t, locale, language } = useI18n();

  if (alerts.length === 0) return null;

  // Punctuation is part of the language: Arabic joins these clauses with its
  // own comma, and a full stop after a currency symbol that already ends in a
  // period would read as a double one.
  const sentence = t('punct.sentence');
  const clause = t('punct.clause');

  /** Appends the projected breach date to a pace clause. */
  const withBreach = (text: string, alert: AlertItem): string => {
    const breach = alert.values.breachAt;
    if (typeof breach !== 'number') return text;
    return `${text}${clause}${t('alerts.paceBreach', { date: formatDayMonth(breach, locale) })}`;
  };

  const describe = (alert: AlertItem): string => {
    const category = alert.categoryId ? categoryById.get(alert.categoryId) : undefined;
    const name = categoryName(category, language, t('common.uncategorised'));
    const money = (key: string) => formatMoney(Number(alert.values[key] ?? 0), locale);

    switch (alert.kind) {
      case 'approaching': {
        const base = alert.categoryId
          ? t('alerts.approaching', {
              category: name,
              percent: Number(alert.values.percent ?? 0),
              remaining: money('remaining'),
            })
          : t('alerts.approachingOverall', {
              percent: Number(alert.values.percent ?? 0),
              remaining: money('remaining'),
            });
        // The pace figures travel with this alert when both apply.
        if (alert.values.projected === undefined) return base;
        return `${base}${sentence}${withBreach(
          t('alerts.paceProjection', { projected: money('projected') }),
          alert,
        )}`;
      }
      case 'exceeded':
        return alert.categoryId
          ? t('alerts.exceeded', { category: name, over: money('over') })
          : t('alerts.exceededOverall', { over: money('over') });
      case 'pace': {
        const base = alert.categoryId
          ? t('alerts.pace', {
              category: name,
              overBy: Number(alert.values.overBy ?? 0),
              projected: money('projected'),
            })
          : t('alerts.paceOverall', {
              overBy: Number(alert.values.overBy ?? 0),
              projected: money('projected'),
            });
        return withBreach(base, alert);
      }
      case 'unusual':
        return t('alerts.unusual', {
          amount: money('amount'),
          merchant: String(alert.values.merchant ?? ''),
          typical: money('typical'),
          category: name,
        });
      case 'renewal':
        return t('alerts.renewal', {
          count: Number(alert.values.count ?? 0),
          days: Number(alert.values.days ?? 0),
          total: money('total'),
        });
    }
  };

  return (
    <ul className="flex flex-col gap-2" aria-live="polite">
      {alerts.map((alert) => (
        <li
          key={alert.key}
          className={cx(
            'flex items-start gap-2.5 rounded-[var(--r-sm)] border py-2 ps-3 pe-1',
            LEVEL_STYLE[alert.level],
          )}
        >
          <span className="mt-0.5 shrink-0">
            <Icon name={LEVEL_ICON[alert.level]} size={16} />
          </span>
          <p className="text-body flex-1 py-0.5">{describe(alert)}</p>
          <IconButton
            icon="x"
            label={t('a11y.dismissAlert')}
            onClick={() => void dismissAlert(alert.key)}
            className="shrink-0"
          />
        </li>
      ))}
    </ul>
  );
}
