import { describe, expect, it } from 'vitest';
import {
  formatAmount,
  formatCompact,
  formatDate,
  formatMoney,
  formatPercent,
  formatRelativeDate,
  fromDateTimeInput,
  toDateInputValue,
  toTimeInputValue,
} from './format';

const EN = 'en-GB';
const AR = 'ar-SA-u-nu-latn-ca-gregory';

describe('money', () => {
  it('shows halalas on ordinary amounts and drops them on large ones', () => {
    expect(formatMoney(1234.5, EN)).toContain('1,234.50');
    expect(formatMoney(12345.67, EN)).toContain('12,346');
    expect(formatMoney(12345.67, EN)).not.toContain('.67');
  });

  it('honours explicit decimal choices', () => {
    expect(formatMoney(20, EN, { decimals: 'never' })).toContain('20');
    expect(formatMoney(20, EN, { decimals: 'never' })).not.toContain('.00');
    expect(formatMoney(20000, EN, { decimals: 'always' })).toContain('.00');
  });

  it('signs a net figure when asked', () => {
    expect(formatMoney(120, EN, { sign: true })).toContain('+');
    expect(formatMoney(-120, EN, { sign: true })).toContain('-');
    expect(formatMoney(120, EN)).not.toContain('+');
  });

  it('uses Latin digits in Arabic so columns stay aligned', () => {
    const value = formatMoney(1234.5, AR);
    expect(value).toMatch(/1,234\.50/);
    expect(value).not.toMatch(/[٠-٩]/);
  });
});

describe('numbers', () => {
  it('formats bare amounts and compact axis labels', () => {
    expect(formatAmount(1234.5, EN)).toBe('1,234.50');
    expect(formatAmount(1234.5, EN, 0)).toBe('1,235');
    expect(formatCompact(1200, EN)).toBe('1.2k');
    expect(formatPercent(0.83, EN)).toBe('83%');
  });
});

describe('dates', () => {
  const now = new Date(2024, 5, 20, 12).getTime();

  it('names today and yesterday, then falls back to the date', () => {
    const labels = { today: 'Today', yesterday: 'Yesterday' };
    expect(formatRelativeDate(new Date(2024, 5, 20, 9).getTime(), EN, labels, now)).toBe('Today');
    expect(formatRelativeDate(new Date(2024, 5, 19, 9).getTime(), EN, labels, now)).toBe('Yesterday');
    expect(formatRelativeDate(new Date(2024, 5, 12).getTime(), EN, labels, now)).toContain('12');
  });

  it('formats a full date', () => {
    expect(formatDate(new Date(2024, 5, 12).getTime(), EN)).toContain('2024');
  });

  it('round-trips date and time input values', () => {
    const at = new Date(2024, 5, 12, 19, 33).getTime();
    expect(toDateInputValue(at)).toBe('2024-06-12');
    expect(toTimeInputValue(at)).toBe('19:33');
    expect(fromDateTimeInput('2024-06-12', '19:33', 0)).toBe(at);
  });

  it('falls back when the input is incomplete', () => {
    expect(fromDateTimeInput('', '', 42)).toBe(42);
    expect(fromDateTimeInput('2024-06-12', '', 0)).toBe(new Date(2024, 5, 12).getTime());
  });
});
