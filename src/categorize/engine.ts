/**
 * Category assignment.
 *
 * Precedence, highest first:
 *   1. user rules, by descending priority (a rule the user wrote wins outright)
 *   2. learned rules, written when the user recategorises a merchant
 *   3. the seeded merchant dictionary
 *   4. a fallback implied by the transaction kind (an ATM withdrawal is cash)
 *   5. Other
 *
 * The function is pure: the same transaction and the same rule set always give
 * the same category, so a rule change can be previewed before it is applied.
 */
import type { CategorySource, CategoryRule, RuleCondition, TxKind } from '@/types';
import { foldArabic } from '@/parser/normalize';
import { DICTIONARY_KEYS } from './dictionary';
import { CASH_CATEGORY_ID, OTHER_CATEGORY_ID, TRANSFERS_CATEGORY_ID } from './categories';

export interface Categorisable {
  merchantKey: string;
  amountSar: number;
  raw: string;
  kind: TxKind;
}

export interface CategoryDecision {
  categoryId: string;
  source: CategorySource;
  /** The rule that decided it, when a rule did. */
  ruleId?: string;
}

/** Kind-implied fallbacks, used only when nothing named the merchant. */
const KIND_FALLBACK: Partial<Record<TxKind, string>> = {
  atm_withdrawal: CASH_CATEGORY_ID,
  deposit: CASH_CATEGORY_ID,
  transfer_in: TRANSFERS_CATEGORY_ID,
  transfer_out: TRANSFERS_CATEGORY_ID,
  salary: TRANSFERS_CATEGORY_ID,
  subscription: 'subscriptions',
};

function conditionMatches(condition: RuleCondition, tx: Categorisable): boolean {
  switch (condition.type) {
    case 'merchant_contains':
      return tx.merchantKey.includes(normaliseNeedle(condition.value));
    case 'message_contains':
      return foldArabic(tx.raw).toLowerCase().includes(normaliseNeedle(condition.value));
    case 'amount_between':
      return tx.amountSar >= condition.min && tx.amountSar <= condition.max;
  }
}

/** Rule text is folded and lower-cased the same way merchant keys are. */
export function normaliseNeedle(value: string): string {
  return foldArabic(value).toLowerCase().trim();
}

/** A rule fires only when every one of its conditions holds. */
export function ruleMatches(rule: CategoryRule, tx: Categorisable): boolean {
  if (!rule.enabled || rule.conditions.length === 0) return false;
  return rule.conditions.every((condition) => conditionMatches(condition, tx));
}

export function categorise(
  tx: Categorisable,
  rules: readonly CategoryRule[],
  knownCategoryIds: ReadonlySet<string>,
): CategoryDecision {
  const ordered = [...rules]
    .filter((rule) => knownCategoryIds.has(rule.categoryId))
    .sort((a, b) => b.priority - a.priority || b.createdAt - a.createdAt);

  for (const rule of ordered) {
    if (ruleMatches(rule, tx)) {
      return {
        categoryId: rule.categoryId,
        source: rule.origin === 'learned' ? 'auto' : 'rule',
        ruleId: rule.id,
      };
    }
  }

  if (tx.merchantKey.length > 0) {
    for (const entry of DICTIONARY_KEYS) {
      if (tx.merchantKey.includes(entry.key) && knownCategoryIds.has(entry.categoryId)) {
        return { categoryId: entry.categoryId, source: 'auto' };
      }
    }
  }

  const fallback = KIND_FALLBACK[tx.kind];
  if (fallback !== undefined && knownCategoryIds.has(fallback)) {
    return { categoryId: fallback, source: 'default' };
  }

  return { categoryId: OTHER_CATEGORY_ID, source: 'default' };
}

/**
 * The rule written when the user recategorises a transaction and asks for the
 * change to apply to every transaction from that merchant. Learned rules sit
 * below manual rules so an explicit rule is never overridden by a correction.
 */
export function learnedRuleFor(
  merchantKeyValue: string,
  categoryId: string,
  now: number,
): CategoryRule {
  return {
    id: `learned:${merchantKeyValue}`,
    origin: 'learned',
    conditions: [{ type: 'merchant_contains', value: merchantKeyValue }],
    categoryId,
    enabled: true,
    createdAt: now,
    priority: 10,
  };
}

/** Priority given to a rule the user writes by hand. */
export const MANUAL_RULE_PRIORITY = 100;
