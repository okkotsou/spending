/**
 * Number, currency and date formatting.
 *
 * Every figure in the app goes through here, so the digit system, the currency
 * placement and the grouping are decided once. Arabic uses Latin digits by
 * deliberate choice (see DECISIONS.md): the interface relies on tabular lining
 * figures to keep columns aligned, and Eastern Arabic numerals are not
 * available in a tabular form in the chosen typeface.
 */

const cache = new Map<string, Intl.NumberFormat>();

function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  const existing = cache.get(key);
  if (existing) return existing;
  const created = new Intl.NumberFormat(locale, options);
  cache.set(key, created);
  return created;
}

/** `1,234.50` with the riyal symbol; halalas dropped above four figures. */
export function formatMoney(
  value: number,
  locale: string,
  options: { currency?: string; decimals?: 'auto' | 'always' | 'never'; sign?: boolean } = {},
): string {
  const decimals = options.decimals ?? 'auto';
  const magnitude = Math.abs(value);
  const fraction = decimals === 'never' || (decimals === 'auto' && magnitude >= 10000) ? 0 : 2;
  const formatted = numberFormat(locale, {
    style: 'currency',
    currency: options.currency ?? 'SAR',
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
    signDisplay: options.sign ? 'exceptZero' : 'auto',
  }).format(value);
  return formatted;
}

/** The bare number, no currency, for dense table columns and chart axes. */
export function formatAmount(value: number, locale: string, fraction = 2): string {
  return numberFormat(locale, {
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
  }).format(value);
}

/** A short axis label: 1.2k rather than 1,200. */
export function formatCompact(value: number, locale: string): string {
  return numberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function formatPercent(value: number, locale: string): string {
  return numberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(value);
}

const dateCache = new Map<string, Intl.DateTimeFormat>();

function dateFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  const existing = dateCache.get(key);
  if (existing) return existing;
  const created = new Intl.DateTimeFormat(locale, options);
  dateCache.set(key, created);
  return created;
}

export function formatDate(at: number, locale: string): string {
  return dateFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(at);
}

export function formatDayMonth(at: number, locale: string): string {
  return dateFormat(locale, { day: 'numeric', month: 'short' }).format(at);
}

export function formatMonth(at: number, locale: string): string {
  return dateFormat(locale, { month: 'short', year: '2-digit' }).format(at);
}

export function formatMonthLong(at: number, locale: string): string {
  return dateFormat(locale, { month: 'long', year: 'numeric' }).format(at);
}

export function formatTime(at: number, locale: string): string {
  return dateFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(at);
}

/** `Today 14:32` for the last two days, otherwise the date. */
export function formatRelativeDate(
  at: number,
  locale: string,
  labels: { today: string; yesterday: string },
  now = Date.now(),
): string {
  const day = new Date(at);
  const today = new Date(now);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(day, today)) return labels.today;
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameDay(day, yesterday)) return labels.yesterday;
  return formatDayMonth(at, locale);
}

/** `YYYY-MM-DD` in local time, for date inputs. */
export function toDateInputValue(at: number): string {
  const date = new Date(at);
  return [
    date.getFullYear(),
    `${date.getMonth() + 1}`.padStart(2, '0'),
    `${date.getDate()}`.padStart(2, '0'),
  ].join('-');
}

/** `HH:mm` in local time, for time inputs. */
export function toTimeInputValue(at: number): string {
  const date = new Date(at);
  return [`${date.getHours()}`.padStart(2, '0'), `${date.getMinutes()}`.padStart(2, '0')].join(':');
}

/** Reads the pair back into an epoch, falling back to the original value. */
export function fromDateTimeInput(dateValue: string, timeValue: string, fallback: number): number {
  const [y, m, d] = dateValue.split('-').map(Number);
  const [hh, mm] = (timeValue || '00:00').split(':').map(Number);
  if (!y || !m || !d) return fallback;
  const built = new Date(y, m - 1, d, hh ?? 0, mm ?? 0);
  return Number.isNaN(built.getTime()) ? fallback : built.getTime();
}
