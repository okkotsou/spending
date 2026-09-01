/**
 * Budget health.
 *
 * One row per category with a limit, worst first. The bar carries a tick at
 * the even-pace position, so being ahead of schedule is visible without
 * reading a number, and the pace state is also written out in words.
 */
import type { BudgetStatus } from '@/domain/budget';
import { useApp } from '@/state/AppProvider';
import { useI18n } from '@/i18n';
import { formatMoney } from '@/lib/format';
import { categoryColor, categoryName } from '@/lib/category';
import { Icon } from './ui/Icon';
import { Progress, type ProgressTone } from './ui/primitives';
import { cx } from '@/lib/cx';

const PACE_TONE: Record<BudgetStatus['pace'], ProgressTone> = {
  on_track: 'accent',
  ahead: 'warn',
  over: 'over',
  no_limit: 'muted',
};

const PACE_TEXT: Record<BudgetStatus['pace'], string> = {
  on_track: 'text-ink-3',
  ahead: 'text-warn',
  over: 'text-over',
  no_limit: 'text-ink-3',
};

const PACE_LABEL = {
  on_track: 'pace.on_track',
  ahead: 'pace.ahead',
  over: 'pace.over',
  no_limit: 'pace.no_limit',
} as const;

export function BudgetHealthList({
  statuses,
  onSelect,
}: {
  statuses: BudgetStatus[];
  onSelect?: (categoryId: string) => void;
}) {
  const { categoryById } = useApp();
  const { t, locale, language } = useI18n();

  return (
    <ul className="flex flex-col">
      {statuses.map((status, index) => {
        const category = categoryById.get(status.categoryId);
        const name = categoryName(category, language, t('common.uncategorised'));
        const paceMarker = status.limit > 0 ? status.expected / status.limit : undefined;
        const body = (
          <>
            <div className="mb-1.5 flex items-baseline gap-2">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 self-center rounded-[var(--r-full)]"
                style={{ backgroundColor: categoryColor(category) }}
              />
              <span className="text-body text-ink min-w-0 flex-1 truncate text-start">{name}</span>
              <span className="num text-body text-ink shrink-0 font-medium">
                {formatMoney(status.spent, locale, { decimals: 'never' })}
              </span>
              <span className="num text-caption text-ink-3 shrink-0">
                {t('common.of')} {formatMoney(status.limit, locale, { decimals: 'never' })}
              </span>
            </div>
            <Progress
              value={status.limit > 0 ? status.spent / status.limit : 0}
              tone={PACE_TONE[status.pace]}
              marker={paceMarker}
              label={name}
            />
            <div className="mt-1.5 flex items-center gap-2">
              <span className={cx('text-caption inline-flex items-center gap-1', PACE_TEXT[status.pace])}>
                {status.pace === 'over' ? <Icon name="triangle-alert" size={12} /> : null}
                {status.pace === 'ahead' ? <Icon name="trending-up" size={12} /> : null}
                {t(PACE_LABEL[status.pace])}
              </span>
              <span className="num text-caption text-ink-3 ms-auto">
                {status.remaining >= 0
                  ? `${formatMoney(status.remaining, locale, { decimals: 'never' })} ${t('common.left')}`
                  : `${formatMoney(Math.abs(status.remaining), locale, { decimals: 'never' })} ${t('pace.over')}`}
              </span>
            </div>
            {status.rolloverIn > 0 ? (
              <p className="text-caption text-ink-3 mt-1">
                {t('budgets.rolloverIn', {
                  amount: formatMoney(status.rolloverIn, locale, { decimals: 'never' }),
                })}
              </p>
            ) : null}
          </>
        );

        return (
          <li key={status.categoryId} className={cx(index > 0 && 'hairline mt-3 pt-3')}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(status.categoryId)}
                className="hover:bg-sunken -mx-1.5 block w-full rounded-[var(--r-sm)] px-1.5 py-1 text-start transition-colors duration-[120ms]"
              >
                {body}
              </button>
            ) : (
              <div className="py-1">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
