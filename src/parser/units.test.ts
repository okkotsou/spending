import { describe, expect, it } from 'vitest';
import { fingerprint, foldArabic, matchable, normalize, normalizeDigits } from './normalize';
import {
  canonicalCurrency,
  findLabelledBareAmount,
  findMoney,
  findSarEquivalent,
  parseNumber,
  stripBalanceClauses,
} from './money';
import { findDate, parseTimestampHeader } from './dates';
import { prettyMerchant } from './merchants';

const REFERENCE = new Date(2024, 5, 20, 12, 0, 0);

describe('normalize', () => {
  it('converts both Arabic digit systems to ASCII', () => {
    expect(normalizeDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(normalizeDigits('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
  });

  it('normalises Arabic separators and the riyal ligature', () => {
    expect(normalize('١٢٣٤٫٥٦')).toBe('1234.56');
    expect(normalize('٬')).toBe(',');
    expect(normalize('﷼ 20')).toBe('SAR 20');
  });

  it('removes diacritics, tatweel and bidi controls', () => {
    expect(normalize('المبلـــغ')).toBe('المبلغ');
    expect(normalize('شِراء')).toBe('شراء');
    expect(normalize('‏شراء‬')).toBe('شراء');
  });

  it('collapses whitespace but preserves line structure', () => {
    expect(normalize('a  b\r\n\r\n\r\nc')).toBe('a b\n\nc');
  });

  it('folds Arabic letter variants without changing length', () => {
    const input = normalize('أهلاً إلى آية ىة ؤ ئ');
    expect(foldArabic(input)).toHaveLength(input.length);
    expect(foldArabic('إلى')).toBe('الي');
  });

  it('keeps matchable index-aligned with normalize', () => {
    const raw = 'لدى: مقهى الصباح\nالمبلغ: 20.00 ريال';
    expect(matchable(raw)).toHaveLength(normalize(raw).length);
  });

  it('produces the same fingerprint for the same message rewrapped', () => {
    expect(fingerprint('شراء\nالمبلغ: 20.00')).toBe(fingerprint('شراء   المبلغ: 20.00'));
    expect(fingerprint('شراء 20')).not.toBe(fingerprint('شراء 21'));
  });
});

describe('money', () => {
  it('reads a currency before or after the number', () => {
    expect(findMoney('SAR 1,234.50')[0]).toMatchObject({ amount: 1234.5, currency: 'SAR' });
    expect(findMoney('1,234.50 ريال')[0]).toMatchObject({ amount: 1234.5, currency: 'SAR' });
    expect(findMoney('15.49 USD')[0]).toMatchObject({ amount: 15.49, currency: 'USD' });
  });

  it('does not read a currency token buried inside a word', () => {
    expect(findMoney('20 مدرسه')).toHaveLength(0);
    expect(findMoney('المبلغ بالريال 58.10')).toHaveLength(0);
  });

  it('strips balance clauses before extraction', () => {
    const text = matchable('تم شراء بمبلغ 32.00 ريال\nالرصيد المتبقي 418.20 ريال');
    const stripped = stripBalanceClauses(text);
    expect(findMoney(stripped)).toHaveLength(1);
    expect(findMoney(stripped)[0]?.amount).toBe(32);
  });

  it('keeps the transaction half of a line that also names a balance', () => {
    const text = matchable('شراء 32.00 ريال، الرصيد 418.20 ريال');
    expect(findMoney(stripBalanceClauses(text))).toHaveLength(1);
  });

  it('reads an amount that has a label but no currency', () => {
    expect(findLabelledBareAmount(matchable('المبلغ: 87.40'))).toBe(87.4);
    expect(findLabelledBareAmount('nothing here')).toBeUndefined();
  });

  it('reads the riyal equivalent of a foreign charge', () => {
    expect(findSarEquivalent(matchable('المبلغ بالريال: 58.10'))).toBe(58.1);
    expect(findSarEquivalent('Amount in SAR:58.10')).toBe(58.1);
    expect(findSarEquivalent('no equivalent')).toBeUndefined();
  });

  it('falls back to SAR for an unknown currency token', () => {
    expect(canonicalCurrency('zzz')).toBe('SAR');
    expect(canonicalCurrency('ر.س.')).toBe('SAR');
  });

  it('parses numbers with thousands separators', () => {
    expect(parseNumber('12,499.99')).toBe(12499.99);
    expect(Number.isNaN(parseNumber('abc'))).toBe(true);
  });
});

describe('dates', () => {
  const at = (y: number, m: number, d: number, hh = 0, mm = 0) =>
    new Date(y, m - 1, d, hh, mm).getTime();

  it('reads an unambiguous four-digit year in either position', () => {
    expect(findDate('2024/06/12 18:02', REFERENCE)?.at).toBe(at(2024, 6, 12, 18, 2));
    expect(findDate('12/06/2024', REFERENCE)?.at).toBe(at(2024, 6, 12));
  });

  it('resolves a two-digit triple toward the reference date', () => {
    expect(findDate('24-06-12', REFERENCE)?.at).toBe(at(2024, 6, 12));
    expect(findDate('12-06-24', REFERENCE)?.at).toBe(at(2024, 6, 12));
  });

  it('never resolves a date into the future', () => {
    expect(findDate('27/06/24', REFERENCE)?.at).toBe(at(2024, 6, 27));
  });

  it('reads month names in both languages', () => {
    expect(findDate(matchable('12 يونيو 2024'), REFERENCE)?.at).toBe(at(2024, 6, 12));
    expect(findDate('12 Jun 2024', REFERENCE)?.at).toBe(at(2024, 6, 12));
    expect(findDate('Jun 12, 2024', REFERENCE)?.at).toBe(at(2024, 6, 12));
  });

  it('reads a twelve-hour clock in both languages', () => {
    expect(findDate('12/06/2024 08:05 PM', REFERENCE)?.at).toBe(at(2024, 6, 12, 20, 5));
    expect(findDate(matchable('12/06/2024 07:30 م'), REFERENCE)?.at).toBe(at(2024, 6, 12, 19, 30));
    expect(findDate('12/06/2024 12:15 AM', REFERENCE)?.at).toBe(at(2024, 6, 12, 0, 15));
  });

  it('reports whether a time was present', () => {
    expect(findDate('12/06/2024', REFERENCE)?.hasTime).toBe(false);
    expect(findDate('12/06/2024 09:00', REFERENCE)?.hasTime).toBe(true);
  });

  it('rejects impossible dates', () => {
    expect(findDate('32/13/2024', REFERENCE)).toBeUndefined();
    expect(findDate('no date here', REFERENCE)).toBeUndefined();
  });

  it('reads timestamp headers, absolute and relative', () => {
    expect(parseTimestampHeader('12/06/2024 21:05', REFERENCE)).toBe(at(2024, 6, 12, 21, 5));
    expect(parseTimestampHeader('Today 3:41 PM', REFERENCE)).toBe(at(2024, 6, 20, 15, 41));
    expect(parseTimestampHeader('Yesterday 09:00', REFERENCE)).toBe(at(2024, 6, 19, 9, 0));
    expect(parseTimestampHeader(matchable('أمس 09:00'), REFERENCE)).toBe(at(2024, 6, 19, 9, 0));
  });

  it('does not read a message body as a header', () => {
    expect(parseTimestampHeader('المبلغ: 20.00 ريال', REFERENCE)).toBeUndefined();
    expect(parseTimestampHeader('', REFERENCE)).toBeUndefined();
  });
});

describe('prettyMerchant', () => {
  it('title-cases shouted Latin names but keeps known acronyms', () => {
    expect(prettyMerchant('JARIR BOOKSTORE')).toBe('Jarir Bookstore');
    expect(prettyMerchant('STC')).toBe('STC');
    expect(prettyMerchant('AL-OTHAIM MARKETS')).toBe('Al-Othaim Markets');
  });

  it('leaves an already mixed-case name alone', () => {
    expect(prettyMerchant('iHerb')).toBe('iHerb');
  });

  it('strips gateway prefixes, terminal numbers and city suffixes', () => {
    expect(prettyMerchant('SQ *SALT BURGER')).toBe('Salt Burger');
    expect(prettyMerchant('CARREFOUR 00231')).toBe('Carrefour');
    expect(prettyMerchant('PANDA JEDDAH')).toBe('Panda');
  });

  it('falls back to the original when stripping would empty the name', () => {
    expect(prettyMerchant('- RIYADH')).toBe('- RIYADH');
    expect(prettyMerchant('RIYADH')).toBe('Riyadh');
  });

  it('leaves Arabic names intact', () => {
    expect(prettyMerchant('قهوة الرياض')).toBe('قهوة الرياض');
  });
});
