import { beforeEach, describe, expect, it } from 'vitest';
import {
  budgetMonthFor,
  clampStartDay,
  dayIndex,
  daysRemaining,
  elapsedFraction,
  recentBudgetMonths,
  shiftBudgetMonth,
  totalDays,
} from './budgetMonth';
import {
  compareByUrgency,
  computeStatus,
  roundLimit,
  rolloverFrom,
  suggestLimit,
} from './budget';
import {
  categorySpendAcross,
  countsAsIncome,
  countsAsSpend,
  dailySeries,
  incomeByKind,
  monthlyTotals,
  spendByCategory,
  spendToSamePoint,
  topMerchants,
  totalIncome,
  totalSpend,
} from './stats';
import { detectRecurring, estimatedMonthlyTotal, renewingSoon } from './recurring';
import { buildAlerts, withoutDismissed } from './alerts';
import { buildInsights } from './insights';
import { categorise, learnedRuleFor, MANUAL_RULE_PRIORITY } from '@/categorize/engine';
import { defaultCategories } from '@/categorize/categories';
import type { Budget, CategoryRule, Transaction } from '@/types';

const CATEGORY_IDS = new Set(defaultCategories().map((c) => c.id));
const at = (y: number, m: number, d: number, hh = 12) => new Date(y, m - 1, d, hh).getTime();

let counter = 0;
function tx(partial: Partial<Transaction> & { amountSar: number }): Transaction {
  counter += 1;
  const amount = partial.amountSar;
  return {
    id: `t${counter}`,
    kind: 'purchase',
    amount,
    currency: 'SAR',
    merchant: 'Panda',
    merchantRaw: 'PANDA',
    merchantKey: 'panda',
    occurredAt: at(2024, 6, 10),
    dateSource: 'message',
    timeKnown: true,
    categoryId: 'groceries',
    categorySource: 'auto',
    source: 'paste',
    raw: 'raw',
    fingerprint: `fp${counter}`,
    pending: false,
    needsReview: false,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

beforeEach(() => {
  counter = 0;
});

describe('budget month', () => {
  it('runs from the first of the month when the start day is 1', () => {
    const month = budgetMonthFor(at(2024, 6, 15), 1);
    expect(new Date(month.start).getDate()).toBe(1);
    expect(new Date(month.start).getMonth()).toBe(5);
    expect(totalDays(month)).toBe(30);
    expect(month.key).toBe('2024-06');
  });

  it('runs from payday to payday when the start day is 27', () => {
    const month = budgetMonthFor(at(2024, 6, 15), 27);
    expect(new Date(month.start).getDate()).toBe(27);
    expect(new Date(month.start).getMonth()).toBe(4);
    expect(new Date(month.end).getDate()).toBe(27);
    expect(new Date(month.end).getMonth()).toBe(5);
    // Labelled by the month its last day falls in.
    expect(month.key).toBe('2024-06');
  });

  it('rolls into the next period on payday itself', () => {
    const month = budgetMonthFor(at(2024, 6, 27), 27);
    expect(new Date(month.start).getMonth()).toBe(5);
    expect(month.key).toBe('2024-07');
  });

  it('clamps the start day into a range every month has', () => {
    expect(clampStartDay(31)).toBe(28);
    expect(clampStartDay(0)).toBe(1);
    expect(clampStartDay(Number.NaN)).toBe(1);
    const february = budgetMonthFor(at(2024, 2, 10), 28);
    expect(new Date(february.start).getDate()).toBe(28);
  });

  it('shifts and lists periods consistently', () => {
    const june = budgetMonthFor(at(2024, 6, 15), 27);
    const may = shiftBudgetMonth(june, -1, 27);
    expect(may.end).toBe(june.start);
    const recent = recentBudgetMonths(at(2024, 6, 15), 27, 3);
    expect(recent).toHaveLength(3);
    expect(recent[2]?.key).toBe(june.key);
    expect(recent[0]?.end).toBe(recent[1]?.start);
  });

  it('measures elapsed days and days remaining', () => {
    const month = budgetMonthFor(at(2024, 6, 15), 1);
    expect(dayIndex(month, at(2024, 6, 1))).toBe(0);
    expect(dayIndex(month, at(2024, 6, 15))).toBe(14);
    expect(elapsedFraction(month, at(2024, 6, 15))).toBeCloseTo(15 / 30, 5);
    expect(elapsedFraction(month, at(2024, 5, 1))).toBe(0);
    expect(elapsedFraction(month, at(2024, 7, 5))).toBe(1);
    expect(daysRemaining(month, at(2024, 6, 15))).toBe(16);
    expect(daysRemaining(month, at(2024, 7, 5))).toBe(0);
  });
});

describe('budget status', () => {
  const month = budgetMonthFor(at(2024, 6, 15), 1);
  const budget: Budget = { id: 'groceries', limit: 1000, rollover: false };

  it('reports on track when spending matches the pace', () => {
    const status = computeStatus('groceries', 500, budget, month, at(2024, 6, 15));
    expect(status.pace).toBe('on_track');
    expect(status.remaining).toBe(500);
    expect(status.ratio).toBeCloseTo(0.5, 5);
    expect(status.safePerDay).toBeCloseTo(500 / 16, 5);
  });

  it('reports ahead of pace past the tolerance and projects the total', () => {
    const status = computeStatus('groceries', 800, budget, month, at(2024, 6, 15));
    expect(status.pace).toBe('ahead');
    expect(status.projectedTotal).toBeCloseTo(1600, 5);
    expect(status.projectedBreachAt).toBeDefined();
    const breach = new Date(status.projectedBreachAt ?? 0);
    expect(breach.getMonth()).toBe(5);
    expect(breach.getDate()).toBeGreaterThanOrEqual(18);
    expect(breach.getDate()).toBeLessThanOrEqual(20);
  });

  it('reports over the limit with the overage', () => {
    const status = computeStatus('groceries', 1200, budget, month, at(2024, 6, 15));
    expect(status.pace).toBe('over');
    expect(status.remaining).toBe(-200);
    expect(status.safePerDay).toBe(0);
    expect(status.projectedBreachAt).toBeUndefined();
  });

  it('has no pace opinion without a limit', () => {
    const status = computeStatus('groceries', 300, undefined, month, at(2024, 6, 15));
    expect(status.pace).toBe('no_limit');
    expect(status.limit).toBe(0);
  });

  it('adds carried-over budget to the limit', () => {
    const status = computeStatus('groceries', 900, budget, month, at(2024, 6, 15), 300);
    expect(status.limit).toBe(1300);
    expect(status.remaining).toBe(400);
    // Still ahead of pace: the carried budget raises the ceiling, not the rate.
    expect(status.pace).toBe('ahead');
    // What carries into next month is measured against the configured limit.
    expect(rolloverFrom(status)).toBe(100);
    expect(rolloverFrom(undefined)).toBe(0);
  });

  it('sorts the health list worst first', () => {
    const over = computeStatus('a', 1200, budget, month, at(2024, 6, 15));
    const ahead = computeStatus('b', 800, budget, month, at(2024, 6, 15));
    const fine = computeStatus('c', 100, budget, month, at(2024, 6, 15));
    const none = computeStatus('d', 50, undefined, month, at(2024, 6, 15));
    const sorted = [fine, none, over, ahead].sort(compareByUrgency).map((s) => s.categoryId);
    expect(sorted).toEqual(['a', 'b', 'c', 'd']);
  });

  it('suggests a tidy limit from months that were actually used', () => {
    expect(suggestLimit([900, 1100, 0])).toBe(1100);
    expect(suggestLimit([0, 0])).toBe(0);
    expect(roundLimit(37)).toBe(40);
    expect(roundLimit(412)).toBe(450);
    expect(roundLimit(2310)).toBe(2400);
    expect(roundLimit(7100)).toBe(7500);
    expect(roundLimit(0)).toBe(0);
  });
});

describe('statistics', () => {
  const month = budgetMonthFor(at(2024, 6, 15), 1);

  it('excludes reversed charges and unconfirmed inflows', () => {
    const charge = tx({ amountSar: 100, id: 'c', reversedBy: 'r' });
    const refund = tx({ amountSar: 100, kind: 'refund', reverses: 'c' });
    const salaryPending = tx({ amountSar: 9000, kind: 'salary', pending: true });
    const salary = tx({ amountSar: 9000, kind: 'salary' });
    expect(countsAsSpend(charge)).toBe(false);
    expect(countsAsSpend(refund)).toBe(false);
    expect(countsAsIncome(salaryPending)).toBe(false);
    expect(totalSpend([charge, refund])).toBe(0);
    expect(totalIncome([salary, salaryPending])).toBe(9000);
  });

  it('groups by category and by merchant', () => {
    const rows = [
      tx({ amountSar: 100 }),
      tx({ amountSar: 50, categoryId: 'fuel', merchantKey: 'sasco', merchant: 'Sasco' }),
      tx({ amountSar: 25 }),
    ];
    expect(spendByCategory(rows)).toEqual([
      { categoryId: 'groceries', amount: 125, count: 2 },
      { categoryId: 'fuel', amount: 50, count: 1 },
    ]);
    expect(topMerchants(rows, 1)[0]).toMatchObject({ merchantKey: 'panda', amount: 125 });
  });

  it('builds a cumulative daily series with an ideal pace line', () => {
    const rows = [
      tx({ amountSar: 100, occurredAt: at(2024, 6, 2) }),
      tx({ amountSar: 50, occurredAt: at(2024, 6, 5) }),
    ];
    const series = dailySeries(rows, month, at(2024, 6, 10), 3000);
    expect(series).toHaveLength(30);
    expect(series[0]?.spent).toBe(0);
    expect(series[1]?.spent).toBe(100);
    expect(series[4]?.spent).toBe(150);
    expect(series[9]?.spent).toBe(150);
    expect(series[9]?.elapsed).toBe(true);
    expect(series[10]?.elapsed).toBe(false);
    expect(series[29]?.ideal).toBeCloseTo(3000, 5);
  });

  it('compares to the same point in the previous month', () => {
    const may = budgetMonthFor(at(2024, 5, 15), 1);
    const rows = [
      tx({ amountSar: 200, occurredAt: at(2024, 5, 3) }),
      tx({ amountSar: 400, occurredAt: at(2024, 5, 20) }),
    ];
    expect(spendToSamePoint(rows, may, 10)).toBe(200);
    expect(spendToSamePoint(rows, may, 31)).toBe(600);
  });

  it('totals a run of months', () => {
    const months = recentBudgetMonths(at(2024, 6, 15), 1, 2);
    const rows = [
      tx({ amountSar: 100, occurredAt: at(2024, 5, 10) }),
      tx({ amountSar: 300, occurredAt: at(2024, 6, 10) }),
      tx({ amountSar: 5000, kind: 'salary', occurredAt: at(2024, 6, 1) }),
    ];
    const totals = monthlyTotals(rows, months);
    expect(totals[0]).toMatchObject({ spent: 100, income: 0 });
    expect(totals[1]).toMatchObject({ spent: 300, income: 5000 });
  });
});

describe('recurring detection', () => {
  const netflix = (month: number, amount = 56) =>
    tx({
      amountSar: amount,
      merchant: 'Netflix',
      merchantKey: 'netflix',
      categoryId: 'subscriptions',
      occurredAt: at(2024, month, 12),
    });

  it('finds a monthly charge after three occurrences', () => {
    const found = detectRecurring([netflix(4), netflix(5), netflix(6)], at(2024, 6, 20));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ merchantKey: 'netflix', occurrences: 3 });
    expect(found[0]?.amount).toBe(56);
    expect(found[0]?.periodDays).toBeGreaterThan(28);
  });

  it('ignores two occurrences', () => {
    expect(detectRecurring([netflix(5), netflix(6)], at(2024, 6, 20))).toHaveLength(0);
  });

  it('ignores irregular visits to the same merchant', () => {
    const rows = [
      tx({ amountSar: 40, occurredAt: at(2024, 6, 1) }),
      tx({ amountSar: 40, occurredAt: at(2024, 6, 4) }),
      tx({ amountSar: 40, occurredAt: at(2024, 6, 9) }),
    ];
    expect(detectRecurring(rows, at(2024, 6, 20))).toHaveLength(0);
  });

  it('ignores a charge that stopped months ago', () => {
    const found = detectRecurring([netflix(1), netflix(2), netflix(3)], at(2024, 8, 20));
    expect(found).toHaveLength(0);
  });

  it('excludes a one-off purchase at a subscription merchant', () => {
    const rows = [netflix(4), netflix(5), netflix(6), netflix(6, 900)];
    const found = detectRecurring(rows, at(2024, 6, 20));
    expect(found[0]?.occurrences).toBe(3);
  });

  it('estimates a monthly total and lists renewals due soon', () => {
    const found = detectRecurring([netflix(4), netflix(5), netflix(6)], at(2024, 6, 20));
    expect(estimatedMonthlyTotal(found)).toBeGreaterThan(50);
    expect(renewingSoon(found, at(2024, 7, 8), 7)).toHaveLength(1);
    expect(renewingSoon(found, at(2024, 6, 20), 1)).toHaveLength(0);
  });
});

describe('alerts', () => {
  const month = budgetMonthFor(at(2024, 6, 15), 1);
  const budget: Budget = { id: 'groceries', limit: 1000, rollover: false };

  it('folds the pace figures into the approaching alert rather than stacking two', () => {
    const ahead = computeStatus('groceries', 850, budget, month, at(2024, 6, 15));
    const alerts = buildAlerts({
      month,
      now: at(2024, 6, 15),
      statuses: [ahead],
      monthTransactions: [],
      allTransactions: [],
      recurring: [],
    });
    expect(alerts.map((alert) => alert.kind)).toEqual(['approaching']);
    expect(alerts[0]?.values.projected).toBeCloseTo(1700, 5);
    expect(alerts[0]?.values.breachAt).toBeDefined();

    const again = buildAlerts({
      month,
      now: at(2024, 6, 15, 18),
      statuses: [ahead],
      monthTransactions: [],
      allTransactions: [],
      recurring: [],
    });
    expect(again.map((a) => a.key)).toEqual(alerts.map((a) => a.key));

    const dismissed = new Set(alerts.map((alert) => alert.key));
    expect(withoutDismissed(again, dismissed)).toHaveLength(0);
  });

  it('raises a pace alert on its own when the limit is not yet in sight', () => {
    // Sixty-five percent of a limit spent at the halfway point is well ahead
    // of pace without being anywhere near the eighty percent mark.
    const big: Budget = { id: 'groceries', limit: 10_000, rollover: false };
    const ahead = computeStatus('groceries', 6500, big, month, at(2024, 6, 15));
    const alerts = buildAlerts({
      month,
      now: at(2024, 6, 15),
      statuses: [ahead],
      monthTransactions: [],
      allTransactions: [],
      recurring: [],
    });
    expect(alerts.map((alert) => alert.kind)).toEqual(['pace']);
    expect(alerts[0]?.values.projected).toBeCloseTo(13_000, 5);
  });

  it('drops the pace alert once the limit is passed', () => {
    const over = computeStatus('groceries', 1400, budget, month, at(2024, 6, 15));
    const alerts = buildAlerts({
      month,
      now: at(2024, 6, 15),
      statuses: [over],
      monthTransactions: [],
      allTransactions: [],
      recurring: [],
    });
    expect(alerts.map((alert) => alert.kind)).toEqual(['exceeded']);
  });

  it('reports the overage when a limit is passed', () => {
    const over = computeStatus('groceries', 1250, budget, month, at(2024, 6, 20));
    const alerts = buildAlerts({
      month,
      now: at(2024, 6, 20),
      statuses: [over],
      monthTransactions: [],
      allTransactions: [],
      recurring: [],
    });
    const exceeded = alerts.find((alert) => alert.kind === 'exceeded');
    expect(exceeded?.values.over).toBe(250);
    expect(exceeded?.level).toBe('over');
  });

  it('re-arms an exceeded alert when the overage grows materially', () => {
    const first = computeStatus('groceries', 1050, budget, month, at(2024, 6, 20));
    const later = computeStatus('groceries', 1400, budget, month, at(2024, 6, 22));
    const keyOf = (status: typeof first, now: number) =>
      buildAlerts({
        month,
        now,
        statuses: [status],
        monthTransactions: [],
        allTransactions: [],
        recurring: [],
      }).find((alert) => alert.kind === 'exceeded')?.key;
    expect(keyOf(first, at(2024, 6, 20))).not.toBe(keyOf(later, at(2024, 6, 22)));
  });

  it('flags a single charge far above the normal for its category', () => {
    const history = Array.from({ length: 6 }, () => tx({ amountSar: 60 }));
    const big = tx({ amountSar: 900, occurredAt: at(2024, 6, 14) });
    const alerts = buildAlerts({
      month,
      now: at(2024, 6, 15),
      statuses: [],
      monthTransactions: [big],
      allTransactions: [...history, big],
      recurring: [],
    });
    const unusual = alerts.find((alert) => alert.kind === 'unusual');
    expect(unusual?.transactionId).toBe(big.id);
  });

  it('does not flag an unusual charge without enough history', () => {
    const big = tx({ amountSar: 900 });
    const alerts = buildAlerts({
      month,
      now: at(2024, 6, 15),
      statuses: [],
      monthTransactions: [big],
      allTransactions: [big, tx({ amountSar: 60 })],
      recurring: [],
    });
    expect(alerts.find((alert) => alert.kind === 'unusual')).toBeUndefined();
  });

  it('warns about renewals inside the next week', () => {
    const rows = [4, 5, 6].map((m) =>
      tx({
        amountSar: 56,
        merchant: 'Netflix',
        merchantKey: 'netflix',
        occurredAt: at(2024, m, 12),
      }),
    );
    const recurring = detectRecurring(rows, at(2024, 7, 8));
    const alerts = buildAlerts({
      month,
      now: at(2024, 7, 8),
      statuses: [],
      monthTransactions: [],
      allTransactions: rows,
      recurring,
    });
    expect(alerts.find((alert) => alert.kind === 'renewal')?.values.count).toBe(1);
  });
});

describe('insights', () => {
  const month = budgetMonthFor(at(2024, 6, 15), 1);
  const previous = recentBudgetMonths(at(2024, 5, 15), 1, 3);

  it('says there is nothing to say when the month is empty', () => {
    const insights = buildInsights({
      now: at(2024, 6, 15),
      month,
      previousMonths: previous,
      transactions: [],
      recurring: [],
      previousSpendToDate: 0,
      currentSpend: 0,
    });
    expect(insights).toEqual([{ id: 'no_data', kind: 'no_data', tone: 'info', values: {} }]);
  });

  it('reports a category that is well above its recent average', () => {
    const history = [3, 4, 5].flatMap((m) => [
      tx({ amountSar: 200, categoryId: 'fuel', occurredAt: at(2024, m, 10) }),
    ]);
    const current = tx({ amountSar: 400, categoryId: 'fuel', occurredAt: at(2024, 6, 10) });
    const insights = buildInsights({
      now: at(2024, 6, 15),
      month,
      previousMonths: previous,
      transactions: [...history, current],
      recurring: [],
      previousSpendToDate: 200,
      currentSpend: 400,
    });
    const up = insights.find((insight) => insight.kind === 'category_up');
    expect(up?.categoryId).toBe('fuel');
    expect(up?.values.percent).toBe(100);
    expect(insights.find((insight) => insight.kind === 'largest_category')?.values.share).toBe(100);
    expect(insights.find((insight) => insight.kind === 'pace_vs_last_month')?.values.direction).toBe('up');
  });
});

describe('categorisation', () => {
  const base = { amountSar: 50, raw: 'raw', kind: 'purchase' as const };

  it('uses the seeded dictionary in both languages', () => {
    expect(categorise({ ...base, merchantKey: 'panda' }, [], CATEGORY_IDS).categoryId).toBe('groceries');
    expect(categorise({ ...base, merchantKey: 'بنده' }, [], CATEGORY_IDS).categoryId).toBe('groceries');
    expect(categorise({ ...base, merchantKey: 'sasco station' }, [], CATEGORY_IDS).categoryId).toBe('fuel');
    expect(categorise({ ...base, merchantKey: 'netflix' }, [], CATEGORY_IDS).categoryId).toBe('subscriptions');
  });

  it('falls back on the kind, then on Other', () => {
    expect(categorise({ ...base, merchantKey: '', kind: 'atm_withdrawal' }, [], CATEGORY_IDS).categoryId).toBe('cash');
    expect(categorise({ ...base, merchantKey: '', kind: 'transfer_out' }, [], CATEGORY_IDS).categoryId).toBe('transfers');
    expect(categorise({ ...base, merchantKey: 'zzz unknown' }, [], CATEGORY_IDS).categoryId).toBe('other');
  });

  it('lets a manual rule outrank a learned rule and the dictionary', () => {
    const learned = learnedRuleFor('panda', 'other', 1);
    const manual: CategoryRule = {
      id: 'manual',
      origin: 'manual',
      conditions: [{ type: 'merchant_contains', value: 'Panda' }],
      categoryId: 'home',
      enabled: true,
      createdAt: 2,
      priority: MANUAL_RULE_PRIORITY,
    };
    expect(categorise({ ...base, merchantKey: 'panda' }, [learned], CATEGORY_IDS).categoryId).toBe('other');
    expect(categorise({ ...base, merchantKey: 'panda' }, [learned, manual], CATEGORY_IDS).categoryId).toBe('home');
  });

  it('matches amount ranges and message text', () => {
    const rule: CategoryRule = {
      id: 'r',
      origin: 'manual',
      conditions: [
        { type: 'amount_between', min: 40, max: 60 },
        { type: 'message_contains', value: 'إيجار' },
      ],
      categoryId: 'home',
      enabled: true,
      createdAt: 1,
      priority: MANUAL_RULE_PRIORITY,
    };
    expect(categorise({ ...base, merchantKey: 'x', raw: 'ايجار الشقة' }, [rule], CATEGORY_IDS).categoryId).toBe('home');
    expect(categorise({ ...base, amountSar: 90, merchantKey: 'x', raw: 'ايجار' }, [rule], CATEGORY_IDS).categoryId).toBe('other');
  });

  it('ignores disabled rules and rules pointing at a deleted category', () => {
    const disabled: CategoryRule = {
      id: 'd',
      origin: 'manual',
      conditions: [{ type: 'merchant_contains', value: 'panda' }],
      categoryId: 'home',
      enabled: false,
      createdAt: 1,
      priority: MANUAL_RULE_PRIORITY,
    };
    expect(categorise({ ...base, merchantKey: 'panda' }, [disabled], CATEGORY_IDS).categoryId).toBe('groceries');
    const orphan = { ...disabled, id: 'o', enabled: true, categoryId: 'deleted' };
    expect(categorise({ ...base, merchantKey: 'panda' }, [orphan], CATEGORY_IDS).categoryId).toBe('groceries');
  });
});

describe('coverage of the remaining branches', () => {
  const month = budgetMonthFor(at(2024, 6, 15), 1);

  it('reports whole-month alerts separately from category ones', () => {
    const overall = computeStatus('overall', 2600, { id: 'overall', limit: 2500, rollover: false }, month, at(2024, 6, 15));
    const alerts = buildAlerts({
      month,
      now: at(2024, 6, 15),
      statuses: [],
      monthTransactions: [],
      allTransactions: [],
      recurring: [],
      overall,
    });
    const exceeded = alerts.find((alert) => alert.kind === 'exceeded');
    expect(exceeded?.categoryId).toBeUndefined();
    expect(exceeded?.key).toContain('overall');
  });

  it('produces no alerts for a category with no limit', () => {
    const none = computeStatus('groceries', 900, undefined, month, at(2024, 6, 15));
    expect(
      buildAlerts({
        month,
        now: at(2024, 6, 15),
        statuses: [none],
        monthTransactions: [],
        allTransactions: [],
        recurring: [],
      }),
    ).toEqual([]);
  });

  it('ignores a small charge however far above the category median', () => {
    const history = Array.from({ length: 8 }, () => tx({ amountSar: 4 }));
    const small = tx({ amountSar: 120, occurredAt: at(2024, 6, 14) });
    const alerts = buildAlerts({
      month,
      now: at(2024, 6, 15),
      statuses: [],
      monthTransactions: [small],
      allTransactions: [...history, small],
      recurring: [],
    });
    expect(alerts.find((alert) => alert.kind === 'unusual')).toBeUndefined();
  });

  it('reports a category that has fallen against its average', () => {
    const previous = recentBudgetMonths(at(2024, 5, 15), 1, 3);
    const history = [3, 4, 5].map((m) =>
      tx({ amountSar: 800, categoryId: 'fuel', occurredAt: at(2024, m, 10) }),
    );
    const current = tx({ amountSar: 300, categoryId: 'fuel', occurredAt: at(2024, 6, 10) });
    const insights = buildInsights({
      now: at(2024, 6, 15),
      month,
      previousMonths: previous,
      transactions: [...history, current],
      recurring: [],
      previousSpendToDate: 800,
      currentSpend: 300,
    });
    const down = insights.find((insight) => insight.kind === 'category_down');
    expect(down?.tone).toBe('good');
    expect(insights.find((insight) => insight.kind === 'pace_vs_last_month')?.values.direction).toBe('down');
  });

  it('reports quiet days once a week of the month has passed', () => {
    const rows = [tx({ amountSar: 40, occurredAt: at(2024, 6, 2) })];
    const insights = buildInsights({
      now: at(2024, 6, 15),
      month,
      previousMonths: [],
      transactions: rows,
      recurring: [],
      previousSpendToDate: 0,
      currentSpend: 40,
    });
    const quiet = insights.find((insight) => insight.kind === 'quiet_days');
    expect(quiet?.values.days).toBe(14);
    expect(quiet?.values.of).toBe(15);
  });

  it('reports renewals inside the insight list', () => {
    const rows = [4, 5, 6].map((m) =>
      tx({ amountSar: 56, merchant: 'Netflix', merchantKey: 'netflix', occurredAt: at(2024, m, 12) }),
    );
    // The insight list is only built for a month that has spending in it.
    const july = tx({ amountSar: 40, occurredAt: at(2024, 7, 2) });
    const recurring = detectRecurring(rows, at(2024, 7, 8));
    const insights = buildInsights({
      now: at(2024, 7, 8),
      month: budgetMonthFor(at(2024, 7, 8), 1),
      previousMonths: [],
      transactions: [...rows, july],
      recurring,
      previousSpendToDate: 0,
      currentSpend: 56,
    });
    expect(insights.find((insight) => insight.kind === 'renewals_due')?.values.count).toBe(1);
  });

  it('sums a category across a run of months for the suggester', () => {
    const months = recentBudgetMonths(at(2024, 6, 15), 1, 3);
    const rows = [
      tx({ amountSar: 300, categoryId: 'fuel', occurredAt: at(2024, 4, 5) }),
      tx({ amountSar: 500, categoryId: 'fuel', occurredAt: at(2024, 5, 5) }),
      tx({ amountSar: 100, categoryId: 'groceries', occurredAt: at(2024, 5, 5) }),
    ];
    expect(categorySpendAcross(rows, months, 'fuel')).toEqual([300, 500, 0]);
    expect(suggestLimit(categorySpendAcross(rows, months, 'fuel'))).toBe(450);
  });

  it('treats a period that has not started and one that has ended', () => {
    const july = budgetMonthFor(at(2024, 7, 15), 1);
    expect(dailySeries([], july, at(2024, 6, 1))[0]?.elapsed).toBe(false);
    expect(daysRemaining(july, at(2024, 6, 1))).toBe(31);
  });

  it('gives no projected breach when nothing has been spent', () => {
    const status = computeStatus('groceries', 0, { id: 'groceries', limit: 500, rollover: false }, month, at(2024, 6, 15));
    expect(status.projectedBreachAt).toBeUndefined();
    expect(status.projectedTotal).toBe(0);
  });

  it('keeps a stale recurring charge out of the renewal list', () => {
    const rows = [1, 2, 3].map((m) =>
      tx({ amountSar: 56, merchant: 'Old', merchantKey: 'old', occurredAt: at(2024, m, 12) }),
    );
    expect(renewingSoon(detectRecurring(rows, at(2024, 3, 20)), at(2024, 9, 1), 7)).toEqual([]);
  });
});

describe('money between the user own accounts', () => {
  it('is neither spending nor income', () => {
    const rows = [
      tx({ amountSar: 1576, kind: 'self_transfer', merchant: 'STC Bank' }),
      tx({ amountSar: 300, kind: 'self_transfer', merchant: 'urpay' }),
      tx({ amountSar: 612.4 }),
    ];
    expect(totalSpend(rows)).toBeCloseTo(612.4, 2);
    expect(totalIncome(rows)).toBe(0);
    expect(incomeByKind(rows)).toEqual([]);
  });

  it('never reaches a category total, so budgets ignore it', () => {
    const rows = [tx({ amountSar: 1576, kind: 'self_transfer', categoryId: 'transfers' })];
    expect(spendByCategory(rows)).toEqual([]);
  });
});

describe('income by source', () => {
  it('separates a transfer from a person from a salary', () => {
    const rows = [
      tx({ amountSar: 16400, kind: 'salary', merchant: 'STC' }),
      tx({ amountSar: 500, kind: 'transfer_in', merchant: 'Fatimah S' }),
      tx({ amountSar: 200, kind: 'transfer_in', merchant: 'Ahmed K' }),
      tx({ amountSar: 90, kind: 'purchase' }),
    ];
    expect(incomeByKind(rows)).toEqual([
      { kind: 'salary', amount: 16400, count: 1 },
      { kind: 'transfer_in', amount: 700, count: 2 },
    ]);
  });

  it('leaves an unconfirmed transfer out until it is confirmed', () => {
    const held = tx({ amountSar: 500, kind: 'transfer_in', pending: true });
    expect(incomeByKind([held])).toEqual([]);
    expect(totalIncome([held])).toBe(0);
    expect(incomeByKind([{ ...held, pending: false }])[0]?.amount).toBe(500);
    expect(totalIncome([{ ...held, pending: false }])).toBe(500);
  });

  it('never counts a refund as income, confirmed or not', () => {
    const refund = tx({ amountSar: 449, kind: 'refund' });
    expect(incomeByKind([refund])).toEqual([]);
    expect(totalIncome([refund])).toBe(0);
  });
});
