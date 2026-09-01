/**
 * Shared domain types. Kept dependency-free so the parser, the storage layer
 * and the UI all agree on one shape without importing each other.
 */

/** What a message says happened. */
export type TxKind =
  | 'purchase'
  | 'refund'
  | 'transfer_out'
  | 'transfer_in'
  | 'atm_withdrawal'
  | 'self_transfer'
  | 'deposit'
  | 'salary'
  | 'fee'
  | 'subscription';

/** Money leaving the account. */
const OUTFLOW_KINDS: readonly TxKind[] = [
  'purchase',
  'transfer_out',
  'atm_withdrawal',
  'fee',
  'subscription',
];

/**
 * Money moved between the user's own accounts changes no total. It is not
 * spending and it is not income, so it appears in `self_transfer` and in
 * neither list below; the ledger records it, the figures ignore it.
 */

/** Inflows that represent real income rather than a reversal of spending. */
const INCOME_KINDS: readonly TxKind[] = ['salary', 'deposit', 'transfer_in'];

export function isOutflow(kind: TxKind): boolean {
  return OUTFLOW_KINDS.includes(kind);
}

/**
 * Movements that change no total because the money stayed with the user.
 * The message these come from is shaped like a purchase, so it says nothing
 * reliable about direction; the interface shows the sum without a sign rather
 * than claiming one.
 */
export function isNeutralFlow(kind: TxKind): boolean {
  return kind === 'self_transfer';
}

export function isIncomeKind(kind: TxKind): boolean {
  return INCOME_KINDS.includes(kind);
}

/** Where a transaction entered the app. */
export type TxSource = 'paste' | 'url' | 'file' | 'manual';

/** How the date on a transaction was established. */
export type DateSource = 'message' | 'received' | 'import';

/** How a transaction got its category. */
export type CategorySource = 'auto' | 'rule' | 'user' | 'default';

export type Language = 'ar' | 'en';
export type ThemePreference = 'light' | 'dark' | 'system';

export interface Transaction {
  id: string;
  kind: TxKind;
  /** Magnitude charged, in `currency`. Always positive. */
  amount: number;
  currency: string;
  /** Magnitude in SAR. Equals `amount` when `currency` is SAR. */
  amountSar: number;
  /** Original foreign amount when the charge was in another currency. */
  fxAmount?: number;
  fxCurrency?: string;
  /** Cleaned display name of the merchant or counterparty. */
  merchant: string;
  /** The merchant string exactly as it appeared in the message. */
  merchantRaw: string;
  /** Normalised merchant key used for matching, dedupe and learned rules. */
  merchantKey: string;
  last4?: string;
  /** Institution the message came from, e.g. "alrajhi", "stcpay". */
  institution?: string;
  occurredAt: number;
  dateSource: DateSource;
  /**
   * True when the message stated a clock time. A date-only message is stored
   * at local midnight, and showing that as "00:00" would invent a fact the
   * bank never said, so the interface omits the time instead.
   */
  timeKnown: boolean;
  categoryId: string;
  categorySource: CategorySource;
  source: TxSource;
  /** The original message text, always preserved. */
  raw: string;
  /** Stable fingerprint of the normalised message, used for exact dedupe. */
  fingerprint: string;
  /** Inflows that could be income wait here until confirmed. */
  pending: boolean;
  /** Set when the parse was thin enough that a human should glance at it. */
  needsReview: boolean;
  /** Id of the refund that cancels this transaction. */
  reversedBy?: string;
  /** Id of the transaction this refund cancels. */
  reverses?: string;
  /** Raw text of near-duplicate alerts merged into this record. */
  mergedRaw?: string[];
  note?: string;
  createdAt: number;
  updatedAt: number;
}

/** A message the parser could not read with confidence. */
export interface UnparsedMessage {
  id: string;
  raw: string;
  receivedAt: number;
  source: TxSource;
  reason: ParseFailureReason;
  fingerprint: string;
}

export type ParseFailureReason =
  | 'no_amount'
  | 'no_kind'
  | 'not_a_transaction'
  | 'declined'
  | 'empty';

export interface Category {
  id: string;
  /** Translation key for seeded categories; user categories carry literals. */
  nameEn: string;
  nameAr: string;
  color: string;
  icon: string;
  parentId?: string;
  /** Seeded categories cannot be deleted, only renamed, recoloured or merged. */
  builtin: boolean;
  order: number;
  archived?: boolean;
}

export type RuleCondition =
  | { type: 'merchant_contains'; value: string }
  | { type: 'message_contains'; value: string }
  | { type: 'amount_between'; min: number; max: number };

export interface CategoryRule {
  id: string;
  /** Merchant rules learned from a recategorisation are marked `learned`. */
  origin: 'learned' | 'manual';
  conditions: RuleCondition[];
  categoryId: string;
  enabled: boolean;
  createdAt: number;
  /** Higher priority wins; learned rules default below manual ones. */
  priority: number;
}

export interface IncomeSource {
  id: string;
  name: string;
  /** Expected amount per budget month in SAR. */
  expected: number;
  /** Day of month the money is expected, 1-31. */
  dayOfMonth: number;
  enabled: boolean;
}

export interface Budget {
  /** `overall` for the whole-month cap, otherwise a category id. */
  id: string;
  limit: number;
  rollover: boolean;
}

export interface Settings {
  language: Language;
  theme: ThemePreference;
  /** Day of month the budget month starts on, 1-28. */
  budgetStartDay: number;
  currency: string;
  notificationsEnabled: boolean;
  /** Inflows are held for confirmation before counting toward income. */
  confirmIncome: boolean;
  onboarded: boolean;
}

export interface DismissedAlert {
  key: string;
  dismissedAt: number;
}

export type AlertLevel = 'info' | 'warn' | 'over';

export type AlertKind =
  | 'approaching'
  | 'exceeded'
  | 'pace'
  | 'unusual'
  | 'renewal';

export interface AlertItem {
  /** Stable per-event key, so an alert never fires twice for one event. */
  key: string;
  kind: AlertKind;
  level: AlertLevel;
  categoryId?: string;
  transactionId?: string;
  /** Numbers the translated message interpolates. */
  values: Record<string, string | number>;
}
