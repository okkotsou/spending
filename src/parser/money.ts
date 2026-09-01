/**
 * Amount and currency extraction.
 *
 * The hard parts are that the currency can sit before or after the number, be
 * written in Arabic or Latin, and that a single message often carries an
 * amount the user cares about (the charge) next to one they do not (the
 * remaining balance). Balance clauses are stripped before extraction rather
 * than ranked afterwards, because a lower-scoring guess is still a wrong
 * number in someone's budget.
 *
 * Every pattern here expects text that has already been through
 * `matchable()`: ASCII digits, ASCII separators, folded Arabic letters.
 */

/** Currency codes we recognise, with every spelling seen in the wild. */
export const CURRENCY_ALIASES: Record<string, string> = {
  sar: 'SAR',
  sr: 'SAR',
  'ر.س': 'SAR',
  'ر.س.': 'SAR',
  ريال: 'SAR',
  'ريال سعودي': 'SAR',
  usd: 'USD',
  دولار: 'USD',
  aed: 'AED',
  درهم: 'AED',
  eur: 'EUR',
  يورو: 'EUR',
  gbp: 'GBP',
  egp: 'EGP',
  جنيه: 'EGP',
  try: 'TRY',
  kwd: 'KWD',
  bhd: 'BHD',
  qar: 'QAR',
  jod: 'JOD',
  omr: 'OMR',
};

const escapeRe = (token: string) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Alternation of every currency token, longest first so `ريال سعودي` wins. */
const CURRENCY_TOKEN = Object.keys(CURRENCY_ALIASES)
  .sort((a, b) => b.length - a.length)
  .map(escapeRe)
  .join('|');

const NUMBER = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d{1,3})?|\d+(?:\.\d{1,3})?`;

/**
 * `SAR 1,234.50` / `ر.س 1,234.50` / `1,234.50 SAR` / `1,234.50 ريال`.
 * The letter guards stop a currency token from matching inside a longer word.
 */
const AMOUNT_WITH_CURRENCY = new RegExp(
  String.raw`(?:(?<!\p{L})(${CURRENCY_TOKEN})\.?\s*(${NUMBER})|(${NUMBER})\s*(${CURRENCY_TOKEN})(?!\p{L}))`,
  'giu',
);

/** Clauses carrying a number that must never be read as the transaction amount. */
const BALANCE_CLAUSE =
  /(الرصيد|رصيدك|المتبقي|المتاح|balance|available|remaining|credit limit|الحد الائتماني|otp|رمز التحقق|كلمه المرور)/i;

export interface MoneyMatch {
  amount: number;
  currency: string;
  index: number;
}

export function canonicalCurrency(token: string): string {
  const key = token.trim().toLowerCase().replace(/\.$/, '');
  return CURRENCY_ALIASES[key] ?? 'SAR';
}

export function parseNumber(text: string): number {
  const value = Number.parseFloat(text.replace(/,/g, '').trim());
  return Number.isFinite(value) ? value : Number.NaN;
}

/**
 * Drops the parts of a message that describe a balance rather than the
 * transaction, so amount extraction cannot pick them up.
 */
export function stripBalanceClauses(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      if (!BALANCE_CLAUSE.test(line)) return line;
      const parts = line.split(/[,;]\s*|\s+-\s+|\s*\|\s*/);
      return parts.filter((part) => !BALANCE_CLAUSE.test(part)).join(' ').trim();
    })
    .filter((line) => line.length > 0)
    .join('\n');
}

/** Every currency-qualified amount in the text, in order of appearance. */
export function findMoney(text: string): MoneyMatch[] {
  const out: MoneyMatch[] = [];
  const re = new RegExp(AMOUNT_WITH_CURRENCY.source, AMOUNT_WITH_CURRENCY.flags);
  let match: RegExpExecArray | null = re.exec(text);
  while (match !== null) {
    const currencyToken = match[1] ?? match[4] ?? '';
    const numberToken = match[2] ?? match[3] ?? '';
    const amount = parseNumber(numberToken);
    if (Number.isFinite(amount) && amount > 0) {
      out.push({ amount, currency: canonicalCurrency(currencyToken), index: match.index });
    }
    match = re.exec(text);
  }
  return out;
}

/**
 * A bare number attached to an amount label, for formats that omit the
 * currency entirely (`المبلغ: 87.40`).
 */
const LABELLED_BARE_AMOUNT = new RegExp(
  String.raw`(?:بمبلغ|المبلغ|مبلغ|القيمه|قيمه|amount|amt|total)\s*[:\-]?\s*(${NUMBER})(?!\s*%)`,
  'iu',
);

export function findLabelledBareAmount(text: string): number | undefined {
  const match = LABELLED_BARE_AMOUNT.exec(text);
  if (!match || match[1] === undefined) return undefined;
  const value = parseNumber(match[1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/** `المبلغ بالريال: 58.10` / `Amount in SAR 58.10` / `يعادل 58.10 ريال`. */
const SAR_EQUIVALENT = new RegExp(
  String.raw`(?:بالريال|بالعمله المحليه|يعادل|in\s+sar|sar\s+equivalent|equivalent)\s*[:\-]?\s*(?:sar|ريال|ر\.س)?\s*(${NUMBER})`,
  'iu',
);

export function findSarEquivalent(text: string): number | undefined {
  const match = SAR_EQUIVALENT.exec(text);
  if (!match || match[1] === undefined) return undefined;
  const value = parseNumber(match[1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * The total actually debited, when a message states one.
 *
 * A cross-border card purchase reports the goods amount, then the fees, then
 * the sum that leaves the account. The goods amount alone understates the
 * month, so the total is preferred -- but only when it reconciles with the
 * stated fees and VAT. A figure that does not add up is some other total the
 * parser has no business trusting, and the base amount stands.
 */
const TOTAL_DUE = new RegExp(
  String.raw`(?:total(?: due)?(?: amount)?(?: due)?|المبلغ الاجمالي|الاجمالي|اجمالي المبلغ|المبلغ المستحق)\s*[:\-]?\s*(?:sar|ريال|ر\.س)?\s*(${NUMBER})`,
  'iu',
);

const EXTRA_CHARGE = new RegExp(
  String.raw`(?:fees?|vat|tax|رسوم|ضريبه|الضريبه)\s*[:\-]?\s*(?:sar|ريال|ر\.س)?\s*(${NUMBER})`,
  'giu',
);

/** Cents, so a reconciliation is not defeated by binary floating point. */
const cents = (value: number) => Math.round(value * 100);

export function findChargedTotal(text: string, base: number): number | undefined {
  const match = TOTAL_DUE.exec(text);
  if (!match || match[1] === undefined) return undefined;
  const total = parseNumber(match[1]);
  if (!Number.isFinite(total) || total <= base) return undefined;

  let extras = 0;
  const re = new RegExp(EXTRA_CHARGE.source, EXTRA_CHARGE.flags);
  let extra: RegExpExecArray | null = re.exec(text);
  while (extra !== null) {
    const value = parseNumber(extra[1] ?? '');
    if (Number.isFinite(value)) extras += value;
    extra = re.exec(text);
  }

  return cents(base) + cents(extras) === cents(total) ? total : undefined;
}
