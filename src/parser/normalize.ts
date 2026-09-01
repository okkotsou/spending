/**
 * Text normalisation for the message parser.
 *
 * Bank messages arrive with Arabic-Indic digits, decorative diacritics,
 * bidirectional control characters, non-breaking spaces and inconsistent
 * spellings of the same Arabic word. Every rule in `patterns.ts` is written
 * against the output of `normalize()`, so the rules stay readable and the
 * messy input is handled once, here.
 */

const ARABIC_INDIC_START = 0x0660; // ٠..٩
const EXTENDED_ARABIC_INDIC_START = 0x06f0; // ۰..۹

/** Converts Arabic-Indic and Extended Arabic-Indic digits to ASCII. */
export function normalizeDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= ARABIC_INDIC_START && code <= ARABIC_INDIC_START + 9) {
      out += String.fromCharCode(0x30 + (code - ARABIC_INDIC_START));
    } else if (code >= EXTENDED_ARABIC_INDIC_START && code <= EXTENDED_ARABIC_INDIC_START + 9) {
      out += String.fromCharCode(0x30 + (code - EXTENDED_ARABIC_INDIC_START));
    } else {
      out += ch;
    }
  }
  return out;
}

/** Bidi controls, zero-width joiners and the Arabic letter mark. */
const INVISIBLES = /[\u200B-\u200F\u061C\u202A-\u202E\u2066-\u2069\uFEFF]/g;
/** Harakat, superscript alef and the tatweel elongation dash. */
const ARABIC_MARKS = /[\u064B-\u0652\u0670\u0640]/g;

/**
 * Folds Arabic letter variants that banks use interchangeably. Applied only to
 * matching keys, never to text shown back to the user.
 */
export function foldArabic(input: string): string {
  return input
    .replace(ARABIC_MARKS, '')
    .replace(/[آأإٱ]/g, 'ا') // آ أ إ ٱ -> ا
    .replace(/ى/g, 'ي') // ى -> ي
    .replace(/ة/g, 'ه') // ة -> ه
    .replace(/ؤ/g, 'و') // ؤ -> و
    .replace(/ئ/g, 'ي'); // ئ -> ي
}

/**
 * Canonical form used by every pattern: ASCII digits, ASCII decimal and
 * thousands marks, no invisible controls, no diacritics, collapsed spaces,
 * Unix newlines. Line structure is preserved because several formats are
 * line-oriented.
 */
export function normalize(input: string): string {
  return normalizeDigits(input)
    .replace(INVISIBLES, '')
    .replace(ARABIC_MARKS, '')
    .replace(/٫/g, '.') // Arabic decimal separator
    .replace(/٬/g, ',') // Arabic thousands separator
    .replace(/،/g, ',') // Arabic comma
    .replace(/؛/g, ';') // Arabic semicolon
    .replace(/﷼/g, 'SAR') // ﷼ ligature
    .replace(/\r\n?/g, '\n')
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000\t]/g, ' ')
    .replace(/ {2,}/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Normalised plus letter-folded: the form every pattern matches against.
 *
 * Folding is deliberately one character in, one character out, so indexes into
 * this string address the same positions in `normalize(input)`. That lets a
 * pattern match on the folded text and still slice the original casing and
 * spelling out for display. Case is handled with the `i` flag on the patterns
 * rather than by lowercasing, because Unicode lowercasing is not always
 * length-preserving.
 */
export function matchable(input: string): string {
  return foldArabic(normalize(input));
}

/**
 * A stable fingerprint of a message, used to reject a message that has already
 * been imported. FNV-1a over the whitespace-flattened matchable form, so
 * re-pasting the same message with different line wrapping still collides.
 */
export function fingerprint(input: string): string {
  const basis = matchable(input).replace(/\s+/g, ' ').toLowerCase();
  return hash32(basis, 0x811c9dc5) + hash32(basis, 0x01000193);
}

/** FNV-1a, 32 bit, seedable. Not cryptographic; only needs to be stable. */
function hash32(text: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
