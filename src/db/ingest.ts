/**
 * The ingestion pipeline.
 *
 * Messages in, a reviewable plan out. The plan is a pure function of the input
 * and the current ledger, so the review screen can show exactly what will
 * happen before anything is written, and the same code path serves the paste
 * box, the URL hash, and file import.
 *
 * Nothing is ever dropped silently: every input message ends up in exactly one
 * of the three buckets the plan returns.
 */
import type {
  CategoryRule,
  Transaction,
  TxSource,
  UnparsedMessage,
} from '@/types';
import { isIncomeKind } from '@/types';
import { parseMessage, type ParsedTransaction } from '@/parser/parse';
import {
  findDuplicate,
  findReversalTarget,
  informationScore,
  isSameEventIgnoringTime,
  isUndated,
} from '@/parser/dedupe';
import { categorise } from '@/categorize/engine';
import { newId } from '@/lib/id';

/** How many neighbouring messages an undated alert may be matched against. */
const ADJACENCY_LOOKBACK = 3;

export interface IngestInput {
  raw: string;
  receivedAt?: number;
}

export interface ReviewItem {
  /** Temporary key for the review list; becomes the transaction id on commit. */
  id: string;
  transaction: Transaction;
  /** True when the parse leaned on an inference the user should check. */
  needsReview: boolean;
  /** Set when this refund cancels a charge already in the ledger. */
  reversesId?: string;
  reversesLabel?: string;
}

export interface DuplicateItem {
  raw: string;
  /** Id of the transaction already in the ledger, or a batch item's temp id. */
  existingId: string;
  existingLabel: string;
  /** True when the incoming alert carried more detail and replaced the old one. */
  enriched: boolean;
}

export interface IngestPlan {
  items: ReviewItem[];
  duplicates: DuplicateItem[];
  unrecognized: UnparsedMessage[];
  /** Updates to apply to rows already stored, from enrichment and reversals. */
  updates: { id: string; changes: Partial<Transaction> }[];
}

export interface IngestContext {
  existing: readonly Transaction[];
  rules: readonly CategoryRule[];
  categoryIds: ReadonlySet<string>;
  now: number;
  source: TxSource;
  /** When true an inflow that could be income waits for confirmation. */
  confirmIncome: boolean;
  /** Fingerprints of messages already stored, including unparsed ones. */
  knownFingerprints: ReadonlySet<string>;
}

function label(tx: Transaction): string {
  return tx.merchant.length > 0 ? tx.merchant : tx.raw.split('\n')[0]?.slice(0, 40) ?? '';
}

function toTransaction(
  parsed: ParsedTransaction,
  context: IngestContext,
  id: string,
): Transaction {
  const decision = categorise(
    {
      merchantKey: parsed.merchantKey,
      amountSar: parsed.amountSar,
      raw: parsed.raw,
      kind: parsed.kind,
    },
    context.rules,
    context.categoryIds,
  );

  const tx: Transaction = {
    id,
    kind: parsed.kind,
    amount: parsed.amount,
    currency: parsed.currency,
    amountSar: parsed.amountSar,
    merchant: parsed.merchant,
    merchantRaw: parsed.merchantRaw,
    merchantKey: parsed.merchantKey,
    occurredAt: parsed.occurredAt,
    dateSource: parsed.dateSource,
    timeKnown: parsed.timeKnown,
    categoryId: decision.categoryId,
    categorySource: decision.source,
    source: context.source,
    raw: parsed.raw,
    fingerprint: parsed.fingerprint,
    // An inflow that would count as income is held back, so a misread message
    // can never inflate the month's income without the user seeing it first.
    pending: context.confirmIncome && isIncomeKind(parsed.kind),
    needsReview: parsed.needsReview,
    createdAt: context.now,
    updatedAt: context.now,
  };
  if (parsed.fxAmount !== undefined) tx.fxAmount = parsed.fxAmount;
  if (parsed.fxCurrency !== undefined) tx.fxCurrency = parsed.fxCurrency;
  if (parsed.last4 !== undefined) tx.last4 = parsed.last4;
  if (parsed.institution !== undefined) tx.institution = parsed.institution;
  return tx;
}

/**
 * Builds the plan for a batch of messages.
 *
 * Duplicates are detected against the stored ledger and against earlier
 * messages in the same batch, because a paste routinely contains both the bank
 * alert and the wallet alert for one purchase.
 */
export function buildIngestPlan(inputs: readonly IngestInput[], context: IngestContext): IngestPlan {
  const items: ReviewItem[] = [];
  const duplicates: DuplicateItem[] = [];
  const unrecognized: UnparsedMessage[] = [];
  const updates = new Map<string, Partial<Transaction>>();

  // Rows we may enrich or link against, growing as the batch is processed.
  // Cloned, because the plan is a proposal: nothing the caller passed in may be
  // mutated before the user has accepted anything.
  const pool: Transaction[] = context.existing.map((row) => ({ ...row }));
  // Rows already in the database are patched through `updates`; rows created by
  // this batch carry their links on the object itself.
  const storedIds = new Set(context.existing.map((row) => row.id));
  // Rows added by this batch, in paste order, for adjacency matching.
  const batchRows: Transaction[] = [];
  const seenFingerprints = new Set(context.knownFingerprints);

  for (const input of inputs) {
    const options =
      input.receivedAt !== undefined
        ? { now: context.now, receivedAt: input.receivedAt }
        : { now: context.now };
    const outcome = parseMessage(input.raw, options);

    if (!outcome.ok) {
      if (seenFingerprints.has(outcome.failure.fingerprint)) continue;
      seenFingerprints.add(outcome.failure.fingerprint);
      unrecognized.push({
        id: newId(),
        raw: outcome.failure.raw,
        receivedAt: input.receivedAt ?? context.now,
        source: context.source,
        reason: outcome.failure.reason,
        fingerprint: outcome.failure.fingerprint,
      });
      continue;
    }

    const id = newId();
    const tx = toTransaction(outcome.transaction, context, id);

    // A wallet alert with no date of its own gets its timestamp from import
    // time, which can be weeks after the purchase, so the ordinary time window
    // cannot see that it is the same event. Within one paste the inbox order
    // does: the two alerts for one purchase arrive next to each other.
    const adjacent = batchRows.slice(-ADJACENCY_LOOKBACK);
    const sameEvent =
      isUndated(tx) || adjacent.some(isUndated)
        ? adjacent.find(
            (row) => (isUndated(tx) || isUndated(row)) && isSameEventIgnoringTime(tx, row),
          )
        : undefined;

    const existing = sameEvent ?? findDuplicate(tx, pool);
    if (existing) {
      // Keep whichever alert says more about the purchase, but never lose the
      // text of the one that loses.
      const incomingIsRicher = informationScore(tx) > informationScore(existing);
      const mergedRaw = [...(existing.mergedRaw ?? []), incomingIsRicher ? existing.raw : tx.raw];
      const changes: Partial<Transaction> = { mergedRaw, updatedAt: context.now };
      if (incomingIsRicher) {
        changes.merchant = tx.merchant;
        changes.merchantRaw = tx.merchantRaw;
        changes.merchantKey = tx.merchantKey;
        changes.raw = tx.raw;
        changes.categoryId = tx.categoryId;
        changes.categorySource = tx.categorySource;
        if (tx.last4 !== undefined) changes.last4 = tx.last4;
        if (tx.institution !== undefined) changes.institution = tx.institution;
        if (tx.dateSource === 'message') {
          changes.occurredAt = tx.occurredAt;
          changes.dateSource = 'message';
        }
      }
      Object.assign(existing, changes);
      if (storedIds.has(existing.id)) {
        updates.set(existing.id, { ...(updates.get(existing.id) ?? {}), ...changes });
      }
      duplicates.push({
        raw: tx.raw,
        existingId: existing.id,
        existingLabel: label(existing),
        enriched: incomingIsRicher,
      });
      seenFingerprints.add(tx.fingerprint);
      continue;
    }

    const item: ReviewItem = { id, transaction: tx, needsReview: tx.needsReview };

    if (tx.kind === 'refund') {
      const target = findReversalTarget(tx, pool);
      if (target) {
        item.reversesId = target.id;
        item.reversesLabel = label(target);
        tx.reverses = target.id;
        target.reversedBy = tx.id;
        if (storedIds.has(target.id)) {
          updates.set(target.id, {
            ...(updates.get(target.id) ?? {}),
            reversedBy: tx.id,
            updatedAt: context.now,
          });
        }
      }
    }

    pool.push(tx);
    batchRows.push(tx);
    seenFingerprints.add(tx.fingerprint);
    items.push(item);
  }

  return {
    items,
    duplicates,
    unrecognized,
    updates: [...updates.entries()].map(([id, changes]) => ({ id, changes })),
  };
}

/**
 * Narrows a plan to the items the user kept.
 *
 * Reversal links are repaired in both directions: an update that would mark a
 * stored charge as refunded by a dropped item is discarded, and a kept item
 * that points at a dropped item in the same batch has its link cleared. The
 * ledger can therefore never reference a transaction that was not written.
 */
export function applySelection(plan: IngestPlan, keptIds: ReadonlySet<string>): IngestPlan {
  const batchIds = new Set(plan.items.map((item) => item.id));
  const keptTxIds = new Set(plan.items.filter((item) => keptIds.has(item.id)).map((i) => i.id));
  const isDroppedBatchRow = (id: string | undefined): boolean =>
    id !== undefined && batchIds.has(id) && !keptTxIds.has(id);

  const items = plan.items
    .filter((item) => keptIds.has(item.id))
    .map((item) => {
      const transaction: Transaction = { ...item.transaction };
      if (isDroppedBatchRow(transaction.reverses)) delete transaction.reverses;
      if (isDroppedBatchRow(transaction.reversedBy)) delete transaction.reversedBy;
      const next: ReviewItem = { ...item, transaction };
      if (transaction.reverses === undefined) {
        delete next.reversesId;
        delete next.reversesLabel;
      }
      return next;
    });

  const updates: IngestPlan['updates'] = [];
  for (const update of plan.updates) {
    const { reversedBy, ...rest } = update.changes;
    const changes: Partial<Transaction> =
      reversedBy !== undefined && keptTxIds.has(reversedBy) ? { ...rest, reversedBy } : rest;
    if (Object.keys(changes).length > 0) updates.push({ id: update.id, changes });
  }

  return { ...plan, items, updates };
}
