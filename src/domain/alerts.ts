/**
 * Alert generation.
 *
 * Alerts are derived, not stored: the current ledger and settings are enough
 * to say what should be showing. What is stored is the set of dismissals, keyed
 * so that one event produces one key. A key carries the budget month, so an
 * alert dismissed in June returns in July when the same thing happens again,
 * and carries a bucketed value, so crossing a limit again by a larger amount is
 * a new event while the same overspend is not.
 */
import type { AlertItem, Transaction } from '@/types';
import { APPROACHING_THRESHOLD, type BudgetStatus } from './budget';
import { type BudgetMonth } from './budgetMonth';
import { countsAsSpend } from './stats';
import { renewingSoon, type RecurringCharge } from './recurring';

/** A charge this many times the category's typical spend is unusual. */
export const UNUSUAL_MULTIPLIER = 3;
/** Below this many prior charges there is no "normal" to compare against. */
export const UNUSUAL_MIN_HISTORY = 5;
/** Small amounts are never unusual, whatever the ratio. */
export const UNUSUAL_MIN_AMOUNT = 150;
/** How far ahead renewal reminders look. */
export const RENEWAL_HORIZON_DAYS = 7;

export interface AlertInput {
  month: BudgetMonth;
  now: number;
  statuses: readonly BudgetStatus[];
  /** Transactions inside the current budget month. */
  monthTransactions: readonly Transaction[];
  /** Every transaction, used to establish what is normal for a category. */
  allTransactions: readonly Transaction[];
  recurring: readonly RecurringCharge[];
  overall?: BudgetStatus;
}

function bucket(value: number): number {
  // Coarse buckets keep an alert from re-firing on every small increment.
  if (value < 100) return Math.floor(value / 25) * 25;
  if (value < 1000) return Math.floor(value / 100) * 100;
  return Math.floor(value / 500) * 500;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/**
 * At most one budget alert per scope, at the highest severity that applies.
 *
 * Being at 97 percent of a limit and being ahead of pace are the same story
 * told twice; stacking both buries the reader in amber. The pace figures ride
 * along with the approaching alert instead, so nothing is lost but the
 * repetition. Once a limit is passed, pace is moot and only the overage shows.
 */
function budgetAlertsFor(
  status: BudgetStatus,
  month: BudgetMonth,
  scope: 'category' | 'overall',
): AlertItem[] {
  if (status.limit <= 0) return [];
  const id = scope === 'overall' ? 'overall' : status.categoryId;
  const scoped = scope === 'category' ? { categoryId: status.categoryId } : {};

  if (status.spent > status.limit) {
    const over = status.spent - status.limit;
    return [
      {
        key: `exceeded:${id}:${month.key}:${bucket(over)}`,
        kind: 'exceeded',
        level: 'over',
        ...scoped,
        values: { over, limit: status.limit, spent: status.spent },
      },
    ];
  }

  const paceValues =
    status.pace === 'ahead'
      ? {
          projected: status.projectedTotal,
          overBy: Math.round(
            ((status.spent - status.expected) / Math.max(1, status.expected)) * 100,
          ),
          ...(status.projectedBreachAt !== undefined ? { breachAt: status.projectedBreachAt } : {}),
        }
      : {};

  if (status.ratio >= APPROACHING_THRESHOLD) {
    return [
      {
        key: `approaching:${id}:${month.key}`,
        kind: 'approaching',
        level: 'warn',
        ...scoped,
        values: {
          percent: Math.round(status.ratio * 100),
          remaining: status.remaining,
          limit: status.limit,
          ...paceValues,
        },
      },
    ];
  }

  if (status.pace === 'ahead') {
    return [
      {
        key: `pace:${id}:${month.key}:${bucket(status.projectedTotal)}`,
        kind: 'pace',
        level: 'warn',
        ...scoped,
        values: { limit: status.limit, ...paceValues },
      },
    ];
  }

  return [];
}

/**
 * A single charge far above what this category normally costs. Compared
 * against the median of the category's history rather than the mean, so one
 * previous outlier does not raise the bar for the next.
 */
function unusualAlerts(input: AlertInput): AlertItem[] {
  const history = new Map<string, number[]>();
  for (const tx of input.allTransactions) {
    if (!countsAsSpend(tx)) continue;
    const bucketed = history.get(tx.categoryId) ?? [];
    bucketed.push(tx.amountSar);
    history.set(tx.categoryId, bucketed);
  }

  const out: AlertItem[] = [];
  for (const tx of input.monthTransactions) {
    if (!countsAsSpend(tx)) continue;
    if (tx.amountSar < UNUSUAL_MIN_AMOUNT) continue;
    const all = history.get(tx.categoryId) ?? [];
    const others = all.filter((amount) => amount !== tx.amountSar);
    if (others.length < UNUSUAL_MIN_HISTORY) continue;
    const typical = median(others);
    if (typical <= 0 || tx.amountSar < typical * UNUSUAL_MULTIPLIER) continue;
    out.push({
      key: `unusual:${tx.id}`,
      kind: 'unusual',
      level: 'info',
      categoryId: tx.categoryId,
      transactionId: tx.id,
      values: { amount: tx.amountSar, typical, merchant: tx.merchant },
    });
  }
  return out;
}

function renewalAlerts(input: AlertInput): AlertItem[] {
  const soon = renewingSoon(input.recurring, input.now, RENEWAL_HORIZON_DAYS);
  if (soon.length === 0) return [];
  const first = soon[0];
  if (!first) return [];
  return [
    {
      key: `renewal:${input.month.key}:${soon.length}:${first.merchantKey}`,
      kind: 'renewal',
      level: 'info',
      values: {
        count: soon.length,
        days: RENEWAL_HORIZON_DAYS,
        total: soon.reduce((sum, charge) => sum + charge.amount, 0),
        merchant: first.merchant,
      },
    },
  ];
}

const LEVEL_ORDER: Record<AlertItem['level'], number> = { over: 0, warn: 1, info: 2 };

/** Every alert the current state warrants, most severe first. */
export function buildAlerts(input: AlertInput): AlertItem[] {
  const out: AlertItem[] = [];
  if (input.overall) out.push(...budgetAlertsFor(input.overall, input.month, 'overall'));
  for (const status of input.statuses) {
    out.push(...budgetAlertsFor(status, input.month, 'category'));
  }
  out.push(...unusualAlerts(input));
  out.push(...renewalAlerts(input));
  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

/** Removes alerts the user has already dismissed. */
export function withoutDismissed(
  alerts: readonly AlertItem[],
  dismissedKeys: ReadonlySet<string>,
): AlertItem[] {
  return alerts.filter((alert) => !dismissedKeys.has(alert.key));
}
