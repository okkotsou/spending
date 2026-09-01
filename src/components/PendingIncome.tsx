/**
 * Incoming money that has arrived but is not yet counted.
 *
 * A transfer from a person, a salary, a deposit: all of it is held until the
 * user confirms it, so a misread message cannot inflate the figure everything
 * else leans on. That guard is right, but hiding the money behind a count chip
 * was not: the amount, who sent it and the confirm action all belong on the
 * dashboard, where a person looks for money that arrived.
 */
import type { Transaction } from '@/types';
import { useApp } from '@/state/AppProvider';
import { useI18n } from '@/i18n';
import { confirmPending } from '@/db/repo';
import { formatMoney, formatRelativeDate } from '@/lib/format';
import { Icon } from './ui/Icon';
import { Button, Card, CardHeader, Figure } from './ui/primitives';
import { cx } from '@/lib/cx';

export function PendingIncome({ rows }: { rows: Transaction[] }) {
  const { now, pushToast } = useApp();
  const { t, locale } = useI18n();

  if (rows.length === 0) return null;

  const total = rows.reduce((sum, tx) => sum + tx.amountSar, 0);
  const confirm = (ids: string[]) => {
    void confirmPending(ids).then(() => pushToast(t('transactions.confirmed')));
  };

  return (
    <Card className="border-income/30 bg-income-soft">
      <CardHeader
        title={
          <span className="text-income inline-flex items-center gap-2">
            <Icon name="arrow-down-left" size={16} />
            {t('dashboard.pendingIncomeTitle')}
          </span>
        }
        meta={t('dashboard.pendingIncomeBody')}
        action={
          rows.length > 1 ? (
            <Button compact variant="primary" onClick={() => confirm(rows.map((tx) => tx.id))}>
              {t('action.confirmAll')}
            </Button>
          ) : null
        }
      />
      <ul className="flex flex-col">
        {rows.map((tx, index) => (
          <li
            key={tx.id}
            className={cx(
              'flex flex-wrap items-center gap-x-3 gap-y-2 py-2',
              index > 0 && 'border-income/20 border-t',
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="text-body text-ink block truncate font-medium">
                {tx.merchant || t(`kind.${tx.kind}`)}
              </span>
              <span className="text-caption text-ink-3">
                {t(`kind.${tx.kind}`)}
                {' · '}
                <span className="num">
                  {formatRelativeDate(
                    tx.occurredAt,
                    locale,
                    { today: t('common.today'), yesterday: t('common.yesterday') },
                    now,
                  )}
                </span>
              </span>
            </span>
            <Figure
              size="body"
              tone="income"
              value={`+${formatMoney(tx.amountSar, locale)}`}
              className="shrink-0"
            />
            <Button
              compact
              variant={rows.length > 1 ? 'secondary' : 'primary'}
              onClick={() => confirm([tx.id])}
              className="shrink-0"
            >
              {t('transactions.confirmIncome')}
            </Button>
          </li>
        ))}
      </ul>
      {rows.length > 1 ? (
        <p className="border-income/20 num text-caption text-income mt-2 border-t pt-2">
          {formatMoney(total, locale)}
        </p>
      ) : null}
    </Card>
  );
}
