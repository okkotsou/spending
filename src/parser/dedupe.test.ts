import { describe, expect, it } from 'vitest';
import {
  DUPLICATE_WINDOW_MS,
  findDuplicate,
  findReversalTarget,
  informationScore,
  isNearDuplicate,
  merchantsAgree,
  type MatchableTx,
} from './dedupe';
import type { Transaction } from '@/types';

const base: MatchableTx = {
  kind: 'purchase',
  amountSar: 214.5,
  merchantKey: 'amazon',
  last4: '4560',
  occurredAt: new Date(2024, 5, 12, 19, 33).getTime(),
  fingerprint: 'aaaaaaaabbbbbbbb',
  institution: 'alrajhi',
};

describe('merchantsAgree', () => {
  it('accepts identical and empty keys', () => {
    expect(merchantsAgree('amazon', 'amazon')).toBe(true);
    expect(merchantsAgree('amazon', '')).toBe(true);
  });

  it('accepts a truncated form of the same acquirer string', () => {
    expect(merchantsAgree('jarir', 'jarir bookstore')).toBe(true);
  });

  it('rejects unrelated merchants', () => {
    expect(merchantsAgree('panda', 'danube')).toBe(false);
  });

  it('does not treat a very short prefix as agreement', () => {
    expect(merchantsAgree('ikp', 'ikpmarket')).toBe(false);
  });
});

describe('isNearDuplicate', () => {
  it('merges a bank alert and an Apple Pay alert for the same purchase', () => {
    const wallet: MatchableTx = {
      ...base,
      merchantKey: '',
      institution: 'applepay',
      fingerprint: 'ccccccccdddddddd',
      occurredAt: base.occurredAt + 60_000,
    };
    expect(isNearDuplicate(wallet, { ...base, dateSource: 'message' })).toBe(true);
  });

  it('treats an identical re-import as a duplicate whatever the timing', () => {
    expect(isNearDuplicate({ ...base, occurredAt: base.occurredAt + 1e9 }, base)).toBe(true);
  });

  it('merges an undated wallet alert with the dated bank alert days earlier', () => {
    const dated = { ...base, dateSource: 'message' as const };
    const wallet: MatchableTx = {
      ...base,
      institution: 'applepay',
      fingerprint: 'ccccccccdddddddd',
      dateSource: 'received',
      occurredAt: base.occurredAt + 3 * 24 * 60 * 60 * 1000,
    };
    expect(isNearDuplicate(wallet, dated)).toBe(true);
  });

  it('will not merge an undated alert without a card or merchant to confirm it', () => {
    const dated = { ...base, dateSource: 'message' as const, merchantKey: '', last4: undefined };
    const wallet: MatchableTx = {
      ...base,
      merchantKey: '',
      last4: undefined,
      fingerprint: 'ccccccccdddddddd',
      dateSource: 'import',
      occurredAt: base.occurredAt + 3 * 24 * 60 * 60 * 1000,
    };
    expect(isNearDuplicate(wallet, dated)).toBe(false);
  });

  it('will not merge an undated alert beyond the wider window', () => {
    const dated = { ...base, dateSource: 'message' as const };
    const wallet: MatchableTx = {
      ...base,
      fingerprint: 'ccccccccdddddddd',
      dateSource: 'received',
      occurredAt: base.occurredAt + 9 * 24 * 60 * 60 * 1000,
    };
    expect(isNearDuplicate(wallet, dated)).toBe(false);
  });

  it('keeps two genuine charges of the same amount far apart in time', () => {
    const later = {
      ...base,
      dateSource: 'message' as const,
      fingerprint: 'eeeeeeeeffffffff',
      occurredAt: base.occurredAt + DUPLICATE_WINDOW_MS + 1,
    };
    expect(isNearDuplicate(later, base)).toBe(false);
  });

  it('keeps charges on different cards apart', () => {
    const other = { ...base, fingerprint: '11111111ffffffff', last4: '9999' };
    expect(isNearDuplicate(other, base)).toBe(false);
  });

  it('never merges an inflow into an outflow', () => {
    const refund = { ...base, kind: 'refund' as const, fingerprint: '2222222233333333' };
    expect(isNearDuplicate(refund, base)).toBe(false);
  });

  it('finds the duplicate in a list', () => {
    const rows = [{ ...base, merchantKey: 'panda', fingerprint: 'x'.repeat(16) }, base];
    expect(findDuplicate({ ...base, fingerprint: 'y'.repeat(16) }, rows)).toBe(base);
  });
});

describe('informationScore', () => {
  it('prefers the bank alert over the wallet alert', () => {
    const wallet = { ...base, merchantKey: '', institution: 'applepay' };
    expect(informationScore({ ...base, dateSource: 'message' })).toBeGreaterThan(
      informationScore({ ...wallet, dateSource: 'received' }),
    );
  });
});

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: partial.id ?? 'id',
    kind: 'purchase',
    amount: 214.5,
    currency: 'SAR',
    amountSar: 214.5,
    merchant: 'Amazon',
    merchantRaw: 'AMAZON SA',
    merchantKey: 'amazon',
    occurredAt: new Date(2024, 5, 12, 19, 33).getTime(),
    dateSource: 'message',
    timeKnown: true,
    categoryId: 'shopping',
    categorySource: 'auto',
    source: 'paste',
    raw: 'raw',
    fingerprint: 'f'.repeat(16),
    pending: false,
    needsReview: false,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  };
}

describe('findReversalTarget', () => {
  const charge = tx({ id: 'charge' });

  it('links a refund to the charge it cancels', () => {
    const refund: MatchableTx = {
      kind: 'refund',
      amountSar: 214.5,
      merchantKey: 'amazon',
      occurredAt: new Date(2024, 5, 15).getTime(),
      fingerprint: 'r'.repeat(16),
    };
    expect(findReversalTarget(refund, [charge])?.id).toBe('charge');
  });

  it('ignores a charge that has already been reversed', () => {
    const used = tx({ id: 'used', reversedBy: 'other' });
    const refund: MatchableTx = {
      kind: 'refund',
      amountSar: 214.5,
      merchantKey: 'amazon',
      occurredAt: new Date(2024, 5, 15).getTime(),
      fingerprint: 'r'.repeat(16),
    };
    expect(findReversalTarget(refund, [used])).toBeUndefined();
  });

  it('ignores a charge older than the reversal window', () => {
    const refund: MatchableTx = {
      kind: 'refund',
      amountSar: 214.5,
      merchantKey: 'amazon',
      occurredAt: new Date(2025, 5, 15).getTime(),
      fingerprint: 'r'.repeat(16),
    };
    expect(findReversalTarget(refund, [charge])).toBeUndefined();
  });

  it('prefers the named merchant match over an unnamed one', () => {
    const unnamed = tx({ id: 'unnamed', merchantKey: '', occurredAt: new Date(2024, 5, 14).getTime() });
    const refund: MatchableTx = {
      kind: 'refund',
      amountSar: 214.5,
      merchantKey: 'amazon',
      occurredAt: new Date(2024, 5, 15).getTime(),
      fingerprint: 'r'.repeat(16),
    };
    expect(findReversalTarget(refund, [charge, unnamed])?.id).toBe('charge');
  });
});
