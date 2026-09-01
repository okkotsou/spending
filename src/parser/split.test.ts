import { describe, expect, it } from 'vitest';
import { splitMessages } from './split';
import { parseMessage } from './parse';

const REFERENCE = new Date(2024, 5, 20, 12, 0, 0);

describe('splitMessages', () => {
  it('splits on blank lines', () => {
    const blob = `شراء
المبلغ: 20.00 ريال
لدى: بنده

Purchase
Amount:SAR 30.00
At:PANDA`;
    expect(splitMessages(blob, REFERENCE)).toHaveLength(2);
  });

  it('splits a run of messages with no blank lines between them', () => {
    const blob = `شراء
المبلغ: 20.00 ريال
لدى: بنده
سحب نقدي
المبلغ: 500.00 ريال
الحساب: ****4321
Purchase
Amount:SAR 30.00
At:PANDA`;
    const parts = splitMessages(blob, REFERENCE);
    expect(parts).toHaveLength(3);
    expect(parts[1]?.raw).toContain('سحب نقدي');
  });

  it('attaches a standalone timestamp header to the message below it', () => {
    const blob = `12/06/2024 21:05

stc pay
تم شراء بمبلغ 32.00 ريال
من HUNGERSTATION`;
    const parts = splitMessages(blob, REFERENCE);
    expect(parts).toHaveLength(1);
    expect(parts[0]?.receivedAt).toBe(new Date(2024, 5, 12, 21, 5).getTime());
    expect(parts[0]?.raw.startsWith('stc pay')).toBe(true);
  });

  it('reads a relative timestamp header', () => {
    const parts = splitMessages(`Today 3:41 PM\n\nApple Pay\nNINJA\nSAR 40.00`, REFERENCE);
    expect(parts[0]?.receivedAt).toBe(new Date(2024, 5, 20, 15, 41).getTime());
  });

  it('does not mistake a message body for a timestamp header', () => {
    const parts = splitMessages(`شراء\nالمبلغ: 20.00 ريال`, REFERENCE);
    expect(parts).toHaveLength(1);
    expect(parts[0]?.receivedAt).toBeUndefined();
  });

  it('keeps a bank name header with the message it introduces', () => {
    const blob = `البنك الأهلي السعودي
شراء نقاط بيع
الحساب: ****4321
المبلغ: 87.40 ريال`;
    const parts = splitMessages(blob, REFERENCE);
    expect(parts).toHaveLength(1);
    expect(parts[0]?.raw.startsWith('البنك')).toBe(true);
  });

  it('does not split on a network name that appears inside a message', () => {
    const blob = `شراء انترنت
مدى-أبل باي
بطاقة:4560*;مدى
لدى:AMAZON SA
بمبلغ:SAR 214.50`;
    expect(splitMessages(blob, REFERENCE)).toHaveLength(1);
  });

  it('still splits on a network name that stands alone as a header', () => {
    const blob = `شراء
المبلغ: 20.00 ريال
لدى: بنده
مدى
NINJA
SAR 88.00`;
    expect(splitMessages(blob, REFERENCE)).toHaveLength(2);
  });

  it('returns nothing for an empty paste', () => {
    expect(splitMessages('   \n\n  ', REFERENCE)).toEqual([]);
  });

  it('keeps every message parseable after splitting a mixed-language paste', () => {
    const blob = `شراء
المبلغ: 20.00 ريال
لدى: بنده
التاريخ: 12/06/2024

Purchase
Amount:SAR 30.00
At:PANDA
On:12/06/2024

استرجاع مبلغ
المبلغ: 20.00 ريال
لدى: بنده
التاريخ: 13/06/2024`;
    const parts = splitMessages(blob, REFERENCE);
    expect(parts).toHaveLength(3);
    const kinds = parts.map((part) => {
      const outcome = parseMessage(part.raw, { now: REFERENCE.getTime() });
      return outcome.ok ? outcome.transaction.kind : 'failed';
    });
    expect(kinds).toEqual(['purchase', 'purchase', 'refund']);
  });
});
