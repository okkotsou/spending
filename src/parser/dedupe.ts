/**
 * Duplicate and reversal matching.
 *
 * Two things routinely produce more than one message for a single event: the
 * bank and Apple Pay both announce the same card purchase, and a bank
 * sometimes resends an alert. Both must collapse to one transaction, or the
 * month's total is inflated by real money that was never spent.
 *
 * Refunds are the mirror image: a refund is not income, it cancels an earlier
 * charge. Linking the two lets both be excluded from spending rather than
 * netted incorrectly.
 */
import { isOutflow, type DateSource, type Transaction, type TxKind } from '@/types';

/** The minimum shape both a parsed candidate and a stored row satisfy. */
export interface MatchableTx {
  kind: TxKind;
  amountSar: number;
  merchantKey: string;
  last4?: string;
  occurredAt: number;
  fingerprint: string;
  institution?: string;
  /** `message` when the text carried its own date; otherwise a fallback time. */
  dateSource?: DateSource;
}

/** Alerts for the same purchase land within a few minutes of each other. */
export const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;
/**
 * A wallet alert often carries no date at all, so its timestamp is the moment
 * it was pasted, which can be days after the purchase. Matching one of those
 * gets a wider window, paid for by requiring a stronger identity signal: the
 * same card tail, or the same named merchant.
 */
export const UNDATED_WINDOW_MS = 4 * 24 * 60 * 60 * 1000;
/** A refund can follow its charge by weeks. */
export const REVERSAL_WINDOW_MS = 120 * 24 * 60 * 60 * 1000;

const AMOUNT_EPSILON = 0.005;

function sameAmount(a: number, b: number): boolean {
  return Math.abs(a - b) < AMOUNT_EPSILON;
}

/**
 * True when two merchant keys plausibly name the same place: identical, or one
 * empty (a wallet alert that omitted the name), or one a prefix of the other
 * (an acquirer string truncated differently by two senders).
 */
export function merchantsAgree(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === 0 || b.length === 0) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= 4 && longer.startsWith(shorter);
}

/**
 * True when `candidate` is another alert for the event `existing` already
 * records. Same direction, same amount, agreeing merchants, inside the window.
 */
export function isNearDuplicate(candidate: MatchableTx, existing: MatchableTx): boolean {
  if (candidate.fingerprint === existing.fingerprint) return true;
  if (isOutflow(candidate.kind) !== isOutflow(existing.kind)) return false;
  if (!sameAmount(candidate.amountSar, existing.amountSar)) return false;
  if (
    candidate.last4 !== undefined &&
    existing.last4 !== undefined &&
    candidate.last4 !== existing.last4
  ) {
    return false;
  }
  if (!merchantsAgree(candidate.merchantKey, existing.merchantKey)) return false;

  const undated =
    (candidate.dateSource !== undefined && candidate.dateSource !== 'message') ||
    (existing.dateSource !== undefined && existing.dateSource !== 'message');
  if (!undated) {
    return Math.abs(candidate.occurredAt - existing.occurredAt) <= DUPLICATE_WINDOW_MS;
  }

  // Without a date from the message itself, agreement on amount alone is not
  // enough to merge two charges days apart; the card tail or a named merchant
  // on both sides has to confirm it is the same purchase.
  const sameCard =
    candidate.last4 !== undefined && existing.last4 !== undefined && candidate.last4 === existing.last4;
  const sameNamedMerchant =
    candidate.merchantKey.length > 0 && candidate.merchantKey === existing.merchantKey;
  if (!sameCard && !sameNamedMerchant) return false;
  return Math.abs(candidate.occurredAt - existing.occurredAt) <= UNDATED_WINDOW_MS;
}

/**
 * Whether two alerts describe the same event, ignoring when they say it
 * happened. Used only for messages that carry no date of their own, and only
 * against alerts that arrived beside them in the same batch, where the
 * ordering of the inbox already says the two belong together.
 */
export function isSameEventIgnoringTime(a: MatchableTx, b: MatchableTx): boolean {
  if (isOutflow(a.kind) !== isOutflow(b.kind)) return false;
  if (!sameAmount(a.amountSar, b.amountSar)) return false;
  if (a.last4 !== undefined && b.last4 !== undefined && a.last4 !== b.last4) return false;
  const sameCard = a.last4 !== undefined && b.last4 !== undefined && a.last4 === b.last4;
  const sameNamedMerchant = a.merchantKey.length > 0 && a.merchantKey === b.merchantKey;
  return sameCard || sameNamedMerchant;
}

/** True when the row's timestamp came from the message rather than a fallback. */
export function isUndated(tx: MatchableTx): boolean {
  return tx.dateSource !== undefined && tx.dateSource !== 'message';
}

export function findDuplicate<T extends MatchableTx>(
  candidate: MatchableTx,
  existing: readonly T[],
): T | undefined {
  return existing.find((row) => isNearDuplicate(candidate, row));
}

/** How much a record tells us; the richer of two duplicates is the one kept. */
export function informationScore(tx: MatchableTx & { merchant?: string; dateSource?: string }): number {
  let score = 0;
  if (tx.merchantKey.length > 0) score += 3;
  if (tx.last4 !== undefined) score += 2;
  if (tx.institution !== undefined && tx.institution !== 'applepay') score += 2;
  if (tx.dateSource === 'message') score += 1;
  return score;
}

/**
 * Finds the charge a refund reverses: same amount, agreeing merchant, an
 * outflow that happened earlier and has not already been reversed.
 */
export function findReversalTarget(
  refund: MatchableTx,
  existing: readonly Transaction[],
): Transaction | undefined {
  const candidates = existing.filter(
    (row) =>
      isOutflow(row.kind) &&
      row.reversedBy === undefined &&
      sameAmount(row.amountSar, refund.amountSar) &&
      row.occurredAt <= refund.occurredAt + DUPLICATE_WINDOW_MS &&
      refund.occurredAt - row.occurredAt <= REVERSAL_WINDOW_MS &&
      merchantsAgree(row.merchantKey, refund.merchantKey),
  );
  if (candidates.length === 0) return undefined;
  // Prefer a named merchant match, then the most recent charge.
  const named = candidates.filter(
    (row) => row.merchantKey.length > 0 && row.merchantKey === refund.merchantKey,
  );
  const pool = named.length > 0 ? named : candidates;
  return pool.reduce((best, row) => (row.occurredAt > best.occurredAt ? row : best));
}
