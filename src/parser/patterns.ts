/**
 * The rule tables. Everything the parser knows about message formats lives
 * here, as named entries, so supporting a new bank or a reworded alert means
 * adding one row rather than editing parsing logic.
 *
 * Every pattern is matched against `matchable()` output: ASCII digits, folded
 * Arabic letters, no diacritics. Rules are written in ordinary Arabic spelling
 * and folded to match when they are compiled, so there is no second spelling
 * convention to remember.
 */
import type { TxKind } from '@/types';
import { foldArabic } from './normalize';

export interface NamedPattern {
  id: string;
  pattern: RegExp;
}

export interface KindPattern extends NamedPattern {
  kind: TxKind;
}

/**
 * Compiles a rule, folding the Arabic in its source the same way `matchable()`
 * folds the message. Rules can therefore be written in ordinary Arabic
 * spelling (with hamza, ta marbuta and alef maqsura) and still match text that
 * has been folded for comparison. Folding is character-for-character, so regex
 * syntax and escape sequences pass through untouched.
 */
function rule(id: string, source: string, flags = 'i'): NamedPattern {
  return { id, pattern: new RegExp(foldArabic(source), flags) };
}

function kindRule(id: string, kind: TxKind, source: string, flags = 'i'): KindPattern {
  return { id, kind, pattern: new RegExp(foldArabic(source), flags) };
}

/**
 * Messages that carry money-shaped numbers but are not transactions. Checked
 * before anything else so a one-time passcode never becomes a purchase.
 */
export const REJECT_PATTERNS: NamedPattern[] = [
  rule('otp', String.raw`\b(otp|one[- ]time)\b|رمز التحقق|كلمة المرور|رمز الدخول|كود التحقق|لا تشاركه`),
  rule('marketing', String.raw`(عرض خاص|خصم يصل|اشترك الآن في عرض|unsubscribe|للإلغاء أرسل|اربح|سارع)`),
  rule(
    'security-notice',
    String.raw`(تم تحديث بياناتك|تم تفعيل|تم تسجيل الدخول|logged in|password (?:changed|reset))`,
  ),
  rule(
    'statement-notice',
    String.raw`(كشف الحساب جاهز|your statement is ready|فاتورتك جاهزة)`,
  ),
];

/**
 * Transaction kind. Order is significance, not frequency: a refund of a
 * purchase mentions both words, and the refund reading is the correct one.
 */
export const KIND_PATTERNS: KindPattern[] = [
  kindRule('refund-ar', 'refund', String.raw`(استرجاع|استرداد|رد مبلغ|عكس عملية|عملية عكسية|مرتجع|إعادة مبلغ)`),
  kindRule(
    'refund-en',
    'refund',
    String.raw`\b(refund(?:ed)?|reversal|reversed|charge ?back|returned to your card)\b`,
  ),
  kindRule('salary-ar', 'salary', String.raw`(راتب|الراتب|مرتب|مستحقات شهرية)`),
  kindRule('salary-en', 'salary', String.raw`\b(salary|payroll|wages?)\b`),
  kindRule(
    'subscription-ar',
    'subscription',
    String.raw`(تجديد اشتراك|اشتراك شهري|تجديد الاشتراك|اشتراك سنوي)`,
  ),
  kindRule(
    'subscription-en',
    'subscription',
    String.raw`\b(subscription|auto[- ]?renew(?:al|ed)?|recurring (?:payment|charge))\b`,
  ),
  kindRule('atm-ar', 'atm_withdrawal', String.raw`(سحب نقدي|سحب من الصراف|الصراف الآلي|سحب نقد)`),
  kindRule('atm-en', 'atm_withdrawal', String.raw`\b(atm(?: withdrawal| cash)?|cash withdrawal)\b`),
  kindRule(
    'fee-ar',
    'fee',
    String.raw`(?:^|\n)\s*(?:رسوم|رسم|عمولة)(?![\u0600-\u06FF])|رسوم (?:خدمة|إدارية|شهرية|سنوية|تحويل|إصدار)`,
  ),
  kindRule(
    'fee-en',
    'fee',
    String.raw`(?:^|\n)\s*(?:fee|charge)\b|\b(?:service|annual|monthly|transfer) fee\b`,
  ),
  kindRule(
    'transfer-in-ar',
    'transfer_in',
    String.raw`(حوالة واردة|تحويل وارد|مبلغ وارد|تم استلام حوالة|إضافة حوالة)`,
  ),
  kindRule(
    'transfer-in-en',
    'transfer_in',
    String.raw`\b(incoming transfer|transfer received|received transfer|credit transfer)\b`,
  ),
  kindRule(
    'transfer-out-ar',
    'transfer_out',
    String.raw`(حوالة صادرة|تحويل صادر|تحويل إلى|تحويل مبلغ|سداد فاتورة|سداد مدفوعات)`,
  ),
  kindRule(
    'transfer-out-en',
    'transfer_out',
    String.raw`\b(outgoing transfer|transfer(?:red)? to|sent to|bill payment|sadad)\b`,
  ),
  kindRule('deposit-ar', 'deposit', String.raw`(إيداع|تمت إضافة مبلغ|إضافة إلى حسابك)`),
  kindRule('deposit-en', 'deposit', String.raw`\b(deposit(?:ed)?|credited to your account)\b`),
  kindRule(
    'purchase-ar',
    'purchase',
    String.raw`(شراء|نقاط بيع|نقطة بيع|عملية بيع|دفع عبر|مشتريات|تم الدفع)`,
  ),
  kindRule(
    'purchase-en',
    'purchase',
    String.raw`\b(purchase|pos|point of sale|payment at|paid at|card (?:payment|transaction))\b`,
  ),
  // A wallet alert names no operation, only a merchant and a sum. Lowest
  // precedence, so a refund or transfer that also names the wallet still wins.
  kindRule('wallet-alert', 'purchase', String.raw`(apple ?pay|أبل باي|\bmada\b|مدى|stc ?pay|\burpay\b)`),
];

/** The institution or wallet that sent the message. Banks before networks. */
export const INSTITUTION_PATTERNS: NamedPattern[] = [
  rule('alrajhi', String.raw`(الراجحي|al ?rajhi|rajhi)`),
  rule('snb', String.raw`(البنك الأهلي|الأهلي السعودي|\bsnb\b|alahli|\bncb\b)`),
  rule('riyad', String.raw`(بنك الرياض|riyad ?bank)`),
  rule('alinma', String.raw`(الإنماء|alinma)`),
  rule('stcpay', String.raw`(stc ?pay|اس تي سي باي|stcpay)`),
  rule('stcbank', String.raw`(stc ?bank|بنك stc|بنك اس تي سي)`),
  rule('sabb', String.raw`(\bsabb\b|بنك ساب)`),
  rule('anb', String.raw`(العربي الوطني|arab national bank|\banb\b)`),
  rule('bsf', String.raw`(البنك السعودي الفرنسي|banque saudi fransi|\bbsf\b)`),
  rule('albilad', String.raw`(بنك البلاد|bank albilad)`),
  rule('aljazira', String.raw`(بنك الجزيرة|bank aljazira)`),
  rule('urpay', String.raw`(\burpay\b|يور باي)`),
  rule('applepay', String.raw`(apple ?pay|أبل باي)`),
  rule('mada', String.raw`(\bmada\b|مدى)`),
  rule('visa', String.raw`\bvisa\b`),
  rule('mastercard', String.raw`(\bmaster ?card\b|ماستركارد)`),
];

/**
 * Merchant or counterparty. Each pattern captures the name in group 1 and is
 * anchored to the end of the line so a label never swallows the next field.
 */
export const MERCHANT_PATTERNS: NamedPattern[] = [
  rule('lada', String.raw`(?:^|\n)\s*لدى(?:\s*[:\-]\s*|\s+)([^\n]+)`),
  rule('attajir', String.raw`(?:^|\n)\s*(?:التاجر|اسم التاجر|المتجر)(?:\s*[:\-]\s*|\s+)([^\n]+)`),
  rule('inline-lada', String.raw`لدى(?:\s*[:\-]\s*|\s+)([^\n,;]+)`),
  rule('ila', String.raw`(?:^|\n|\s)(?:إلى|لصالح)(?:\s*[:\-]\s*|\s+)(?!حساب|بطاقة)([^\n,;]+)`),
  rule('min', String.raw`(?:^|\n|\s)من(?:\s*[:\-]\s*|\s+)(?!حساب|بطاقة|رصيد|الصراف)([^\n,;]+)`),
  rule('merchant-en', String.raw`(?:^|\n)\s*(?:merchant|store|payee|beneficiary)\s*[:\-]?\s*([^\n]+)`),
  rule('at-en', String.raw`(?:^|\n)\s*at\s*[:\-]?\s*([^\n]+)`),
  rule(
    'at-inline-en',
    String.raw`\b(?:at|from)\s+((?:(?!\b(?:to|on|at|from|for|with|card|account|ending|amount|your|the|was|has)\b)[A-Za-z0-9][A-Za-z0-9.&'*\-_]*[ ]?){1,5})`,
  ),
  rule('pos', String.raw`\bpos\s*[:\-]\s*([^\n,;]+)`),
];

/** Card or account tail. Group 1 is the four digits. */
export const LAST4_PATTERNS: NamedPattern[] = [
  rule('card-label-ar', String.raw`(?:البطاقة|بطاقة)\s*[:\-]?\s*\**\s*(\d{4})\*?`),
  rule('account-label-ar', String.raw`(?:الحساب|حساب)\s*[:\-]?\s*[*x]*\s*(?:sa\d*)?(\d{4})\b`),
  rule('card-label-en', String.raw`\bcard\s*[:\-]?\s*(?:no\.?|number)?\s*[*x.]*\s*(\d{4})\*?`),
  rule('ending-en', String.raw`\bending(?: in| with)?\s*[*.]*\s*(\d{4})`),
  rule('masked', String.raw`[*x.]{2,}\s*(\d{4})\b`),
  rule('trailing-star', String.raw`\b(\d{4})\*`),
];

/** Lines that are structural rather than content, ignored by merchant fallback. */
export const NON_MERCHANT_LINE = new RegExp(
  foldArabic(
    String.raw`^(?:\s*(?:[\d\s:/.,\-*]+|sar|ريال|ر\.س|مدى|mada|visa|master ?card|apple ?pay|stc ?pay|stc ?bank|urpay|شكرا لك|thank you)\s*)$`,
  ),
  'i',
);
