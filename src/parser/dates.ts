/**
 * Date and time extraction.
 *
 * Saudi bank messages use at least five layouts. Only one of them is
 * unambiguous, so the rules below resolve the rest with an explicit,
 * documented preference (see DECISIONS.md): day-first, because that is the
 * civil convention in the region and every sampled bank follows it.
 */

const AR_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'ابريل',
  'مايو',
  'يونيو',
  'يوليو',
  'اغسطس',
  'سبتمبر',
  'اكتوبر',
  'نوفمبر',
  'ديسمبر',
];

const EN_MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

export interface FoundDate {
  /** Epoch milliseconds in the runtime's local time zone. */
  at: number;
  /** True when the message carried a clock time, not just a calendar date. */
  hasTime: boolean;
}

function clampYear(year: number): number {
  if (year >= 1000) return year;
  // Two-digit years in bank messages are always this century.
  return 2000 + year;
}

function build(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): number | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  if (hour > 23 || minute > 59 || second > 59) return undefined;
  const date = new Date(year, month - 1, day, hour, minute, second, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return undefined;
  }
  return date.getTime();
}

const TIME = String.raw`(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm|ص|م)?`;

interface Clock {
  hour: number;
  minute: number;
  second: number;
  found: boolean;
}

function readClock(text: string, from: number): Clock {
  const window = text.slice(from, from + 40);
  const match = new RegExp(TIME, 'i').exec(window);
  if (!match) return { hour: 0, minute: 0, second: 0, found: false };
  let hour = Number.parseInt(match[1] ?? '0', 10);
  const minute = Number.parseInt(match[2] ?? '0', 10);
  const second = Number.parseInt(match[3] ?? '0', 10);
  const meridiem = (match[4] ?? '').toLowerCase();
  if ((meridiem === 'pm' || meridiem === 'م') && hour < 12) hour += 12;
  if ((meridiem === 'am' || meridiem === 'ص') && hour === 12) hour = 0;
  if (hour > 23 || minute > 59 || second > 59) return { hour: 0, minute: 0, second: 0, found: false };
  return { hour, minute, second, found: true };
}

/** `12 Jun 2024`, `12 يونيو 2024`, `Jun 12 2024`. */
const NAMED_MONTH = new RegExp(
  String.raw`(?:(\d{1,2})\s+(${[...AR_MONTHS, ...EN_MONTHS].join('|')})[a-z]*\.?\s*,?\s*(\d{4})?|(${EN_MONTHS.join('|')})[a-z]*\.?\s+(\d{1,2}),?\s*(\d{4})?)`,
  'iu',
);

/** A message may be stamped slightly ahead of the device clock, never more. */
const FUTURE_TOLERANCE_MS = 36 * 60 * 60 * 1000;

/** Any `a-b-c` numeric date, in either separator style. */
const NUMERIC_DATE = /(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})/;

/**
 * Resolves a numeric triple to a calendar date.
 *
 * A four-digit group pins the year outright. When every group is two digits
 * the layout is genuinely ambiguous (`24-06-12` is `2024-06-12` year-first and
 * `24 Jun 2012` day-first), so both readings are built, any reading in the
 * future is discarded because a bank does not announce tomorrow's purchase,
 * and the surviving reading closest to the reference date wins. A tie falls to
 * day-first, the civil convention in the region (see DECISIONS.md).
 */
function resolveNumericDate(
  aRaw: string,
  bRaw: string,
  cRaw: string,
  clock: Clock,
  reference: Date,
): number | undefined {
  const a = Number.parseInt(aRaw, 10);
  const b = Number.parseInt(bRaw, 10);
  const c = Number.parseInt(cRaw, 10);
  const make = (year: number, month: number, day: number) =>
    build(year, month, day, clock.hour, clock.minute, clock.second);

  if (aRaw.length === 4 || a > 31) return make(clampYear(a), b, c);
  if (cRaw.length === 4) return b > 12 ? make(clampYear(c), a, b) : make(clampYear(c), b, a);

  const dayFirst = make(clampYear(c), b, a);
  const yearFirst = make(clampYear(a), b, c);
  const horizon = reference.getTime() + FUTURE_TOLERANCE_MS;
  const options = [
    { at: dayFirst, tieBreak: 0 },
    { at: yearFirst, tieBreak: 1 },
  ].filter((o): o is { at: number; tieBreak: number } => o.at !== undefined && o.at <= horizon);

  if (options.length === 0) return dayFirst ?? yearFirst;
  return options.reduce((best, option) => {
    const bestGap = Math.abs(best.at - reference.getTime());
    const gap = Math.abs(option.at - reference.getTime());
    if (gap < bestGap) return option;
    if (gap === bestGap) return best.tieBreak <= option.tieBreak ? best : option;
    return best;
  }).at;
}

/**
 * Finds the transaction date in a message. Returns `undefined` when the
 * message carries no date at all, which is common for wallet push alerts; the
 * caller then falls back to the received or import time.
 */
export function findDate(text: string, reference: Date = new Date()): FoundDate | undefined {
  const named = NAMED_MONTH.exec(text);
  if (named) {
    const allMonths = [...AR_MONTHS, ...EN_MONTHS];
    const after = named.index + named[0].length;
    if (named[2] !== undefined) {
      const day = Number.parseInt(named[1] ?? '0', 10);
      const token = named[2].toLowerCase();
      const idx = allMonths.findIndex((m) => token.startsWith(m.toLowerCase()));
      const year = named[3] ? clampYear(Number.parseInt(named[3], 10)) : reference.getFullYear();
      const clock = readClock(text, after);
      const at = build(year, (idx % 12) + 1, day, clock.hour, clock.minute, clock.second);
      if (idx >= 0 && at !== undefined) return { at, hasTime: clock.found };
    } else if (named[4] !== undefined) {
      const idx = EN_MONTHS.findIndex((m) => named[4]!.toLowerCase().startsWith(m));
      const day = Number.parseInt(named[5] ?? '0', 10);
      const year = named[6] ? clampYear(Number.parseInt(named[6], 10)) : reference.getFullYear();
      const clock = readClock(text, after);
      const at = build(year, idx + 1, day, clock.hour, clock.minute, clock.second);
      if (idx >= 0 && at !== undefined) return { at, hasTime: clock.found };
    }
  }

  const numeric = NUMERIC_DATE.exec(text);
  if (numeric) {
    const clock = readClock(text, numeric.index + numeric[0].length);
    const at = resolveNumericDate(
      numeric[1] ?? '',
      numeric[2] ?? '',
      numeric[3] ?? '',
      clock,
      reference,
    );
    if (at !== undefined) return { at, hasTime: clock.found };
  }

  return undefined;
}

/**
 * Reads a bare header line such as `12/06/2024 21:05` or `Today 3:41 PM` that
 * some exports put above each message. Returns undefined when the line carries
 * anything other than a timestamp, so message bodies are never consumed.
 */
export function parseTimestampHeader(line: string, reference: Date = new Date()): number | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 40) return undefined;
  // The ASCII word boundary does not apply after Arabic script, so the Arabic
  // alternatives close with an explicit non-letter guard instead.
  const relative = /^(?:(today|yesterday)\b|(اليوم|امس)(?![\u0600-\u06FF]))/i.exec(trimmed);
  if (relative) {
    const clock = readClock(trimmed, relative[0].length);
    const base = new Date(reference);
    const word = (relative[1] ?? relative[2] ?? '').toLowerCase();
    if (word === 'yesterday' || word === 'امس') base.setDate(base.getDate() - 1);
    return build(
      base.getFullYear(),
      base.getMonth() + 1,
      base.getDate(),
      clock.hour,
      clock.minute,
      clock.second,
    );
  }
  if (!/^[\d\s:/\-.apmص]+$/i.test(trimmed)) return undefined;
  const found = findDate(trimmed, reference);
  return found?.at;
}
