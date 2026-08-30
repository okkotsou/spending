/**
 * The global period selector.
 *
 * Single-month periods carry a budget month, which is what pace, limits and
 * the ideal-pace line are defined against. Multi-month periods carry a list,
 * and the dashboard swaps the pace card for the trend chart, because a pace
 * line across several months would compare against a limit that never existed.
 */
import { useMemo, useState } from 'react';
import {
  budgetMonthFor,
  recentBudgetMonths,
  shiftBudgetMonth,
  type BudgetMonth,
} from '@/domain/budgetMonth';

export type PeriodId = 'thisMonth' | 'lastMonth' | 'last3' | 'last6' | 'last12';

export const PERIOD_LABELS = {
  thisMonth: 'dashboard.period.thisMonth',
  lastMonth: 'dashboard.period.lastMonth',
  last3: 'dashboard.period.last3',
  last6: 'dashboard.period.last6',
  last12: 'dashboard.period.last12',
} as const;

export const PERIOD_IDS: PeriodId[] = ['thisMonth', 'lastMonth', 'last3', 'last6', 'last12'];

export interface Period {
  id: PeriodId;
  months: BudgetMonth[];
  /** Present only when the period is exactly one budget month. */
  month?: BudgetMonth;
  start: number;
  end: number;
}

export function buildPeriod(id: PeriodId, now: number, startDay: number): Period {
  const current = budgetMonthFor(now, startDay);
  let months: BudgetMonth[];
  switch (id) {
    case 'thisMonth':
      months = [current];
      break;
    case 'lastMonth':
      months = [shiftBudgetMonth(current, -1, startDay)];
      break;
    case 'last3':
      months = recentBudgetMonths(now, startDay, 3);
      break;
    case 'last6':
      months = recentBudgetMonths(now, startDay, 6);
      break;
    case 'last12':
      months = recentBudgetMonths(now, startDay, 12);
      break;
  }
  const first = months[0];
  const last = months[months.length - 1];
  return {
    id,
    months,
    ...(months.length === 1 && first ? { month: first } : {}),
    start: first?.start ?? now,
    end: last?.end ?? now,
  };
}

export function usePeriod(now: number, startDay: number) {
  const [id, setId] = useState<PeriodId>('thisMonth');
  const period = useMemo(() => buildPeriod(id, now, startDay), [id, now, startDay]);
  return { period, periodId: id, setPeriodId: setId };
}
