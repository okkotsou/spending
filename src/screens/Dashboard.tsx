/**
 * The dashboard.
 *
 * Answers "how am I doing this month" in the first screenful: the figure, the
 * comparison, what is safe to spend, then anything that needs attention. The
 * detail follows underneath in descending order of how often it is wanted.
 *
 * The layout is deliberately asymmetric. A grid of identical cards would make
 * every fact look equally important, and they are not.
 */
import { useMemo } from 'react';
import { useApp } from '@/state/AppProvider';
import { useI18n } from '@/i18n';
import { navigate } from '@/state/router';
import {
  dailySeries,
  inMonth,
  monthlyTotals,
  spendByCategory,
  incomeByKind,
  spendToSamePoint,
  topMerchants,
  totalIncome,
  totalSpend,
} from '@/domain/stats';
import { compareByUrgency, computeStatus, rolloverFrom, type BudgetStatus } from '@/domain/budget';
import { dayIndex, daysRemaining, shiftBudgetMonth, totalDays } from '@/domain/budgetMonth';
import { buildInsights } from '@/domain/insights';
import { estimatedMonthlyTotal } from '@/domain/recurring';
import { formatMoney, formatMonthLong } from '@/lib/format';
import { categoryName } from '@/lib/category';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Figure,
  Label,
  Select,
} from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { Icon } from '@/components/ui/Icon';
import { AlertList } from '@/components/AlertList';
import { PendingIncome } from '@/components/PendingIncome';
import { BudgetHealthList } from '@/components/BudgetHealthList';
import { PaceChart } from '@/components/charts/PaceChart';
import { CategoryDonut } from '@/components/charts/CategoryDonut';
import { TrendBars } from '@/components/charts/TrendBars';
import { PERIOD_IDS, PERIOD_LABELS, usePeriod, type PeriodId } from './usePeriod';

export function Dashboard() {
  const app = useApp();
  const { t, locale, language } = useI18n();
  const { period, periodId, setPeriodId } = usePeriod(app.now, app.settings.budgetStartDay);

  const rows = useMemo(
    () =>
      app.transactions.filter(
        (tx) => tx.occurredAt >= period.start && tx.occurredAt < period.end,
      ),
    [app.transactions, period.start, period.end],
  );

  const spent = useMemo(() => totalSpend(rows), [rows]);
  const income = useMemo(() => totalIncome(rows), [rows]);
  const breakdown = useMemo(() => spendByCategory(rows), [rows]);
  const merchants = useMemo(() => topMerchants(rows, 6), [rows]);

  // A single-month view still shows a twelve-month trend for context; a
  // multi-month view charts exactly the months it covers.
  const trendMonths = useMemo(() => {
    if (period.months.length > 1) return period.months;
    const months = [];
    for (let back = 11; back >= 0; back -= 1) {
      months.push(shiftBudgetMonth(app.month, -back, app.settings.budgetStartDay));
    }
    return months;
  }, [period.months, app.month, app.settings.budgetStartDay]);
  const trends = useMemo(
    () => monthlyTotals(app.transactions, trendMonths),
    [app.transactions, trendMonths],
  );

  // Budget status is only defined against a single budget month.
  const statuses = useMemo<BudgetStatus[]>(() => {
    if (!period.month) return [];
    const month = period.month;
    const spentBy = new Map(breakdown.map((row) => [row.categoryId, row.amount]));
    return app.budgets
      .filter((budget) => budget.id !== 'overall')
      .map((budget) => {
        const carried = budget.rollover
          ? rolloverFrom(
              computeStatus(
                budget.id,
                totalSpend(
                  app.transactions.filter(
                    (tx) =>
                      tx.categoryId === budget.id &&
                      inMonth(tx, shiftBudgetMonth(month, -1, app.settings.budgetStartDay)),
                  ),
                ),
                budget,
                shiftBudgetMonth(month, -1, app.settings.budgetStartDay),
                app.now,
              ),
            )
          : 0;
        return computeStatus(
          budget.id,
          spentBy.get(budget.id) ?? 0,
          budget,
          month,
          app.now,
          carried,
        );
      })
      .sort(compareByUrgency);
  }, [app.budgets, app.transactions, app.now, app.settings.budgetStartDay, breakdown, period.month]);

  const overallBudget = app.budgetById.get('overall');
  const overall = useMemo(
    () =>
      period.month && overallBudget
        ? computeStatus('overall', spent, overallBudget, period.month, app.now)
        : undefined,
    [period.month, overallBudget, spent, app.now],
  );

  const series = useMemo(
    () =>
      period.month
        ? dailySeries(rows, period.month, app.now, overallBudget?.limit)
        : [],
    [rows, period.month, app.now, overallBudget?.limit],
  );

  // Same point last month: compares like with like rather than a part month
  // against a whole one.
  const comparison = useMemo(() => {
    if (!period.month) return undefined;
    const previous = shiftBudgetMonth(period.month, -1, app.settings.budgetStartDay);
    const elapsed = Math.min(
      totalDays(period.month),
      dayIndex(period.month, app.now) + 1,
    );
    const before = spendToSamePoint(app.transactions, previous, elapsed);
    if (before <= 0) return undefined;
    return { before, change: (spent - before) / before };
  }, [period.month, app.settings.budgetStartDay, app.transactions, app.now, spent]);

  const insights = useMemo(() => {
    const month = period.month;
    if (!month) return [];
    const previousMonths = [1, 2, 3].map((back) =>
      shiftBudgetMonth(month, -back, app.settings.budgetStartDay),
    );
    return buildInsights({
      now: app.now,
      month,
      previousMonths,
      transactions: app.transactions,
      recurring: app.recurring,
      previousSpendToDate: comparison?.before ?? 0,
      currentSpend: spent,
    });
  }, [period.month, app.settings.budgetStartDay, app.now, app.transactions, app.recurring, comparison, spent]);

  // Held inflows are shown in full on the dashboard, so money that arrived is
  // never invisible; they are drawn from the whole ledger rather than the
  // selected period, because an unconfirmed amount is outstanding regardless of
  // which month you happen to be looking at.
  const pendingIncome = useMemo(
    () => app.transactions.filter((tx) => tx.pending).sort((a, b) => b.occurredAt - a.occurredAt),
    [app.transactions],
  );
  const incomeSlices = useMemo(() => incomeByKind(rows), [rows]);
  const reviewCount = app.transactions.filter((tx) => tx.needsReview).length;
  const unreadCount = app.unparsed.length;

  if (app.transactions.length === 0 && app.unparsed.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="inbox"
          title={t('dashboard.empty.title')}
          body={t('dashboard.empty.body')}
          action={
            <Button variant="primary" icon="plus" onClick={() => navigate('add')}>
              {t('dashboard.empty.action')}
            </Button>
          }
        />
      </Card>
    );
  }

  const daysLeft = period.month ? daysRemaining(period.month, app.now) : 0;
  const safeToSpend = overall?.safePerDay ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-title text-ink">
          {period.month ? formatMonthLong(period.month.labelDate.getTime(), locale) : t(PERIOD_LABELS[periodId])}
        </h1>
        <div className="w-[152px]">
          <Select
            aria-label={t('common.period')}
            value={periodId}
            onChange={(event) => setPeriodId(event.target.value as PeriodId)}
            className="h-9 text-caption"
          >
            {PERIOD_IDS.map((id) => (
              <option key={id} value={id}>
                {t(PERIOD_LABELS[id])}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Headline */}
      <Card>
        <Label>{t('dashboard.spent')}</Label>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Figure size="display" value={formatMoney(spent, locale, { decimals: 'never' })} />
          {comparison ? (
            <span
              className={cx(
                'text-caption inline-flex items-center gap-1',
                Math.abs(comparison.change) < 0.02
                  ? 'text-ink-3'
                  : comparison.change > 0
                    ? 'text-over'
                    : 'text-income',
              )}
            >
              {Math.abs(comparison.change) < 0.02 ? null : (
                <Icon name={comparison.change > 0 ? 'trending-up' : 'trending-down'} size={13} />
              )}
              {Math.abs(comparison.change) < 0.02
                ? t('dashboard.vsLastMonthFlat')
                : t('dashboard.vsLastMonth', {
                    percent: Math.round(Math.abs(comparison.change) * 100),
                    direction: t(
                      comparison.change > 0 ? 'dashboard.direction.up' : 'dashboard.direction.down',
                    ),
                  })}
            </span>
          ) : null}
        </div>

        <dl className="border-line mt-4 grid grid-cols-3 gap-3 border-t pt-3">
          <div>
            <dt className="text-caption text-ink-3">{t('dashboard.income')}</dt>
            <dd className="mt-0.5">
              <Figure size="body" tone="income" value={formatMoney(income, locale, { decimals: 'never' })} />
            </dd>
          </div>
          <div>
            <dt className="text-caption text-ink-3">{t('dashboard.net')}</dt>
            <dd className="mt-0.5">
              <Figure
                size="body"
                tone={income - spent < 0 ? 'over' : 'ink'}
                value={formatMoney(income - spent, locale, { decimals: 'never', sign: true })}
              />
            </dd>
          </div>
          <div>
            <dt className="text-caption text-ink-3">{t('dashboard.safeToSpend')}</dt>
            <dd className="mt-0.5">
              {overall && period.month ? (
                <Figure
                  size="body"
                  tone={overall.pace === 'over' ? 'over' : 'ink'}
                  value={formatMoney(safeToSpend, locale, { decimals: 'never' })}
                />
              ) : (
                <span className="text-caption text-ink-3">{t('dashboard.noLimitSet')}</span>
              )}
            </dd>
          </div>
        </dl>
        {/* A salary and a transfer from a person are both money in, but they
            are not the same fact; name them once there is more than one. */}
        {incomeSlices.length > 1 ? (
          <p className="text-caption text-ink-3 mt-2">
            {incomeSlices
              .map(
                (slice) =>
                  `${t(`kind.${slice.kind}`)} ${formatMoney(slice.amount, locale, { decimals: 'never' })}`,
              )
              .join(' · ')}
          </p>
        ) : null}
        {overall && period.month && daysLeft > 0 ? (
          <p className="text-caption text-ink-3 mt-2">
            {t('dashboard.safeToSpendPerDay', {
              amount: formatMoney(safeToSpend, locale, { decimals: 'never' }),
              count: daysLeft,
            })}
          </p>
        ) : null}
      </Card>

      {app.alerts.length > 0 ? <AlertList alerts={app.alerts.slice(0, 4)} /> : null}

      <PendingIncome rows={pendingIncome} />

      {(reviewCount > 0 || unreadCount > 0) && (
        <div className="flex flex-wrap gap-2">
          {reviewCount > 0 ? (
            <Button compact icon="circle-alert" onClick={() => navigate('transactions', { view: 'review' })}>
              {t('dashboard.needsReview', { count: reviewCount })}
            </Button>
          ) : null}
          {unreadCount > 0 ? (
            <Button compact icon="inbox" onClick={() => navigate('transactions', { view: 'unread' })}>
              {t('dashboard.unrecognised', { count: unreadCount })}
            </Button>
          ) : null}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-12">
        {/* Pace, or trends when the period spans several months */}
        <Card className="xl:col-span-8">
          {period.month ? (
            <>
              <CardHeader title={t('dashboard.spendingOverTime')} />
              {spent > 0 ? (
                <PaceChart data={series} />
              ) : (
                <p className="text-body text-ink-3 py-8">{t('dashboard.noSpend')}</p>
              )}
            </>
          ) : (
            <>
              <CardHeader title={t('dashboard.trends')} />
              <TrendBars data={trends} height={220} />
            </>
          )}
        </Card>

        {/* Budget health */}
        <Card className="xl:col-span-4">
          <CardHeader
            title={t('dashboard.budgetHealth')}
            action={
              statuses.length > 0 ? (
                <Button compact variant="ghost" onClick={() => navigate('budgets')}>
                  {t('action.edit')}
                </Button>
              ) : null
            }
          />
          {statuses.length > 0 ? (
            <BudgetHealthList
              statuses={statuses}
              onSelect={(categoryId) => navigate('transactions', { category: categoryId })}
            />
          ) : (
            <EmptyState
              icon="wallet"
              title={t('dashboard.noBudgets')}
              body={t('budgets.suggestHint')}
              action={
                <Button variant="primary" onClick={() => navigate('budgets')}>
                  {t('dashboard.noBudgetsAction')}
                </Button>
              }
            />
          )}
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title={t('dashboard.breakdown')} />
          {breakdown.length > 0 ? (
            <CategoryDonut
              totals={breakdown}
              categoryById={app.categoryById}
              total={spent}
              onSelect={(categoryId) => navigate('transactions', { category: categoryId })}
            />
          ) : (
            <p className="text-body text-ink-3 py-8">{t('dashboard.noSpend')}</p>
          )}
        </Card>

        <Card>
          <CardHeader title={t('dashboard.topMerchants')} />
          {merchants.length > 0 ? (
            <ul className="flex flex-col">
              {merchants.map((row, index) => (
                <li
                  key={row.merchantKey}
                  className={cx('flex items-center gap-3 py-2', index > 0 && 'hairline')}
                >
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-[var(--r-full)]"
                    style={{ backgroundColor: app.categoryById.get(row.categoryId)?.color }}
                  />
                  <span className="text-body text-ink min-w-0 flex-1 truncate">{row.merchant}</span>
                  <span className="num text-caption text-ink-3 shrink-0">{row.count}</span>
                  <span className="num text-body text-ink shrink-0 font-medium">
                    {formatMoney(row.amount, locale, { decimals: 'never' })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body text-ink-3 py-8">{t('dashboard.noSpend')}</p>
          )}
        </Card>
      </div>

      {period.month ? (
        <Card>
          <CardHeader title={t('dashboard.trends')} />
          <TrendBars data={trends} activeKey={period.month.key} />
        </Card>
      ) : null}

      {app.recurring.length > 0 ? (
        <Card>
          <CardHeader
            title={t('dashboard.subscriptions')}
            meta={t('dashboard.subscriptionsTotal', {
              amount: formatMoney(estimatedMonthlyTotal(app.recurring), locale, { decimals: 'never' }),
              count: app.recurring.length,
            })}
            action={
              <Button compact variant="ghost" onClick={() => navigate('budgets')}>
                {t('action.more')}
              </Button>
            }
          />
          <ul className="flex flex-col">
            {app.recurring.slice(0, 4).map((charge, index) => (
              <li
                key={charge.merchantKey}
                className={cx('flex items-center gap-3 py-2', index > 0 && 'hairline')}
              >
                <span className="text-ink-3 shrink-0">
                  <Icon name="repeat" size={14} />
                </span>
                <span className="text-body text-ink min-w-0 flex-1 truncate">{charge.merchant}</span>
                <span className="num text-body text-ink shrink-0 font-medium">
                  {formatMoney(charge.amount, locale)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {insights.length > 0 ? (
        <Card>
          <CardHeader title={t('dashboard.insights')} />
          <ul className="flex flex-col gap-2">
            {insights.map((insight) => {
              const category = insight.categoryId
                ? app.categoryById.get(insight.categoryId)
                : undefined;
              const money = (key: string) => formatMoney(Number(insight.values[key] ?? 0), locale);
              const values: Record<string, string | number> = {
                ...insight.values,
                category: categoryName(category, language, t('common.uncategorised')),
                total: money('total'),
                amount: money('amount'),
                average: money('average'),
                direction: t(
                  insight.values.direction === 'up'
                    ? 'dashboard.direction.up'
                    : 'dashboard.direction.down',
                ),
              };
              return (
                <li key={insight.id} className="flex items-start gap-2.5">
                  <span
                    className={cx(
                      'mt-1 shrink-0',
                      insight.tone === 'warn' ? 'text-warn' : insight.tone === 'good' ? 'text-income' : 'text-ink-3',
                    )}
                  >
                    <Icon
                      name={
                        insight.kind === 'category_up'
                          ? 'trending-up'
                          : insight.kind === 'category_down'
                            ? 'trending-down'
                            : insight.kind === 'renewals_due'
                              ? 'repeat'
                              : 'info'
                      }
                      size={14}
                    />
                  </span>
                  <p className="text-body text-ink-2">{t(`insight.${insight.kind}`, values)}</p>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
