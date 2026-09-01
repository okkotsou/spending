/**
 * Persisted shapes, validated with Zod.
 *
 * Validation matters most at the two places data enters from outside the
 * app: a restored backup file and an imported JSON message file. Everything is
 * parsed through these schemas there, so a corrupt or hand-edited file is
 * rejected with a message rather than silently poisoning the ledger.
 */
import { z } from 'zod';

export const txKindSchema = z.enum([
  'purchase',
  'refund',
  'transfer_out',
  'transfer_in',
  'atm_withdrawal',
  'self_transfer',
  'deposit',
  'salary',
  'fee',
  'subscription',
]);

export const txSourceSchema = z.enum(['paste', 'url', 'file', 'manual']);
export const dateSourceSchema = z.enum(['message', 'received', 'import']);
export const categorySourceSchema = z.enum(['auto', 'rule', 'user', 'default']);

const positiveAmount = z.number().finite().nonnegative();

export const transactionSchema = z.object({
  id: z.string().min(1),
  kind: txKindSchema,
  amount: positiveAmount,
  currency: z.string().min(1).max(8),
  amountSar: positiveAmount,
  fxAmount: positiveAmount.optional(),
  fxCurrency: z.string().min(1).max(8).optional(),
  merchant: z.string(),
  merchantRaw: z.string(),
  merchantKey: z.string(),
  last4: z.string().regex(/^\d{4}$/).optional(),
  institution: z.string().optional(),
  occurredAt: z.number().int(),
  dateSource: dateSourceSchema,
  timeKnown: z.boolean(),
  categoryId: z.string().min(1),
  categorySource: categorySourceSchema,
  source: txSourceSchema,
  raw: z.string(),
  fingerprint: z.string().min(1),
  pending: z.boolean(),
  needsReview: z.boolean(),
  reversedBy: z.string().optional(),
  reverses: z.string().optional(),
  mergedRaw: z.array(z.string()).optional(),
  note: z.string().optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});

export const unparsedSchema = z.object({
  id: z.string().min(1),
  raw: z.string(),
  receivedAt: z.number().int(),
  source: txSourceSchema,
  reason: z.enum(['no_amount', 'no_kind', 'not_a_transaction', 'declined', 'empty']),
  fingerprint: z.string().min(1),
});

export const categorySchema = z.object({
  id: z.string().min(1),
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().min(1),
  parentId: z.string().optional(),
  builtin: z.boolean(),
  order: z.number().int(),
  archived: z.boolean().optional(),
});

export const ruleConditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('merchant_contains'), value: z.string().min(1) }),
  z.object({ type: z.literal('message_contains'), value: z.string().min(1) }),
  z.object({
    type: z.literal('amount_between'),
    min: z.number().finite().nonnegative(),
    max: z.number().finite().nonnegative(),
  }),
]);

export const categoryRuleSchema = z.object({
  id: z.string().min(1),
  origin: z.enum(['learned', 'manual']),
  conditions: z.array(ruleConditionSchema).min(1),
  categoryId: z.string().min(1),
  enabled: z.boolean(),
  createdAt: z.number().int(),
  priority: z.number().int(),
});

export const incomeSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  expected: positiveAmount,
  dayOfMonth: z.number().int().min(1).max(31),
  enabled: z.boolean(),
});

export const budgetSchema = z.object({
  id: z.string().min(1),
  limit: positiveAmount,
  rollover: z.boolean(),
});

export const settingsSchema = z.object({
  language: z.enum(['ar', 'en']),
  theme: z.enum(['light', 'dark', 'system']),
  budgetStartDay: z.number().int().min(1).max(28),
  currency: z.string().min(1).max(8),
  notificationsEnabled: z.boolean(),
  confirmIncome: z.boolean(),
  onboarded: z.boolean(),
});

export const dismissedAlertSchema = z.object({
  key: z.string().min(1),
  dismissedAt: z.number().int(),
});

/** The backup envelope. `version` gates any future migration. */
export const BACKUP_VERSION = 1;

export const backupSchema = z.object({
  app: z.literal('misraf'),
  version: z.number().int().min(1).max(BACKUP_VERSION),
  exportedAt: z.number().int(),
  transactions: z.array(transactionSchema),
  unparsed: z.array(unparsedSchema),
  categories: z.array(categorySchema),
  rules: z.array(categoryRuleSchema),
  budgets: z.array(budgetSchema),
  incomeSources: z.array(incomeSourceSchema),
  settings: settingsSchema,
  dismissedAlerts: z.array(dismissedAlertSchema),
});

export type Backup = z.infer<typeof backupSchema>;

/** A message-only import file: an array of strings, or one string per line. */
export const messageFileSchema = z.union([
  z.array(z.string()),
  z.object({ messages: z.array(z.string()) }),
]);
