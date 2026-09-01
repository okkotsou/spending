/**
 * Merchant name cleanup.
 *
 * Acquirer strings are noisy: they carry city and country suffixes, terminal
 * numbers, gateway prefixes and shouting capitals. `prettyMerchant` produces
 * something readable for the table; `merchantKey` produces a stable key used
 * for categorisation, learned rules and near-duplicate detection. The key is
 * deliberately aggressive, the display name deliberately conservative.
 */
import { foldArabic } from './normalize';

/** Gateway and aggregator prefixes that say nothing about the merchant. */
const GATEWAY_PREFIX =
  /^(?:sq\s*\*|sqc\*|paypal\s*\*|pp\*|amzn mktp\s*|amazon\.[a-z]{2,3}\*|apple\.com\/bill|tap\*|checkout\*|hyperpay\*|moyasar\*|payfort\*|stripe\s*\*|pos\s*\d*\s*[-:]?)/i;

/** Trailing location and legal-form tokens. */
/**
 * Trailing location and legal-form tokens.
 *
 * Only Latin city names are stripped. An Arabic acquirer string rarely appends
 * a city, and stripping one would mangle the many real merchants whose name
 * ends in a place ("قهوة الرياض"), so Arabic keeps only the country and branch
 * qualifiers that are unambiguously suffixes.
 */
const TRAILING_NOISE =
  /[\s,.-]+(?:riyadh|jeddah|dammam|khobar|makkah|madinah|mecca|medina|abha|tabuk|jubail|yanbu|hail|qassim|buraidah|taif|najran|jazan|sakaka|arar|ksa|saudi arabia|sau?di|sa|sau|llc|ltd|co|inc|est|branch|فرع|السعودية|السعوديه)\.?$/i;

/** Terminal, store and reference numbers appended by the acquirer. */
const TRAILING_REF = /[\s#*-]+(?:no\.?|store|str|term|ref|#)?\s*\d{2,}\s*$/i;

const KEEP_UPPER = new Set([
  'STC',
  'SA',
  'KSA',
  'ATM',
  'VAT',
  'POS',
  'KFC',
  'IKEA',
  'BMW',
  'MBC',
  'OSN',
  'SACO',
  'SNB',
  'SABB',
  'ANB',
  'BSF',
  'DHL',
  'UPS',
  'H&M',
  'AC',
  'TV',
  'US',
  'UK',
  'AE',
]);

function titleCaseToken(token: string): string {
  if (KEEP_UPPER.has(token.toUpperCase())) return token.toUpperCase();
  if (!/^[A-Z0-9&'.\-/]+$/.test(token)) return token; // already mixed case, leave it
  if (!/[A-Z]/.test(token)) return token;
  return token
    .toLowerCase()
    .replace(/(^|[\s\-'])([a-z])/g, (_m, lead: string, ch: string) => lead + ch.toUpperCase());
}

/** A readable display name. Arabic passes through untouched. */
export function prettyMerchant(raw: string): string {
  let value = raw.trim().replace(GATEWAY_PREFIX, '').trim();
  value = value.replace(TRAILING_REF, '').trim();
  value = value.replace(TRAILING_NOISE, '').trim();
  value = value.replace(/\s{2,}/g, ' ').replace(/[\s,;.\-*]+$/, '').trim();
  if (value.length === 0) return raw.trim();
  return value.split(' ').map(titleCaseToken).join(' ');
}

/**
 * Matching key: folded, lowercased, punctuation and digits removed. Two
 * spellings of the same merchant collapse onto the same key, which is what
 * learned category rules and duplicate detection compare on.
 */
export function merchantKey(raw: string): string {
  const pretty = prettyMerchant(raw);
  return foldArabic(pretty)
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, ' ')
    .replace(/\b\d+\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
