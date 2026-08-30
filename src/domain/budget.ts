/**
 * Budget limits, pace, and what is safe to spend.
 *
 * The pace model is deliberately simple and explainable: a limit is spread
 * evenly across the days of the budget month, and the question at any moment is
 * whether actual spend is ahead of that line. A projection is the current daily
 * rate carried forward to the end of the period. Nothing here is a forecast in
 * the statistical sense, and the UI never presents it as one.
 */
import type { Budget } from '@/types';
import {
  daysRemaining,
  dayIndex,
  elapsedFraction,
  totalDays,
  type BudgetMonth,
} from './budgetMonth';

export type PaceState = 'no_limit' | 'on_track' | 'ahead' | 'over';

/** Spending must exceed the ideal pace by this much before it is called out. */
export const PACE_TOLERANCE = 0.25;
/** The share of a limit that triggers the approaching-limit alert. */
export const APPROACHING_THRESHOLD = 0.8;

export interface BudgetStatus {
  categoryId: string;
  /** The effective limit, including any rollover carried in. */
  limit: number;
  /** The limit as configured, before rollover. */
  baseLimit: number;
  /** Unused budget carried in from the previous month, zero when disabled. */
  rolloverIn: number;
  spent: number;
  remaining: number;
  /** Spent divided by limit; can exceed 1. Zero when there is no limit. */
  ratio: number;
  /** What an even pace would have spent by now. */
  expected: number;
  pace: PaceState;
  /** Current daily rate carried to the end of the period. */
  projectedTotal: number;
  /** When the limit is projected to be reached, or undefined if it is not. */
  projectedBreachAt?: number;
  /** Remaining budget divided by days left, floored at zero. */
  safePerDay: number;
  daysLeft: number;
}

export function computeStatus(
  categoryId: string,
  spent: number,
  budget: Budget | undefined,
  month: BudgetMonth,
  now: number,
  rolloverIn = 0,
): BudgetStatus {
  const baseLimit = budget?.limit ?? 0;
  const limit = baseLimit > 0 ? baseLimit + rolloverIn : 0;
  const daysLeft = daysRemaining(month, now);
  const days = totalDays(month);
  const elapsed = elapsedFraction(month, now);
  const daysElapsed = Math.max(1, Math.min(days, dayIndex(month, now) + 1));
  const rate = spent / daysElapsed;
  const projectedTotal = rate * days;

  if (limit <= 0) {
    return {
      categoryId,
      limit: 0,
      baseLimit,
      rolloverIn,
      spent,
      remaining: 0,
      ratio: 0,
      expected: 0,
      pace: 'no_limit',
      projectedTotal,
      safePerDay: 0,
      daysLeft,
    };
  }

  const expected = limit * elapsed;
  const remaining = limit - spent;
  const ratio = spent / limit;

  let pace: PaceState = 'on_track';
  if (spent > limit) pace = 'over';
  else if (expected > 0 && spent > expected * (1 + PACE_TOLERANCE)) pace = 'ahead';

  const status: BudgetStatus = {
    categoryId,
    limit,
    baseLimit,
    rolloverIn,
    spent,
    remaining,
    ratio,
    expected,
    pace,
    projectedTotal,
    safePerDay: daysLeft > 0 ? Math.max(0, remaining) / daysLeft : 0,
    daysLeft,
  };

  // The day the limit runs out if the current rate holds. Only meaningful
  // while the limit still has room and money is actually being spent.
  if (spent <= limit && rate > 0) {
    const daysToBreach = remaining / rate;
    const breachDayIndex = daysElapsed + daysToBreach;
    if (breachDayIndex <= days) {
      status.projectedBreachAt = month.start + breachDayIndex * 86_400_000;
    }
  }

  return status;
}

/** Urgency ordering for the budget health list: worst first. */
export function urgencyRank(status: BudgetStatus): number {
  switch (status.pace) {
    case 'over':
      return 0;
    case 'ahead':
      return 1;
    case 'on_track':
      return 2;
    case 'no_limit':
      return 3;
  }
}

export function compareByUrgency(a: BudgetStatus, b: BudgetStatus): number {
  const rank = urgencyRank(a) - urgencyRank(b);
  if (rank !== 0) return rank;
  if (a.limit > 0 && b.limit > 0) return b.ratio - a.ratio;
  return b.spent - a.spent;
}

/**
 * Suggests a limit from recent history: the mean of the months that had any
 * spending, rounded up to a tidy figure so the number reads like a decision
 * rather than an average. Months with no spending are excluded, otherwise a
 * newly used category would be given an artificially low limit.
 */
export function suggestLimit(history: readonly number[]): number {
  const used = history.filter((value) => value > 0);
  if (used.length === 0) return 0;
  const mean = used.reduce((sum, value) => sum + value, 0) / used.length;
  return roundLimit(mean * 1.05);
}

/** Rounds to a figure a person would actually choose. */
export function roundLimit(value: number): number {
  if (value <= 0) return 0;
  if (value < 100) return Math.ceil(value / 10) * 10;
  if (value < 1000) return Math.ceil(value / 50) * 50;
  if (value < 5000) return Math.ceil(value / 100) * 100;
  return Math.ceil(value / 500) * 500;
}

/**
 * Budget carried into the next month for a category with rollover enabled:
 * whatever was left unspent, never negative. An overspend is not carried
 * forward as a debt, because a punitive second month is not what the setting
 * is for.
 */
export function rolloverFrom(previous: BudgetStatus | undefined): number {
  if (!previous || previous.limit <= 0) return 0;
  return Math.max(0, previous.baseLimit - previous.spent);
}
