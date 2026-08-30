/**
 * Recurring charge detection.
 *
 * A subscription looks like this in a ledger: the same merchant, a similar
 * amount, roughly a month apart, at least three times. Two occurrences are not
 * enough to tell a subscription from a coincidence, so the bar is three, and
 * the interval has to be monthly rather than merely regular.
 */
import type { Transaction } from '@/types';
import { countsAsSpend } from './stats';

/** Charges this far apart, in days, count as monthly. */
export const MIN_PERIOD_DAYS = 24;
export const MAX_PERIOD_DAYS = 38;
/** Amounts within this fraction of the median are "the same price". */
export const AMOUNT_TOLERANCE = 0.2;
export const MIN_OCCURRENCES = 3;

const DAY_MS = 86_400_000;

export interface RecurringCharge {
  merchantKey: string;
  merchant: string;
  categoryId: string;
  /** Median of the observed amounts, in SAR. */
  amount: number;
  occurrences: number;
  /** Mean gap between charges, in days. */
  periodDays: number;
  lastAt: number;
  /** Last charge plus the observed period. */
  nextEstimatedAt: number;
  transactionIds: string[];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/**
 * Finds the recurring charges in a ledger.
 *
 * @param txs every transaction, in any order
 * @param now used to decide which charges are still live
 * @param staleAfterDays a charge not seen for this long is treated as cancelled
 */
export function detectRecurring(
  txs: readonly Transaction[],
  now: number,
  staleAfterDays = 70,
): RecurringCharge[] {
  const groups = new Map<string, Transaction[]>();
  for (const tx of txs) {
    if (!countsAsSpend(tx) || tx.merchantKey.length === 0) continue;
    const bucket = groups.get(tx.merchantKey);
    if (bucket) bucket.push(tx);
    else groups.set(tx.merchantKey, [tx]);
  }

  const found: RecurringCharge[] = [];
  for (const [key, rows] of groups) {
    if (rows.length < MIN_OCCURRENCES) continue;
    const ordered = [...rows].sort((a, b) => a.occurredAt - b.occurredAt);
    const typical = median(ordered.map((tx) => tx.amountSar));
    if (typical <= 0) continue;

    // Keep only the charges at the recurring price; a one-off large purchase
    // at a merchant that also bills monthly must not distort the estimate.
    const consistent = ordered.filter(
      (tx) => Math.abs(tx.amountSar - typical) <= typical * AMOUNT_TOLERANCE,
    );
    if (consistent.length < MIN_OCCURRENCES) continue;

    const gaps: number[] = [];
    for (let i = 1; i < consistent.length; i += 1) {
      const previous = consistent[i - 1];
      const current = consistent[i];
      if (!previous || !current) continue;
      gaps.push((current.occurredAt - previous.occurredAt) / DAY_MS);
    }
    const monthly = gaps.filter((gap) => gap >= MIN_PERIOD_DAYS && gap <= MAX_PERIOD_DAYS);
    if (monthly.length < MIN_OCCURRENCES - 1) continue;

    const periodDays = monthly.reduce((sum, gap) => sum + gap, 0) / monthly.length;
    const last = consistent[consistent.length - 1];
    if (!last) continue;
    if ((now - last.occurredAt) / DAY_MS > staleAfterDays) continue;

    found.push({
      merchantKey: key,
      merchant: last.merchant,
      categoryId: last.categoryId,
      amount: median(consistent.map((tx) => tx.amountSar)),
      occurrences: consistent.length,
      periodDays,
      lastAt: last.occurredAt,
      nextEstimatedAt: last.occurredAt + periodDays * DAY_MS,
      transactionIds: consistent.map((tx) => tx.id),
    });
  }

  return found.sort((a, b) => b.amount - a.amount);
}

/** What the detected subscriptions cost in a typical month. */
export function estimatedMonthlyTotal(charges: readonly RecurringCharge[]): number {
  return charges.reduce((sum, charge) => sum + charge.amount * (30 / charge.periodDays), 0);
}

/** Charges expected to renew within the next `days` days. */
export function renewingSoon(
  charges: readonly RecurringCharge[],
  now: number,
  days: number,
): RecurringCharge[] {
  const horizon = now + days * DAY_MS;
  return charges
    .filter((charge) => charge.nextEstimatedAt >= now && charge.nextEstimatedAt <= horizon)
    .sort((a, b) => a.nextEstimatedAt - b.nextEstimatedAt);
}
