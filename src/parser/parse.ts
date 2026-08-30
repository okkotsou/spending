/**
 * The message parser.
 *
 * Deterministic and rule-driven: every decision comes from the tables in
 * `patterns.ts` and the extractors in `money.ts`, `dates.ts` and
 * `merchants.ts`. No network, no model, no randomness. The same message always
 * produces the same result, which is what makes the fixture corpus meaningful.
 *
 * The contract is deliberately conservative: a message either yields a
 * transaction the parser is confident about, or it is handed back as
 * unrecognised. It is never guessed at silently.
 */
import type { ParseFailureReason, TxKind } from '@/types';
import { fingerprint, matchable, normalize } from './normalize';
import {
  findLabelledBareAmount,
  findMoney,
  findSarEquivalent,
  stripBalanceClauses,
} from './money';
import { findDate } from './dates';
import { merchantKey, prettyMerchant } from './merchants';
import {
  INSTITUTION_PATTERNS,
  KIND_PATTERNS,
  LAST4_PATTERNS,
  MERCHANT_PATTERNS,
  NON_MERCHANT_LINE,
  REJECT_PATTERNS,
} from './patterns';

export interface ParsedTransaction {
  kind: TxKind;
  amount: number;
  currency: string;
  amountSar: number;
  fxAmount?: number;
  fxCurrency?: string;
  merchant: string;
  merchantRaw: string;
  merchantKey: string;
  last4?: string;
  institution?: string;
  occurredAt: number;
  dateSource: 'message' | 'received' | 'import';
  /** True when the message stated a clock time, not just a calendar date. */
  timeKnown: boolean;
  raw: string;
  fingerprint: string;
  /** Rule ids that produced this reading, for debugging and for the review UI. */
  matchedRules: string[];
  /** True when a field was inferred rather than read from a label. */
  needsReview: boolean;
}

export interface ParseFailure {
  raw: string;
  fingerprint: string;
  reason: ParseFailureReason;
}

export type ParseOutcome =
  | { ok: true; transaction: ParsedTransaction }
  | { ok: false; failure: ParseFailure };

export interface ParseOptions {
  /** When the message arrived, used when the text carries no date. */
  receivedAt?: number;
  /** Import time, used when neither the text nor the caller knows better. */
  now?: number;
}

interface Hit<T> {
  entry: T;
  match: RegExpExecArray;
}

/**
 * First rule in the table that matches. Patterns are recompiled with the `d`
 * flag so capture groups report exact offsets; the parser slices the original
 * text at those offsets to recover the merchant's real spelling and casing.
 */
function firstMatch<T extends { id: string; pattern: RegExp }>(
  text: string,
  patterns: readonly T[],
): Hit<T> | undefined {
  for (const entry of patterns) {
    const flags = entry.pattern.flags.includes('d')
      ? entry.pattern.flags
      : `${entry.pattern.flags}d`;
    const match = new RegExp(entry.pattern.source, flags).exec(text);
    if (match) return { entry, match };
  }
  return undefined;
}

/** Kinds where the absence of a merchant name is normal, not a parse gap. */
const MERCHANT_OPTIONAL: readonly TxKind[] = ['atm_withdrawal', 'fee', 'deposit', 'salary'];

/**
 * Last resort merchant: the first line that reads like a bare name rather than
 * a label, a number, a date, a card tail or a network badge. Wallet alerts put
 * the merchant on its own line with no label at all. A transaction that relies
 * on this is flagged for review, because the guess is structural, not semantic.
 */
function fallbackMerchant(normalized: string, matched: string): string | undefined {
  const lines = normalized.split('\n');
  const probes = matched.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = (lines[i] ?? '').trim();
    const probe = (probes[i] ?? '').trim();
    if (line.length < 3 || line.length > 48) continue;
    if (NON_MERCHANT_LINE.test(probe)) continue;
    if (/\d{2}[:/-]\d{2}/.test(probe)) continue; // a date or a clock time
    if (/[:\uFF1A]\s*\S/.test(probe)) continue; // a labelled field, not a bare name
    if (/\d/.test(probe) && /(sar|ريال|ر\.س|usd|aed|eur)/i.test(probe)) continue;
    if (firstMatch(probe, KIND_PATTERNS)) continue;
    if (firstMatch(probe, LAST4_PATTERNS)) continue;
    if (firstMatch(probe, INSTITUTION_PATTERNS)) continue;
    if (!/[\p{L}]{3}/u.test(probe)) continue;
    return line;
  }
  return undefined;
}

/**
 * Parses a single message.
 *
 * @param rawInput one message, exactly as received
 * @param options received and import timestamps used as date fallbacks
 */
export function parseMessage(rawInput: string, options: ParseOptions = {}): ParseOutcome {
  const raw = rawInput.replace(/\r\n?/g, '\n').trim();
  const print = fingerprint(raw);
  if (raw.length === 0) {
    return { ok: false, failure: { raw: rawInput, fingerprint: print, reason: 'empty' } };
  }

  const normalized = normalize(raw);
  // Indexes into `matched` address the same characters in `normalized`.
  const matched = matchable(raw);

  if (firstMatch(matched, REJECT_PATTERNS)) {
    return { ok: false, failure: { raw, fingerprint: print, reason: 'not_a_transaction' } };
  }

  const kindHit = firstMatch(matched, KIND_PATTERNS);
  if (!kindHit) {
    return { ok: false, failure: { raw, fingerprint: print, reason: 'no_kind' } };
  }
  const kind = kindHit.entry.kind;
  const matchedRules: string[] = [kindHit.entry.id];

  // Amount ------------------------------------------------------------------
  const withoutBalance = stripBalanceClauses(matched);
  const money = findMoney(withoutBalance);
  const sarEquivalent = findSarEquivalent(withoutBalance);

  let amount: number | undefined;
  let currency = 'SAR';
  let fxAmount: number | undefined;
  let fxCurrency: string | undefined;

  const foreign = money.find((m) => m.currency !== 'SAR');
  const local = money.find((m) => m.currency === 'SAR');

  if (foreign && (sarEquivalent !== undefined || local)) {
    // A foreign purchase reports both legs; the SAR leg is what was charged.
    fxAmount = foreign.amount;
    fxCurrency = foreign.currency;
    amount = sarEquivalent ?? local?.amount;
    currency = 'SAR';
    matchedRules.push('fx-pair');
  } else if (local) {
    amount = local.amount;
    currency = 'SAR';
    matchedRules.push('amount-sar');
  } else if (foreign) {
    amount = foreign.amount;
    currency = foreign.currency;
    matchedRules.push('amount-foreign');
  } else {
    const bare = findLabelledBareAmount(withoutBalance);
    if (bare !== undefined) {
      amount = bare;
      matchedRules.push('amount-bare-labelled');
    }
  }

  if (amount === undefined || !Number.isFinite(amount) || amount <= 0) {
    return { ok: false, failure: { raw, fingerprint: print, reason: 'no_amount' } };
  }

  // Merchant ----------------------------------------------------------------
  let merchantRaw = '';
  let inferredMerchant = false;
  const merchantHit = firstMatch(matched, MERCHANT_PATTERNS);
  const merchantSpan = merchantHit?.match.indices?.[1];
  if (merchantHit && merchantSpan) {
    merchantRaw = normalized.slice(merchantSpan[0], merchantSpan[1]).trim();
    matchedRules.push(`merchant:${merchantHit.entry.id}`);
  }
  if (merchantRaw.length === 0 || /^\d+$/.test(merchantRaw)) {
    const fallback = fallbackMerchant(normalized, matched);
    if (fallback) {
      merchantRaw = fallback;
      inferredMerchant = true;
      matchedRules.push('merchant:line-fallback');
    }
  }
  merchantRaw = merchantRaw.replace(/[.,;:\s]+$/, '').trim();

  // Card or account tail ----------------------------------------------------
  let last4: string | undefined;
  const last4Hit = firstMatch(matched, LAST4_PATTERNS);
  if (last4Hit?.match[1]) {
    last4 = last4Hit.match[1];
    matchedRules.push(`last4:${last4Hit.entry.id}`);
  }

  // Institution -------------------------------------------------------------
  const institutionHit = firstMatch(matched, INSTITUTION_PATTERNS);
  const institution = institutionHit?.entry.id;
  if (institution) matchedRules.push(`institution:${institution}`);

  // Date --------------------------------------------------------------------
  const now = options.now ?? Date.now();
  const found = findDate(matched, new Date(now));
  let occurredAt: number;
  let dateSource: ParsedTransaction['dateSource'];
  let timeKnown: boolean;
  if (found && found.at <= now + 36 * 60 * 60 * 1000) {
    occurredAt = found.at;
    dateSource = 'message';
    timeKnown = found.hasTime;
    matchedRules.push(found.hasTime ? 'date:with-time' : 'date:day-only');
  } else if (options.receivedAt !== undefined) {
    occurredAt = options.receivedAt;
    dateSource = 'received';
    // The arrival time is a real clock time, just not the bank's.
    timeKnown = true;
    matchedRules.push('date:received');
  } else {
    occurredAt = now;
    dateSource = 'import';
    timeKnown = false;
    matchedRules.push('date:import');
  }

  // A charge billed only in a foreign currency carries no exchange rate, so the
  // SAR figure is a placeholder the user must correct. Flag it rather than
  // quietly booking dollars as riyals.
  const unconvertedForeign = currency !== 'SAR';

  const needsReview =
    inferredMerchant ||
    unconvertedForeign ||
    (merchantRaw.length === 0 && !MERCHANT_OPTIONAL.includes(kind)) ||
    dateSource === 'import';

  const pretty = merchantRaw.length > 0 ? prettyMerchant(merchantRaw) : '';

  const transaction: ParsedTransaction = {
    kind,
    amount,
    currency,
    amountSar: amount,
    merchant: pretty,
    merchantRaw,
    merchantKey: pretty.length > 0 ? merchantKey(merchantRaw) : '',
    occurredAt,
    dateSource,
    timeKnown,
    raw,
    fingerprint: print,
    matchedRules,
    needsReview,
  };
  if (fxAmount !== undefined && fxCurrency !== undefined) {
    transaction.fxAmount = fxAmount;
    transaction.fxCurrency = fxCurrency;
  }
  if (last4 !== undefined) transaction.last4 = last4;
  if (institution !== undefined) transaction.institution = institution;

  return { ok: true, transaction };
}
