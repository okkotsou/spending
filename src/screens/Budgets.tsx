/**
 * Budgets, income and recurring charges.
 *
 * A limit is only useful if setting it is easy, so the whole-month cap and
 * every category limit are edited in place on one screen, and the suggester
 * proposes figures from actual history that can be accepted or adjusted rather
 * than imposed.
 */
import { useMemo, useState, type KeyboardEvent } from 'react';
import type { Budget, IncomeSource } from '@/types';
import { useApp } from '@/state/AppProvider';
import { useI18n } from '@/i18n';
import { deleteIncomeSource, saveBudget, saveBudgets, saveIncomeSource } from '@/db/repo';
import { newId } from '@/lib/id';
import { recentBudgetMonths, shiftBudgetMonth } from '@/domain/budgetMonth';
import { categorySpendAcross, inMonth, spendByCategory, totalIncome, totalSpend } from '@/domain/stats';
import { computeStatus, compareByUrgency, rolloverFrom, suggestLimit } from '@/domain/budget';
import { estimatedMonthlyTotal } from '@/domain/recurring';
import { formatDayMonth, formatMoney } from '@/lib/format';
import { categoryColor, categoryName, sortCategories } from '@/lib/category';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Toggle,
} from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { BudgetHealthList } from '@/components/BudgetHealthList';

export function Budgets() {
  const app = useApp();
  const { t, locale, language } = useI18n();
  const [suggesting, setSuggesting] = useState(false);
  const [incomeOpen, setIncomeOpen] = useState(false);
  const [editingIncome, setEditingIncome] = useState<IncomeSource | undefined>(undefined);

  const monthRows = useMemo(
    () => app.transactions.filter((tx) => inMonth(tx, app.month)),
    [app.transactions, app.month],
  );
  const spentByCategory = useMemo(
    () => new Map(spendByCategory(monthRows).map((row) => [row.categoryId, row.amount])),
    [monthRows],
  );
  const spent = useMemo(() => totalSpend(monthRows), [monthRows]);
  const income = useMemo(() => totalIncome(monthRows), [monthRows]);

  const overallBudget = app.budgetById.get('overall');
  const overallStatus = overallBudget
    ? computeStatus('overall', spent, overallBudget, app.month, app.now)
    : undefined;

  const statuses = useMemo(
    () =>
      app.budgets
        .filter((budget) => budget.id !== 'overall' && budget.limit > 0)
        .map((budget) => {
          const previous = shiftBudgetMonth(app.month, -1, app.settings.budgetStartDay);
          const carried = budget.rollover
            ? rolloverFrom(
                computeStatus(
                  budget.id,
                  totalSpend(
                    app.transactions.filter(
                      (tx) => tx.categoryId === budget.id && inMonth(tx, previous),
                    ),
                  ),
                  budget,
                  previous,
                  app.now,
                ),
              )
            : 0;
          return computeStatus(
            budget.id,
            spentByCategory.get(budget.id) ?? 0,
            budget,
            app.month,
            app.now,
            carried,
          );
        })
        .sort(compareByUrgency),
    [app.budgets, app.transactions, app.month, app.now, app.settings.budgetStartDay, spentByCategory],
  );

  const expectedIncome = app.incomeSources
    .filter((source) => source.enabled)
    .reduce((sum, source) => sum + source.expected, 0);

  const suggestions = useMemo(() => {
    // The three completed budget months. The current one is excluded because a
    // month half-lived would suggest limits about half the size they should be.
    const completed = recentBudgetMonths(app.now, app.settings.budgetStartDay, 4).slice(0, 3);
    const propose = (months: typeof completed) =>
      app.categories
        .map((category) => ({
          categoryId: category.id,
          limit: suggestLimit(categorySpendAcross(app.transactions, months, category.id)),
        }))
        .filter((row) => row.limit > 0);

    const fromHistory = propose(completed);
    if (fromHistory.length > 0) return fromHistory;
    // A first month of use has no completed history. Proposing from what is
    // recorded so far beats offering nothing at all; the figures are editable.
    return propose([app.month]);
  }, [app.categories, app.transactions, app.now, app.settings.budgetStartDay, app.month]);

  const setLimit = (id: string, value: string) => {
    const parsed = Number.parseFloat(value.replace(',', '.'));
    const limit = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    const existing = app.budgetById.get(id);
    void saveBudget({ id, limit, rollover: existing?.rollover ?? false });
  };

  // Enter should save a limit; on a phone the keyboard's return key is the
  // natural way to finish, and waiting for a blur would silently lose it.
  const commitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
  };

  const setRollover = (id: string, rollover: boolean) => {
    const existing = app.budgetById.get(id);
    void saveBudget({ id, limit: existing?.limit ?? 0, rollover });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-title text-ink">{t('budgets.title')}</h1>
        <Button compact icon="wallet" onClick={() => setSuggesting(true)}>
          {t('budgets.suggest')}
        </Button>
      </div>

      <Card>
        <CardHeader
          title={t('budgets.overall')}
          meta={
            overallStatus
              ? `${formatMoney(overallStatus.spent, locale, { decimals: 'never' })} ${t('common.of')} ${formatMoney(overallStatus.limit, locale, { decimals: 'never' })}`
              : t('dashboard.noLimitSet')
          }
        />
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Field label={t('common.limit')} htmlFor="overall-limit">
              <Input
                key={`overall-${overallBudget?.limit ?? 0}`}
                id="overall-limit"
                inputMode="decimal"
                placeholder="0"
                defaultValue={overallBudget?.limit ? String(overallBudget.limit) : ''}
                onBlur={(event) => setLimit('overall', event.target.value)}
                onKeyDown={commitOnEnter}
              />
            </Field>
          </div>
          {overallStatus ? (
            <div className="pb-2.5">
              <span className="num text-caption text-ink-3">
                {formatMoney(overallStatus.safePerDay, locale, { decimals: 'never' })}{' '}
                {t('common.perDay')}
              </span>
            </div>
          ) : null}
        </div>
      </Card>

      {statuses.length > 0 ? (
        <Card>
          <CardHeader title={t('dashboard.budgetHealth')} />
          <BudgetHealthList statuses={statuses} />
        </Card>
      ) : null}

      <Card>
        <CardHeader title={t('budgets.perCategory')} />
        <ul className="flex flex-col">
          {sortCategories(app.categories).map((category, index) => {
            const budget = app.budgetById.get(category.id);
            const spent = spentByCategory.get(category.id) ?? 0;
            return (
              <li
                key={category.id}
                className={cx('flex items-center gap-3 py-2', index > 0 && 'hairline')}
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-[var(--r-full)]"
                  style={{ backgroundColor: categoryColor(category) }}
                />
                {/* The name and what has been spent stack, so the name keeps
                    the width it needs; on one line with the figure beside it,
                    half the Arabic names truncate to three letters. */}
                <div className="flex min-h-[38px] min-w-0 flex-1 flex-col justify-center">
                  <label
                    htmlFor={`limit-${category.id}`}
                    className="text-body text-ink block truncate"
                  >
                    {categoryName(category, language, t('common.uncategorised'))}
                  </label>
                  {/* A row of zeros carries no information; the fixed height
                      keeps the list even whether or not a figure is shown. */}
                  {spent > 0 ? (
                    <span className="num text-caption text-ink-3">
                      {formatMoney(spent, locale, { decimals: 'never' })}
                    </span>
                  ) : null}
                </div>
                <div className="w-[104px] shrink-0">
                  <Input
                    // Keyed on the stored limit so accepting the suggestions,
                    // which writes limits from elsewhere, refreshes the field.
                    key={`limit-${category.id}-${budget?.limit ?? 0}`}
                    id={`limit-${category.id}`}
                    inputMode="decimal"
                    placeholder={t('budgets.noLimit')}
                    defaultValue={budget?.limit ? String(budget.limit) : ''}
                    onBlur={(event) => setLimit(category.id, event.target.value)}
                    onKeyDown={commitOnEnter}
                    className="h-11 text-end"
                  />
                </div>
                <label
                  className={cx(
                    'flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-[var(--r-sm)]',
                    budget?.rollover ? 'text-accent bg-accent-soft' : 'text-ink-3 hover:bg-sunken',
                  )}
                  title={t('budgets.rollover')}
                >
                  <span className="sr-only">
                    {t('budgets.rolloverShort')} - {categoryName(category, language, '')}
                  </span>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={budget?.rollover ?? false}
                    onChange={(event) => setRollover(category.id, event.target.checked)}
                  />
                  <Icon name="rotate-ccw" size={16} />
                </label>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardHeader
          title={t('budgets.income.title')}
          meta={`${t('budgets.income.expected')}: ${formatMoney(expectedIncome, locale, { decimals: 'never' })} · ${t('budgets.income.detected')}: ${formatMoney(income, locale, { decimals: 'never' })}`}
          action={
            <Button
              compact
              icon="plus"
              onClick={() => {
                setEditingIncome(undefined);
                setIncomeOpen(true);
              }}
            >
              {t('budgets.income.add')}
            </Button>
          }
        />
        {app.incomeSources.length === 0 ? (
          <p className="text-body text-ink-3 py-4">{t('budgets.income.none')}</p>
        ) : (
          <ul className="flex flex-col">
            {app.incomeSources.map((source, index) => (
              <li key={source.id} className={cx('flex items-center gap-3 py-2', index > 0 && 'hairline')}>
                <button
                  type="button"
                  onClick={() => {
                    setEditingIncome(source);
                    setIncomeOpen(true);
                  }}
                  className="hover:bg-sunken flex min-h-11 flex-1 items-center gap-3 rounded-[var(--r-sm)] px-1.5 text-start"
                >
                  <span className="text-body text-ink min-w-0 flex-1 truncate">{source.name}</span>
                  <span className="num text-caption text-ink-3 shrink-0">
                    {t('budgets.income.day')} {source.dayOfMonth}
                  </span>
                  <span className="num text-body text-ink shrink-0 font-medium">
                    {formatMoney(source.expected, locale, { decimals: 'never' })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title={t('budgets.subscriptions.title')}
          meta={
            app.recurring.length > 0
              ? t('dashboard.subscriptionsTotal', {
                  amount: formatMoney(estimatedMonthlyTotal(app.recurring), locale, {
                    decimals: 'never',
                  }),
                  count: app.recurring.length,
                })
              : undefined
          }
        />
        {app.recurring.length === 0 ? (
          <p className="text-body text-ink-3 py-4">{t('budgets.subscriptions.none')}</p>
        ) : (
          <ul className="flex flex-col">
            {app.recurring.map((charge, index) => (
              <li key={charge.merchantKey} className={cx('flex items-center gap-3 py-2.5', index > 0 && 'hairline')}>
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-[var(--r-full)]"
                  style={{ backgroundColor: categoryColor(app.categoryById.get(charge.categoryId)) }}
                />
                <span className="min-w-0 flex-1">
                  <span className="text-body text-ink block truncate">{charge.merchant}</span>
                  <span className="text-caption text-ink-3">
                    {t('budgets.subscriptions.every', { days: Math.round(charge.periodDays) })} ·{' '}
                    {t('budgets.subscriptions.next', {
                      date: formatDayMonth(charge.nextEstimatedAt, locale),
                    })}
                  </span>
                </span>
                <span className="num text-body text-ink shrink-0 font-medium">
                  {formatMoney(charge.amount, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <SuggestSheet
        open={suggesting}
        onClose={() => setSuggesting(false)}
        suggestions={suggestions}
        onApply={(rows) => {
          const budgets: Budget[] = rows.map((row) => ({
            id: row.categoryId,
            limit: row.limit,
            rollover: app.budgetById.get(row.categoryId)?.rollover ?? false,
          }));
          void saveBudgets(budgets).then(() => {
            app.pushToast(t('budgets.saved'));
            setSuggesting(false);
          });
        }}
      />

      {incomeOpen ? (
        <IncomeSheet
          key={editingIncome?.id ?? 'new'}
          source={editingIncome}
          onClose={() => setIncomeOpen(false)}
        />
      ) : null}
    </div>
  );
}

function SuggestSheet({
  open,
  onClose,
  suggestions,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  suggestions: { categoryId: string; limit: number }[];
  onApply: (rows: { categoryId: string; limit: number }[]) => void;
}) {
  const { categoryById } = useApp();
  const { t, locale, language } = useI18n();
  const [edited, setEdited] = useState<Record<string, string>>({});

  const rows = suggestions.map((row) => {
    const raw = edited[row.categoryId];
    const parsed = raw === undefined ? row.limit : Number.parseFloat(raw.replace(',', '.'));
    return { categoryId: row.categoryId, limit: Number.isFinite(parsed) && parsed > 0 ? parsed : 0 };
  });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('budgets.suggest')}
      description={t('budgets.suggestHint')}
      footer={
        suggestions.length > 0 ? (
          <Button variant="primary" block onClick={() => onApply(rows.filter((row) => row.limit > 0))}>
            {t('budgets.suggestApply')}
          </Button>
        ) : (
          <Button block onClick={onClose}>
            {t('action.close')}
          </Button>
        )
      }
    >
      {suggestions.length === 0 ? (
        <EmptyState
          icon="wallet"
          title={t('budgets.suggestNone')}
          body={t('budgets.suggestNoneBody')}
          action={
            <Button variant="primary" onClick={onClose}>
              {t('action.close')}
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col">
          {suggestions.map((row, index) => (
            <li
              key={row.categoryId}
              className={cx('flex items-center gap-3 py-2.5', index > 0 && 'hairline')}
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-[var(--r-full)]"
                style={{ backgroundColor: categoryColor(categoryById.get(row.categoryId)) }}
              />
              <label
                htmlFor={`suggest-${row.categoryId}`}
                className="text-body text-ink min-w-0 flex-1 truncate"
              >
                {categoryName(categoryById.get(row.categoryId), language, t('common.uncategorised'))}
              </label>
              <div className="w-[112px] shrink-0">
                <Input
                  id={`suggest-${row.categoryId}`}
                  inputMode="decimal"
                  defaultValue={String(row.limit)}
                  onChange={(event) =>
                    setEdited((current) => ({ ...current, [row.categoryId]: event.target.value }))
                  }
                  className="text-end"
                />
              </div>
              <span className="num text-caption text-ink-3 sr-only">
                {formatMoney(row.limit, locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

/** Mounted only while open, so its fields start from the source it edits. */
function IncomeSheet({
  source,
  onClose,
}: {
  source: IncomeSource | undefined;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(source?.name ?? '');
  const [amount, setAmount] = useState(source ? String(source.expected) : '');
  const [day, setDay] = useState(String(source?.dayOfMonth ?? 1));
  const [enabled, setEnabled] = useState(source?.enabled ?? true);

  const submit = () => {
    const parsed = Number.parseFloat(amount.replace(',', '.'));
    const dayValue = Math.min(31, Math.max(1, Number.parseInt(day, 10) || 1));
    void saveIncomeSource({
      id: source?.id ?? newId(),
      name: name.trim() || t('budgets.income.title'),
      expected: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
      dayOfMonth: dayValue,
      enabled,
    }).then(onClose);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={source ? t('action.edit') : t('budgets.income.add')}
      footer={
        <div className="flex gap-2">
          {source ? (
            <Button
              variant="danger"
              icon="trash"
              onClick={() => void deleteIncomeSource(source.id).then(onClose)}
            >
              {t('action.delete')}
            </Button>
          ) : null}
          <Button variant="primary" className="flex-1" onClick={submit}>
            {t('action.save')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('budgets.income.name')} htmlFor="income-name">
          <Input id="income-name" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('budgets.income.amount')} htmlFor="income-amount">
            <Input
              id="income-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </Field>
          <Field label={t('budgets.income.day')} htmlFor="income-day">
            <Input
              id="income-day"
              inputMode="numeric"
              min={1}
              max={31}
              type="number"
              value={day}
              onChange={(event) => setDay(event.target.value)}
            />
          </Field>
        </div>
        <Toggle
          id="income-enabled"
          checked={enabled}
          onChange={setEnabled}
          label={t('budgets.income.enabled')}
        />
      </div>
    </Sheet>
  );
}
