/**
 * The local database.
 *
 * Everything lives in IndexedDB on the device. There is no server, no account
 * and no sync; the only way data leaves is a backup file the user exports
 * themselves. Dexie gives us indexes and transactions over that.
 */
import Dexie, { type EntityTable } from 'dexie';
import type {
  Budget,
  Category,
  CategoryRule,
  DismissedAlert,
  IncomeSource,
  Settings,
  Transaction,
  UnparsedMessage,
} from '@/types';

/** Settings live in a one-row table so they can be observed like everything else. */
export interface SettingsRow extends Settings {
  id: 'settings';
}

export class MisrafDatabase extends Dexie {
  transactions!: EntityTable<Transaction, 'id'>;
  unparsed!: EntityTable<UnparsedMessage, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  rules!: EntityTable<CategoryRule, 'id'>;
  budgets!: EntityTable<Budget, 'id'>;
  incomeSources!: EntityTable<IncomeSource, 'id'>;
  settings!: EntityTable<SettingsRow, 'id'>;
  dismissedAlerts!: EntityTable<DismissedAlert, 'key'>;

  constructor(name = 'misraf') {
    super(name);
    this.version(1).stores({
      transactions: 'id, occurredAt, categoryId, merchantKey, fingerprint, kind, pending, needsReview',
      unparsed: 'id, receivedAt, fingerprint',
      categories: 'id, order, parentId',
      rules: 'id, categoryId, priority',
      budgets: 'id',
      incomeSources: 'id',
      settings: 'id',
      dismissedAlerts: 'key',
    });
  }
}

export const db = new MisrafDatabase();

export const DEFAULT_SETTINGS: Settings = {
  language: 'ar',
  theme: 'system',
  budgetStartDay: 1,
  currency: 'SAR',
  notificationsEnabled: false,
  confirmIncome: true,
  onboarded: false,
};
