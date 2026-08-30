/**
 * Everything that touches the database.
 *
 * Screens call these functions; they never open a Dexie table directly. That
 * keeps write ordering, seeding and the learned-rule bookkeeping in one place.
 */
import type {
  Budget,
  Category,
  CategoryRule,
  IncomeSource,
  Settings,
  Transaction,
  TxSource,
  UnparsedMessage,
} from '@/types';
import { db, DEFAULT_SETTINGS, type SettingsRow } from './db';
import { defaultCategories, OTHER_CATEGORY_ID } from '@/categorize/categories';
import { categorise, learnedRuleFor } from '@/categorize/engine';
import { newId } from '@/lib/id';
import {
  applySelection,
  buildIngestPlan,
  type IngestInput,
  type IngestPlan,
} from './ingest';
import { fingerprint } from '@/parser/normalize';
import { merchantKey as toMerchantKey, prettyMerchant } from '@/parser/merchants';

/** Creates the seeded categories the first time the app runs. */
export async function ensureSeeded(): Promise<void> {
  const count = await db.categories.count();
  if (count === 0) await db.categories.bulkAdd(defaultCategories());
  const settings = await db.settings.get('settings');
  if (!settings) await db.settings.put({ id: 'settings', ...DEFAULT_SETTINGS });
}

export async function getSettings(): Promise<Settings> {
  const row = await db.settings.get('settings');
  if (!row) return { ...DEFAULT_SETTINGS };
  const { id: _id, ...settings } = row;
  return settings;
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const current = await getSettings();
  const next: SettingsRow = { id: 'settings', ...current, ...patch };
  await db.settings.put(next);
}

// -- Ingestion ---------------------------------------------------------------

export interface PlanOptions {
  source: TxSource;
  now?: number;
}

/** Builds a review plan for a batch of messages without writing anything. */
export async function planIngest(
  inputs: readonly IngestInput[],
  options: PlanOptions,
): Promise<IngestPlan> {
  const [existing, rules, categories, settings, unparsed] = await Promise.all([
    db.transactions.toArray(),
    db.rules.toArray(),
    db.categories.toArray(),
    getSettings(),
    db.unparsed.toArray(),
  ]);
  const known = new Set<string>([
    ...existing.map((tx) => tx.fingerprint),
    ...unparsed.map((row) => row.fingerprint),
  ]);
  return buildIngestPlan(inputs, {
    existing,
    rules,
    categoryIds: new Set(categories.map((category) => category.id)),
    now: options.now ?? Date.now(),
    source: options.source,
    confirmIncome: settings.confirmIncome,
    knownFingerprints: known,
  });
}

export interface CommitResult {
  added: number;
  merged: number;
  unrecognized: number;
}

/** Writes the parts of a plan the user kept, in one atomic transaction. */
export async function commitIngest(
  plan: IngestPlan,
  keptIds: ReadonlySet<string>,
  keepUnrecognized = true,
): Promise<CommitResult> {
  const selected = applySelection(plan, keptIds);
  await db.transaction('rw', db.transactions, db.unparsed, async () => {
    if (selected.items.length > 0) {
      await db.transactions.bulkPut(selected.items.map((item) => item.transaction));
    }
    for (const update of selected.updates) {
      await db.transactions.update(update.id, update.changes);
    }
    if (keepUnrecognized && selected.unrecognized.length > 0) {
      await db.unparsed.bulkPut(selected.unrecognized);
    }
  });
  return {
    added: selected.items.length,
    merged: selected.duplicates.length,
    unrecognized: keepUnrecognized ? selected.unrecognized.length : 0,
  };
}

/**
 * The silent path used by URL ingestion: parse, keep everything, report what
 * happened. The user sees a toast, not a review screen, because the message
 * arrived one at a time from an automation.
 */
export async function ingestSilently(
  inputs: readonly IngestInput[],
  source: TxSource,
): Promise<CommitResult> {
  const plan = await planIngest(inputs, { source });
  const all = new Set(plan.items.map((item) => item.id));
  return commitIngest(plan, all);
}

// -- Transactions ------------------------------------------------------------

export async function updateTransaction(
  id: string,
  changes: Partial<Transaction>,
): Promise<void> {
  await db.transactions.update(id, { ...changes, updatedAt: Date.now() });
}

/**
 * Deletes a transaction and repairs any reversal link that pointed at it, so
 * a charge does not stay marked as refunded by a row that no longer exists.
 */
export async function deleteTransaction(id: string): Promise<void> {
  await db.transaction('rw', db.transactions, async () => {
    const row = await db.transactions.get(id);
    if (!row) return;
    if (row.reverses) await db.transactions.update(row.reverses, { reversedBy: undefined });
    if (row.reversedBy) await db.transactions.update(row.reversedBy, { reverses: undefined });
    await db.transactions.delete(id);
  });
}

export async function confirmPending(ids: readonly string[]): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.transactions, async () => {
    for (const id of ids) await db.transactions.update(id, { pending: false, updatedAt: now });
  });
}

/** Clears the review flag once the user has looked at a transaction. */
export async function markReviewed(ids: readonly string[]): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.transactions, async () => {
    for (const id of ids) await db.transactions.update(id, { needsReview: false, updatedAt: now });
  });
}

export interface ManualTransactionInput {
  kind: Transaction['kind'];
  amount: number;
  merchant: string;
  occurredAt: number;
  categoryId: string;
  note?: string;
  last4?: string;
}

/** Manual entry, and the target for rescuing a message from the unread queue. */
export async function addManualTransaction(
  input: ManualTransactionInput,
  raw?: string,
): Promise<string> {
  const now = Date.now();
  const id = newId();
  const merchant = prettyMerchant(input.merchant);
  const text = raw ?? `${input.merchant} ${input.amount}`;
  const tx: Transaction = {
    id,
    kind: input.kind,
    amount: input.amount,
    currency: 'SAR',
    amountSar: input.amount,
    merchant,
    merchantRaw: input.merchant,
    merchantKey: input.merchant.length > 0 ? toMerchantKey(input.merchant) : '',
    occurredAt: input.occurredAt,
    dateSource: 'message',
    timeKnown: true,
    categoryId: input.categoryId,
    categorySource: 'user',
    source: 'manual',
    raw: text,
    fingerprint: fingerprint(`${text}|${input.occurredAt}|${id}`),
    pending: false,
    needsReview: false,
    createdAt: now,
    updatedAt: now,
  };
  if (input.note !== undefined && input.note.length > 0) tx.note = input.note;
  if (input.last4 !== undefined && input.last4.length > 0) tx.last4 = input.last4;
  await db.transactions.add(tx);
  return id;
}

/** Moves a message out of the unread queue once it has been entered by hand. */
export async function resolveUnparsed(id: string): Promise<void> {
  await db.unparsed.delete(id);
}

export async function discardUnparsed(ids: readonly string[]): Promise<void> {
  await db.unparsed.bulkDelete([...ids]);
}

// -- Categories and rules ----------------------------------------------------

/**
 * Recategorises a transaction, optionally teaching the app to do the same for
 * every other transaction from that merchant, past and future.
 */
export async function recategorise(
  transactionId: string,
  categoryId: string,
  applyToMerchant: boolean,
): Promise<number> {
  const now = Date.now();
  let affected = 1;
  await db.transaction('rw', db.transactions, db.rules, async () => {
    const tx = await db.transactions.get(transactionId);
    if (!tx) return;
    await db.transactions.update(transactionId, {
      categoryId,
      categorySource: 'user',
      updatedAt: now,
    });
    if (!applyToMerchant || tx.merchantKey.length === 0) return;

    await db.rules.put(learnedRuleFor(tx.merchantKey, categoryId, now));
    const siblings = await db.transactions.where('merchantKey').equals(tx.merchantKey).toArray();
    for (const sibling of siblings) {
      if (sibling.id === transactionId) continue;
      // A category the user set by hand on another row is not overwritten.
      if (sibling.categorySource === 'user') continue;
      await db.transactions.update(sibling.id, {
        categoryId,
        categorySource: 'rule',
        updatedAt: now,
      });
      affected += 1;
    }
  });
  return affected;
}

/** Bulk recategorisation from the transactions list. */
export async function recategoriseMany(ids: readonly string[], categoryId: string): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.transactions, async () => {
    for (const id of ids) {
      await db.transactions.update(id, { categoryId, categorySource: 'user', updatedAt: now });
    }
  });
}

export async function saveCategory(category: Category): Promise<void> {
  await db.categories.put(category);
}

export async function createCategory(
  input: Omit<Category, 'id' | 'builtin' | 'order'>,
): Promise<string> {
  const id = newId();
  const order = (await db.categories.count()) + 1;
  await db.categories.put({ ...input, id, builtin: false, order });
  return id;
}

/**
 * Deletes a category and moves everything that pointed at it. Built-in
 * categories cannot be deleted, so a transaction always has somewhere to sit.
 */
export async function deleteCategory(id: string, moveToId = OTHER_CATEGORY_ID): Promise<void> {
  await db.transaction('rw', db.categories, db.transactions, db.rules, db.budgets, async () => {
    const category = await db.categories.get(id);
    if (!category || category.builtin) return;
    await db.transactions
      .where('categoryId')
      .equals(id)
      .modify({ categoryId: moveToId, updatedAt: Date.now() });
    await db.rules.where('categoryId').equals(id).modify({ categoryId: moveToId });
    await db.categories.where('parentId').equals(id).modify({ parentId: undefined });
    await db.budgets.delete(id);
    await db.categories.delete(id);
  });
}

/** Merges `sourceId` into `targetId`, keeping the target's name and colour. */
export async function mergeCategories(sourceId: string, targetId: string): Promise<void> {
  if (sourceId === targetId) return;
  await db.transaction('rw', db.categories, db.transactions, db.rules, db.budgets, async () => {
    const source = await db.categories.get(sourceId);
    const target = await db.categories.get(targetId);
    if (!source || !target) return;
    await db.transactions
      .where('categoryId')
      .equals(sourceId)
      .modify({ categoryId: targetId, updatedAt: Date.now() });
    await db.rules.where('categoryId').equals(sourceId).modify({ categoryId: targetId });
    await db.categories.where('parentId').equals(sourceId).modify({ parentId: targetId });
    const sourceBudget = await db.budgets.get(sourceId);
    if (sourceBudget) {
      const targetBudget = await db.budgets.get(targetId);
      await db.budgets.put({
        id: targetId,
        limit: (targetBudget?.limit ?? 0) + sourceBudget.limit,
        rollover: targetBudget?.rollover ?? sourceBudget.rollover,
      });
      await db.budgets.delete(sourceId);
    }
    // A merged-away built-in is archived rather than deleted, so the seed set
    // stays complete and the merge can be undone by unarchiving.
    if (source.builtin) await db.categories.update(sourceId, { archived: true });
    else await db.categories.delete(sourceId);
  });
}

export async function saveRule(rule: CategoryRule): Promise<void> {
  await db.rules.put(rule);
}

export async function deleteRule(id: string): Promise<void> {
  await db.rules.delete(id);
}

/**
 * Re-runs categorisation over every transaction whose category was assigned
 * automatically. Called after rules change, so the list reflects the new rules
 * immediately without touching anything the user set by hand.
 */
export async function reapplyRules(): Promise<number> {
  const [rules, categories, transactions] = await Promise.all([
    db.rules.toArray(),
    db.categories.toArray(),
    db.transactions.toArray(),
  ]);
  const ids = new Set(categories.map((category) => category.id));
  const now = Date.now();
  let changed = 0;
  await db.transaction('rw', db.transactions, async () => {
    for (const tx of transactions) {
      if (tx.categorySource === 'user') continue;
      const decision = categorise(tx, rules, ids);
      if (decision.categoryId === tx.categoryId && decision.source === tx.categorySource) continue;
      await db.transactions.update(tx.id, {
        categoryId: decision.categoryId,
        categorySource: decision.source,
        updatedAt: now,
      });
      changed += 1;
    }
  });
  return changed;
}

// -- Budgets and income ------------------------------------------------------

export async function saveBudget(budget: Budget): Promise<void> {
  if (budget.limit <= 0 && !budget.rollover) await db.budgets.delete(budget.id);
  else await db.budgets.put(budget);
}

export async function saveBudgets(budgets: readonly Budget[]): Promise<void> {
  await db.transaction('rw', db.budgets, async () => {
    for (const budget of budgets) await saveBudget(budget);
  });
}

export async function saveIncomeSource(source: IncomeSource): Promise<void> {
  await db.incomeSources.put(source);
}

export async function deleteIncomeSource(id: string): Promise<void> {
  await db.incomeSources.delete(id);
}

// -- Alerts ------------------------------------------------------------------

export async function dismissAlert(key: string): Promise<void> {
  await db.dismissedAlerts.put({ key, dismissedAt: Date.now() });
}

/** Drops dismissals older than a year so the table cannot grow without bound. */
export async function pruneDismissedAlerts(now = Date.now()): Promise<void> {
  const cutoff = now - 365 * 86_400_000;
  await db.dismissedAlerts.filter((row) => row.dismissedAt < cutoff).delete();
}

// -- Wholesale ---------------------------------------------------------------

export async function clearEverything(): Promise<void> {
  await db.transaction(
    'rw',
    [db.transactions, db.unparsed, db.categories, db.rules, db.budgets, db.incomeSources, db.settings, db.dismissedAlerts],
    async () => {
      await Promise.all([
        db.transactions.clear(),
        db.unparsed.clear(),
        db.categories.clear(),
        db.rules.clear(),
        db.budgets.clear(),
        db.incomeSources.clear(),
        db.dismissedAlerts.clear(),
      ]);
    },
  );
  await ensureSeeded();
}

export type { UnparsedMessage };
