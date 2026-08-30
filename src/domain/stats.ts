/**
 * Aggregations over the transaction ledger.
 *
 * One rule governs all of them: money that did not really leave the account
 * does not count. A refund cancels its charge, so both sides are excluded from
 * spending rather than netted, and an unconfirmed inflow contributes nothing
 * until the user confirms it.
 */
import { isIncomeKind, isOutflow, type Transaction } from '@/types';
import { dayIndex, dayStart, totalDays, type BudgetMonth } from './budgetMonth';

/** Counts toward spending: an outflow that has not been reversed. */
export function countsAsSpend(tx: Transaction): boolean {
  return isOutflow(tx.kind) && tx.reversedBy === undefined && !tx.pending;
}

/** Counts toward income: a confirmed inflow that is not a refund. */
export function countsAsIncome(tx: Transaction): boolean {
  return isIncomeKind(tx.kind) && !tx.pending;
}

export function inMonth(tx: Transaction, month: BudgetMonth): boolean {
  return tx.occurredAt >= month.start && tx.occurredAt < month.end;
}

export function totalSpend(txs: readonly Transaction[]): number {
  return txs.reduce((sum, tx) => (countsAsSpend(tx) ? sum + tx.amountSar : sum), 0);
}

export function totalIncome(txs: readonly Transaction[]): number {
  return txs.reduce((sum, tx) => (countsAsIncome(tx) ? sum + tx.amountSar : sum), 0);
}

export interface CategoryTotal {
  categoryId: string;
  amount: number;
  count: number;
}

export function spendByCategory(txs: readonly Transaction[]): CategoryTotal[] {
  const totals = new Map<string, CategoryTotal>();
  for (const tx of txs) {
    if (!countsAsSpend(tx)) continue;
    const current = totals.get(tx.categoryId) ?? { categoryId: tx.categoryId, amount: 0, count: 0 };
    current.amount += tx.amountSar;
    current.count += 1;
    totals.set(tx.categoryId, current);
  }
  return [...totals.values()].sort((a, b) => b.amount - a.amount);
}

export interface MerchantTotal {
  merchantKey: string;
  merchant: string;
  amount: number;
  count: number;
  categoryId: string;
}

export function topMerchants(txs: readonly Transaction[], limit: number): MerchantTotal[] {
  const totals = new Map<string, MerchantTotal>();
  for (const tx of txs) {
    if (!countsAsSpend(tx) || tx.merchantKey.length === 0) continue;
    const current = totals.get(tx.merchantKey) ?? {
      merchantKey: tx.merchantKey,
      merchant: tx.merchant,
      amount: 0,
      count: 0,
      categoryId: tx.categoryId,
    };
    current.amount += tx.amountSar;
    current.count += 1;
    totals.set(tx.merchantKey, current);
  }
  return [...totals.values()].sort((a, b) => b.amount - a.amount).slice(0, limit);
}

export interface DailyPoint {
  /** Local midnight of the day. */
  date: number;
  /** 0-based day index within the budget month. */
  day: number;
  /** Cumulative spend up to and including this day. */
  spent: number;
  /** Spend on this day alone. */
  daily: number;
  /** The ideal even-pace figure for this day, when a limit exists. */
  ideal?: number;
  /** False for days after today, so the line stops at the present. */
  elapsed: boolean;
}

/**
 * Cumulative daily spend across a budget month, with the even-pace line
 * overlaid when an overall limit is set. The series covers every day of the
 * period so the x axis does not stretch as the month fills up; days that have
 * not happened yet carry no cumulative value.
 */
export function dailySeries(
  txs: readonly Transaction[],
  month: BudgetMonth,
  now: number,
  limit?: number,
): DailyPoint[] {
  const days = totalDays(month);
  const perDay = new Array<number>(days).fill(0);
  for (const tx of txs) {
    if (!countsAsSpend(tx) || !inMonth(tx, month)) continue;
    const index = Math.min(days - 1, Math.max(0, dayIndex(month, tx.occurredAt)));
    perDay[index] = (perDay[index] ?? 0) + tx.amountSar;
  }

  const todayIndex = now < month.start ? -1 : Math.min(days - 1, dayIndex(month, now));
  let running = 0;
  return perDay.map((daily, index) => {
    const elapsed = index <= todayIndex;
    if (elapsed) running += daily;
    const point: DailyPoint = {
      date: dayStart(month, index),
      day: index + 1,
      spent: running,
      daily,
      elapsed,
    };
    if (limit !== undefined && limit > 0) point.ideal = (limit * (index + 1)) / days;
    return point;
  });
}

export interface MonthlyTotal {
  key: string;
  start: number;
  spent: number;
  income: number;
}

/** Totals for a list of budget months, oldest first. */
export function monthlyTotals(
  txs: readonly Transaction[],
  months: readonly BudgetMonth[],
): MonthlyTotal[] {
  return months.map((month) => {
    const rows = txs.filter((tx) => inMonth(tx, month));
    return {
      key: month.key,
      start: month.start,
      spent: totalSpend(rows),
      income: totalIncome(rows),
    };
  });
}

/**
 * Spend in the same category over the given months, used for pace comparisons
 * and for the limit suggester.
 */
export function categorySpendAcross(
  txs: readonly Transaction[],
  months: readonly BudgetMonth[],
  categoryId: string,
): number[] {
  return months.map((month) =>
    totalSpend(txs.filter((tx) => tx.categoryId === categoryId && inMonth(tx, month))),
  );
}

/**
 * Spend from the start of the given month up to the same point in the period
 * as `now` sits in its own month. This is what makes "versus the same point
 * last month" an honest comparison rather than a full month against a part one.
 */
export function spendToSamePoint(
  txs: readonly Transaction[],
  month: BudgetMonth,
  daysElapsed: number,
): number {
  const cutoff = dayStart(month, Math.min(daysElapsed, totalDays(month)));
  return totalSpend(txs.filter((tx) => tx.occurredAt >= month.start && tx.occurredAt < cutoff));
}
