/**
 * Plain-language observations.
 *
 * Every insight is a deterministic reading of the ledger with an explicit
 * threshold, so it can be checked by hand and never says anything the numbers
 * do not support. Insights carry values, not sentences; the wording lives in
 * the translation table so both languages read naturally.
 */
import type { Transaction } from '@/types';
import type { BudgetMonth } from './budgetMonth';
import { daysRemaining, dayIndex, totalDays } from './budgetMonth';
import { countsAsSpend, inMonth, spendByCategory, totalSpend } from './stats';
import { renewingSoon, type RecurringCharge } from './recurring';

export type InsightKind =
  | 'category_up'
  | 'category_down'
  | 'renewals_due'
  | 'largest_category'
  | 'pace_vs_last_month'
  | 'quiet_days'
  | 'no_data';

export interface Insight {
  id: string;
  kind: InsightKind;
  /** 'over' reads as a warning, 'income' as a good outcome, 'info' as neutral. */
  tone: 'info' | 'warn' | 'good';
  values: Record<string, string | number>;
  categoryId?: string;
}

/** A category has to move by this much before it is worth mentioning. */
export const TREND_THRESHOLD = 0.25;
/** And spend at least this much, so a rise from 4 to 9 riyals stays quiet. */
export const TREND_MIN_AMOUNT = 100;

export interface InsightInput {
  now: number;
  month: BudgetMonth;
  previousMonths: readonly BudgetMonth[];
  transactions: readonly Transaction[];
  recurring: readonly RecurringCharge[];
  /** Spend in the previous budget month up to the same day index. */
  previousSpendToDate: number;
  currentSpend: number;
}

export function buildInsights(input: InsightInput): Insight[] {
  const out: Insight[] = [];
  const monthRows = input.transactions.filter((tx) => inMonth(tx, input.month));

  if (monthRows.filter(countsAsSpend).length === 0) {
    return [{ id: 'no_data', kind: 'no_data', tone: 'info', values: {} }];
  }

  // Category movement against the mean of the completed comparison months.
  const current = spendByCategory(monthRows);
  for (const row of current.slice(0, 6)) {
    if (row.amount < TREND_MIN_AMOUNT) continue;
    const history = input.previousMonths.map((month) =>
      totalSpend(
        input.transactions.filter((tx) => tx.categoryId === row.categoryId && inMonth(tx, month)),
      ),
    );
    const used = history.filter((value) => value > 0);
    if (used.length < 2) continue;
    const average = used.reduce((sum, value) => sum + value, 0) / used.length;
    if (average <= 0) continue;
    const change = (row.amount - average) / average;
    if (Math.abs(change) < TREND_THRESHOLD) continue;
    out.push({
      id: `trend:${row.categoryId}`,
      kind: change > 0 ? 'category_up' : 'category_down',
      tone: change > 0 ? 'warn' : 'good',
      categoryId: row.categoryId,
      values: {
        percent: Math.round(Math.abs(change) * 100),
        amount: row.amount,
        average,
        months: used.length,
      },
    });
  }

  // Renewals inside the next week.
  const soon = renewingSoon(input.recurring, input.now, 7);
  if (soon.length > 0) {
    out.push({
      id: 'renewals',
      kind: 'renewals_due',
      tone: 'info',
      values: {
        count: soon.length,
        total: soon.reduce((sum, charge) => sum + charge.amount, 0),
        days: 7,
      },
    });
  }

  // Where the money actually went this month.
  const top = current[0];
  if (top && input.currentSpend > 0) {
    out.push({
      id: 'largest',
      kind: 'largest_category',
      tone: 'info',
      categoryId: top.categoryId,
      values: {
        amount: top.amount,
        share: Math.round((top.amount / input.currentSpend) * 100),
      },
    });
  }

  // Same point last month.
  if (input.previousSpendToDate > 0) {
    const change = (input.currentSpend - input.previousSpendToDate) / input.previousSpendToDate;
    if (Math.abs(change) >= 0.1) {
      out.push({
        id: 'vs_last_month',
        kind: 'pace_vs_last_month',
        tone: change > 0 ? 'warn' : 'good',
        values: {
          percent: Math.round(Math.abs(change) * 100),
          direction: change > 0 ? 'up' : 'down',
          previous: input.previousSpendToDate,
          current: input.currentSpend,
        },
      });
    }
  }

  // Days with no spending at all, which is worth knowing when a limit is tight.
  const days = Math.min(totalDays(input.month), dayIndex(input.month, input.now) + 1);
  if (days >= 7) {
    const spentDays = new Set(
      monthRows
        .filter(countsAsSpend)
        .map((tx) => dayIndex(input.month, tx.occurredAt)),
    );
    const quiet = days - spentDays.size;
    if (quiet >= 3) {
      out.push({
        id: 'quiet_days',
        kind: 'quiet_days',
        tone: 'good',
        values: { days: quiet, of: days, left: daysRemaining(input.month, input.now) },
      });
    }
  }

  return out;
}
