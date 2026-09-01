/**
 * The budget month.
 *
 * A salary that lands on the 27th makes the calendar month the wrong unit: by
 * the 1st the money is already a week old. Every total, limit, alert and chart
 * in the app is computed over a budget month that starts on a configurable
 * day, so "this month" means "since I was paid".
 *
 * A period is labelled by the month its last day falls in, which matches how
 * people talk about the money: the salary that arrives on 27 May pays for June.
 */

export interface BudgetMonth {
  /** Inclusive start, local midnight. */
  start: number;
  /** Exclusive end, local midnight. */
  end: number;
  /** `YYYY-MM` of the last day; stable across devices in the same zone. */
  key: string;
  /** Local Date of the last day, for labelling. */
  labelDate: Date;
}

/**
 * Start days above 28 would skip February, so the setting is clamped. The
 * trade-off is documented in DECISIONS.md.
 */
export const MAX_BUDGET_START_DAY = 28;

export function clampStartDay(day: number): number {
  if (!Number.isFinite(day)) return 1;
  return Math.min(MAX_BUDGET_START_DAY, Math.max(1, Math.trunc(day)));
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function anchor(year: number, month: number, day: number): Date {
  return new Date(year, month, day);
}

function keyOf(end: number): { key: string; labelDate: Date } {
  const last = new Date(end - 1);
  const month = `${last.getMonth() + 1}`.padStart(2, '0');
  return { key: `${last.getFullYear()}-${month}`, labelDate: last };
}

/** The budget month containing `at`. */
export function budgetMonthFor(at: number | Date, startDay: number): BudgetMonth {
  const day = clampStartDay(startDay);
  const date = startOfDay(at instanceof Date ? at : new Date(at));
  const startsThisMonth = date.getDate() >= day;
  const start = startsThisMonth
    ? anchor(date.getFullYear(), date.getMonth(), day)
    : anchor(date.getFullYear(), date.getMonth() - 1, day);
  const end = anchor(start.getFullYear(), start.getMonth() + 1, day);
  return { start: start.getTime(), end: end.getTime(), ...keyOf(end.getTime()) };
}

/** The budget month `delta` periods away from `month`. */
export function shiftBudgetMonth(month: BudgetMonth, delta: number, startDay: number): BudgetMonth {
  const start = new Date(month.start);
  return budgetMonthFor(anchor(start.getFullYear(), start.getMonth() + delta, start.getDate()), startDay);
}

/** The last `count` budget months ending with the one containing `at`. */
export function recentBudgetMonths(at: number, startDay: number, count: number): BudgetMonth[] {
  const current = budgetMonthFor(at, startDay);
  const months: BudgetMonth[] = [];
  for (let i = count - 1; i >= 0; i -= 1) months.push(shiftBudgetMonth(current, -i, startDay));
  return months;
}

/** Whole days in the period. Robust across daylight-saving shifts. */
export function totalDays(month: BudgetMonth): number {
  return Math.max(1, Math.round((month.end - month.start) / 86_400_000));
}

/** 0 on the first day of the period, growing by one each local day. */
export function dayIndex(month: BudgetMonth, at: number): number {
  const from = new Date(month.start);
  const to = startOfDay(new Date(at));
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * How far through the period we are, as a fraction in [0, 1].
 *
 * The current day counts as complete, because a limit that is already spent by
 * lunchtime is over pace whatever the clock says. Using elapsed days plus one
 * keeps the ideal-pace line meeting the limit exactly on the final day.
 */
export function elapsedFraction(month: BudgetMonth, at: number): number {
  const days = totalDays(month);
  if (at <= month.start) return 0;
  if (at >= month.end) return 1;
  return Math.min(1, (dayIndex(month, at) + 1) / days);
}

/** Days left including today. Never below zero. */
export function daysRemaining(month: BudgetMonth, at: number): number {
  if (at >= month.end) return 0;
  if (at < month.start) return totalDays(month);
  return Math.max(0, totalDays(month) - dayIndex(month, at));
}

/** Local midnight of day `index` in the period. */
export function dayStart(month: BudgetMonth, index: number): number {
  const start = new Date(month.start);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + index).getTime();
}
