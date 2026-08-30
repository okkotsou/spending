/**
 * Application state.
 *
 * Everything is a live query over IndexedDB, so any write anywhere in the app
 * re-renders whatever depends on it without a store to keep in sync. The
 * provider owns three things beyond the raw data: the current budget month,
 * the derived alerts, and the toast queue.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_SETTINGS } from '@/db/db';
import { ensureSeeded, pruneDismissedAlerts } from '@/db/repo';
import type {
  AlertItem,
  Budget,
  Category,
  CategoryRule,
  DismissedAlert,
  IncomeSource,
  Settings,
  Transaction,
  UnparsedMessage,
} from '@/types';
import { budgetMonthFor, type BudgetMonth } from '@/domain/budgetMonth';
import { detectRecurring, type RecurringCharge } from '@/domain/recurring';
import { buildAlerts, withoutDismissed } from '@/domain/alerts';
import { computeStatus, rolloverFrom, type BudgetStatus } from '@/domain/budget';
import { inMonth, spendByCategory, totalSpend } from '@/domain/stats';
import { newId } from '@/lib/id';

export interface Toast {
  id: string;
  message: string;
  tone: 'info' | 'over';
}

interface AppValue {
  ready: boolean;
  settings: Settings;
  categories: Category[];
  categoryById: Map<string, Category>;
  transactions: Transaction[];
  unparsed: UnparsedMessage[];
  rules: CategoryRule[];
  budgets: Budget[];
  budgetById: Map<string, Budget>;
  incomeSources: IncomeSource[];
  dismissedKeys: Set<string>;
  /** The budget month that contains now, recomputed when the day changes. */
  month: BudgetMonth;
  now: number;
  recurring: RecurringCharge[];
  alerts: AlertItem[];
  toasts: Toast[];
  pushToast: (message: string, tone?: Toast['tone']) => void;
  dismissToast: (id: string) => void;
}

const AppContext = createContext<AppValue | undefined>(undefined);

/** Ticks once when the local day changes, so "this month" stays correct. */
function useDayTick(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const schedule = () => {
      const next = new Date();
      next.setHours(24, 0, 5, 0);
      return window.setTimeout(() => {
        setNow(Date.now());
        timer = schedule();
      }, next.getTime() - Date.now());
    };
    let timer = schedule();
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return now;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [seeded, setSeeded] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const now = useDayTick();

  useEffect(() => {
    let cancelled = false;
    void ensureSeeded()
      .then(() => pruneDismissedAlerts())
      .then(() => {
        if (!cancelled) setSeeded(true);
      })
      .catch(() => {
        if (!cancelled) setSeeded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const settingsRow = useLiveQuery(() => db.settings.get('settings'), [], undefined);
  const categories = useLiveQuery(() => db.categories.orderBy('order').toArray(), [], undefined);
  const transactions = useLiveQuery(
    () => db.transactions.orderBy('occurredAt').reverse().toArray(),
    [],
    undefined,
  );
  const unparsed = useLiveQuery(() => db.unparsed.orderBy('receivedAt').toArray(), [], undefined);
  const rules = useLiveQuery(() => db.rules.toArray(), [], undefined);
  const budgets = useLiveQuery(() => db.budgets.toArray(), [], undefined);
  const incomeSources = useLiveQuery(() => db.incomeSources.toArray(), [], undefined);
  const dismissed = useLiveQuery(() => db.dismissedAlerts.toArray(), [], undefined);

  const settings: Settings = useMemo(() => {
    if (!settingsRow) return { ...DEFAULT_SETTINGS };
    const { id: _id, ...rest } = settingsRow;
    return rest;
  }, [settingsRow]);

  const ready =
    seeded &&
    categories !== undefined &&
    transactions !== undefined &&
    settingsRow !== undefined;

  const visibleCategories = useMemo(
    () => (categories ?? []).filter((category) => !category.archived),
    [categories],
  );
  const categoryById = useMemo(
    () => new Map((categories ?? []).map((category) => [category.id, category])),
    [categories],
  );
  const budgetById = useMemo(
    () => new Map((budgets ?? []).map((budget) => [budget.id, budget])),
    [budgets],
  );
  const dismissedKeys = useMemo(
    () => new Set((dismissed ?? []).map((row: DismissedAlert) => row.key)),
    [dismissed],
  );

  const month = useMemo(
    () => budgetMonthFor(now, settings.budgetStartDay),
    [now, settings.budgetStartDay],
  );

  const rows = useMemo(() => transactions ?? [], [transactions]);

  const recurring = useMemo(() => detectRecurring(rows, now), [rows, now]);

  const alerts = useMemo(() => {
    if (!ready) return [];
    const monthRows = rows.filter((tx) => inMonth(tx, month));
    const perCategory = spendByCategory(monthRows);
    const spentByCategory = new Map(perCategory.map((row) => [row.categoryId, row.amount]));
    const statuses: BudgetStatus[] = [];
    for (const budget of budgets ?? []) {
      if (budget.id === 'overall') continue;
      statuses.push(
        computeStatus(
          budget.id,
          spentByCategory.get(budget.id) ?? 0,
          budget,
          month,
          now,
          budget.rollover ? carriedIn(rows, budget, month, now, settings.budgetStartDay) : 0,
        ),
      );
    }
    const overallBudget = budgetById.get('overall');
    const overall = overallBudget
      ? computeStatus('overall', totalSpend(monthRows), overallBudget, month, now)
      : undefined;

    const built = buildAlerts({
      month,
      now,
      statuses,
      monthTransactions: monthRows,
      allTransactions: rows,
      recurring,
      ...(overall ? { overall } : {}),
    });
    return withoutDismissed(built, dismissedKeys);
  }, [ready, rows, month, now, budgets, budgetById, recurring, dismissedKeys, settings.budgetStartDay]);

  const pushToast = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = newId();
    setToasts((current) => [...current.slice(-2), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 5000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const value = useMemo<AppValue>(
    () => ({
      ready,
      settings,
      categories: visibleCategories,
      categoryById,
      transactions: rows,
      unparsed: unparsed ?? [],
      rules: rules ?? [],
      budgets: budgets ?? [],
      budgetById,
      incomeSources: incomeSources ?? [],
      dismissedKeys,
      month,
      now,
      recurring,
      alerts,
      toasts,
      pushToast,
      dismissToast,
    }),
    [
      ready,
      settings,
      visibleCategories,
      categoryById,
      rows,
      unparsed,
      rules,
      budgets,
      budgetById,
      incomeSources,
      dismissedKeys,
      month,
      now,
      recurring,
      alerts,
      toasts,
      pushToast,
      dismissToast,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

/** Unused budget carried in from the previous period, for rollover categories. */
function carriedIn(
  rows: readonly Transaction[],
  budget: Budget,
  month: BudgetMonth,
  now: number,
  startDay: number,
): number {
  const previous = budgetMonthFor(month.start - 1, startDay);
  const spent = totalSpend(
    rows.filter((tx) => tx.categoryId === budget.id && inMonth(tx, previous)),
  );
  return rolloverFrom(computeStatus(budget.id, spent, budget, previous, now));
}

export function useApp(): AppValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}
