/**
 * One line of the ledger.
 *
 * Three columns on every width: a category dot with the merchant and its meta,
 * the amount, and a chevron. The amount is end-aligned with tabular figures so
 * a column of them reads as a column. Reversed charges are struck through
 * rather than hidden, because the money did appear on the statement.
 */
import type { Category, Transaction } from '@/types';
import { isOutflow } from '@/types';
import { useI18n } from '@/i18n';
import { formatMoney, formatRelativeDate, formatTime } from '@/lib/format';
import { categoryColor, categoryName } from '@/lib/category';
import { Icon } from './ui/Icon';
import { Chip } from './ui/primitives';
import { cx } from '@/lib/cx';

export function TransactionRow({
  tx,
  category,
  onOpen,
  selectable = false,
  selected = false,
  onToggleSelect,
  now,
}: {
  tx: Transaction;
  category: Category | undefined;
  onOpen: (tx: Transaction) => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  now: number;
}) {
  const { t, locale, language } = useI18n();
  const outflow = isOutflow(tx.kind);
  const reversed = tx.reversedBy !== undefined;

  const amount = formatMoney(tx.amountSar, locale, { decimals: 'auto' });
  const dateLabel = formatRelativeDate(
    tx.occurredAt,
    locale,
    { today: t('common.today'), yesterday: t('common.yesterday') },
    now,
  );

  return (
    <div className={cx('flex items-stretch gap-1', selected && 'bg-sunken')}>
      {selectable ? (
        <label className="flex w-11 shrink-0 cursor-pointer items-center justify-center">
          <span className="sr-only">{t('a11y.selectRow')}</span>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect?.(tx.id)}
            className="accent-[var(--c-accent)] h-4 w-4"
          />
        </label>
      ) : null}
      <button
        type="button"
        onClick={() => onOpen(tx)}
        className="hover:bg-sunken flex min-h-[56px] flex-1 items-center gap-3 rounded-[var(--r-sm)] px-1.5 py-2 text-start transition-colors duration-[120ms]"
      >
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-[var(--r-full)]"
          style={{ backgroundColor: categoryColor(category) }}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span
              className={cx(
                'text-body text-ink truncate font-medium',
                reversed && 'line-through opacity-60',
              )}
              title={tx.merchant || t(`kind.${tx.kind}`)}
            >
              {tx.merchant || t(`kind.${tx.kind}`)}
            </span>
            {tx.needsReview ? (
              <span className="text-warn shrink-0" title={t('transactions.needsReview')}>
                <Icon name="circle-alert" size={13} />
              </span>
            ) : null}
          </span>
          <span className="text-caption text-ink-3 mt-0.5 flex flex-wrap items-center gap-x-1.5">
            <span>{categoryName(category, language, t('common.uncategorised'))}</span>
            <span aria-hidden="true">·</span>
            <span className="num">{dateLabel}</span>
            {tx.timeKnown ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="num">{formatTime(tx.occurredAt, locale)}</span>
              </>
            ) : null}
            {tx.last4 ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="num">••{tx.last4}</span>
              </>
            ) : null}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={cx(
              'num text-body font-medium',
              reversed && 'line-through opacity-60',
              outflow ? 'text-ink' : 'text-income',
            )}
          >
            {outflow ? '' : '+'}
            {amount}
          </span>
          {tx.pending ? (
            <Chip tone="warn">{t('transactions.pending')}</Chip>
          ) : reversed ? (
            <Chip tone="neutral">{t('transactions.reversed')}</Chip>
          ) : tx.reverses ? (
            <Chip tone="income">{t('transactions.reverses')}</Chip>
          ) : null}
        </span>
        <span className="text-ink-3 shrink-0 rtl:rotate-180">
          <Icon name="chevron-right" size={16} />
        </span>
      </button>
    </div>
  );
}
