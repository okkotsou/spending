import { describe, expect, it } from 'vitest';
import { FIXTURES, FIXTURE_NOW } from './fixtures';
import { parseMessage } from './parse';
import { merchantKey } from './merchants';

/** `YYYY-MM-DD HH:mm` in the runtime's local zone, matching the fixtures. */
function localTime(value: string): number {
  const [date, time] = value.split(' ');
  const [y, m, d] = (date ?? '').split('-').map(Number);
  const [hh, mm] = (time ?? '00:00').split(':').map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0).getTime();
}

const NOW = localTime(FIXTURE_NOW);

describe('parseMessage over the fixture corpus', () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.id}: ${fixture.note}`, () => {
      const options = fixture.receivedAt
        ? { now: NOW, receivedAt: localTime(fixture.receivedAt) }
        : { now: NOW };
      const outcome = parseMessage(fixture.text, options);

      if (fixture.expect === null) {
        expect(outcome.ok, `expected ${fixture.id} to be unrecognised`).toBe(false);
        if (!outcome.ok) expect(outcome.failure.reason).toBe(fixture.reason);
        return;
      }

      expect(outcome.ok, `expected ${fixture.id} to parse`).toBe(true);
      if (!outcome.ok) return;
      const tx = outcome.transaction;
      const want = fixture.expect;

      expect(tx.kind).toBe(want.kind);
      expect(tx.amount).toBeCloseTo(want.amount, 2);
      expect(tx.currency).toBe(want.currency ?? 'SAR');
      if (want.merchant !== undefined) expect(tx.merchant).toBe(want.merchant);
      if (want.merchantKey !== undefined) expect(tx.merchantKey).toBe(want.merchantKey);
      if (want.last4 !== undefined) expect(tx.last4).toBe(want.last4);
      if (want.institution !== undefined) expect(tx.institution).toBe(want.institution);
      if (want.fxAmount !== undefined) expect(tx.fxAmount).toBeCloseTo(want.fxAmount, 2);
      if (want.fxCurrency !== undefined) expect(tx.fxCurrency).toBe(want.fxCurrency);
      if (want.at !== undefined) {
        expect(new Date(tx.occurredAt).toString()).toBe(new Date(localTime(want.at)).toString());
      }
      if (want.needsReview !== undefined) expect(tx.needsReview).toBe(want.needsReview);
      if (want.timeKnown !== undefined) expect(tx.timeKnown).toBe(want.timeKnown);
      // A date-only message must never claim a clock time it did not state.
      if (want.at !== undefined && want.at.endsWith(' 00:00') && !fixture.receivedAt) {
        expect(tx.timeKnown, `${fixture.id} should not claim a time`).toBe(false);
      }
      expect(tx.raw).toBe(fixture.text.trim());
    });
  }

  it('covers at least forty realistic messages', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(40);
  });

  it('keeps the raw text and a stable fingerprint for every parsed message', () => {
    const prints = new Set<string>();
    for (const fixture of FIXTURES) {
      const outcome = parseMessage(fixture.text, { now: NOW });
      const print = outcome.ok ? outcome.transaction.fingerprint : outcome.failure.fingerprint;
      expect(print).toMatch(/^[0-9a-f]{16}$/);
      prints.add(print);
    }
    // No two distinct fixtures may collide on the fingerprint.
    expect(prints.size).toBe(FIXTURES.length);
  });

  it('is deterministic', () => {
    const first = FIXTURES.map((f) => JSON.stringify(parseMessage(f.text, { now: NOW })));
    const second = FIXTURES.map((f) => JSON.stringify(parseMessage(f.text, { now: NOW })));
    expect(second).toEqual(first);
  });
});

describe('merchantKey', () => {
  it('collapses spellings of the same merchant onto one key', () => {
    expect(merchantKey('JARIR BOOKSTORE RIYADH')).toBe(merchantKey('Jarir Bookstore'));
    expect(merchantKey('CARREFOUR 00231')).toBe(merchantKey('carrefour'));
    expect(merchantKey('SQ *SALT BURGER')).toBe(merchantKey('Salt Burger'));
  });

  it('keeps different merchants apart', () => {
    expect(merchantKey('PANDA')).not.toBe(merchantKey('DANUBE'));
  });
});
