/**
 * Splitting a paste into individual messages.
 *
 * A paste from the Messages app can be blank-line separated, newline
 * separated, or one long run with no separators at all, and it may carry
 * timestamp headers above each message. The strategy is: split on blank lines
 * first, then break any remaining block at the start of a second message,
 * detected by the opening keywords that every alert format begins with.
 */
import { foldArabic, matchable } from './normalize';
import { parseTimestampHeader } from './dates';

export interface SplitMessage {
  raw: string;
  /** From a timestamp header above the message, when one was present. */
  receivedAt?: number;
}

/**
 * Openings that reliably begin a bank or wallet alert. Used only to break a
 * run of concatenated messages, never to decide whether something is a
 * transaction, so a false positive here costs nothing but a split.
 *
 * Sources are folded on compilation, exactly as the pattern tables are, and an
 * Arabic opener is closed with an explicit non-letter guard because the ASCII
 * word boundary does not apply to Arabic script.
 */
const AR_END = String.raw`(?![\u0600-\u06FF])`;

const MESSAGE_OPENERS: RegExp[] = [
  String.raw`^(?:عملية\s+)?شراء${AR_END}`,
  String.raw`^نقاط بيع${AR_END}`,
  // A bare network line ("مدى") opens a wallet alert, but the same word also
  // appears mid-message ("مدى-أبل باي"), so it only counts on a line of its own.
  String.raw`^مدى\s*$`,
  String.raw`^سحب نقدي${AR_END}`,
  String.raw`^(?:تم\s+)?إيداع${AR_END}`,
  String.raw`^(?:حوالة|تحويل)\s+(?:واردة|صادرة|وارد|صادر)${AR_END}`,
  String.raw`^(?:استرجاع|استرداد|مرتجع|عملية عكسية)${AR_END}`,
  String.raw`^تجديد اشتراك${AR_END}`,
  String.raw`^رسوم${AR_END}`,
  String.raw`^سداد فاتورة${AR_END}`,
  String.raw`^أبل باي\s*$`,
  String.raw`^purchase\b`,
  String.raw`^refund\b`,
  String.raw`^salary\b`,
  String.raw`^atm\b`,
  String.raw`^deposit\b`,
  String.raw`^transfer\b`,
  String.raw`^subscription\b`,
  String.raw`^service fee\b`,
  String.raw`^apple ?pay\s*$`,
  String.raw`^stc ?pay\s*$`,
  String.raw`^stc ?bank\s*$`,
  String.raw`^urpay\s*$`,
  String.raw`^pos\b`,
].map((source) => new RegExp(foldArabic(source), 'i'));

function looksLikeOpener(line: string): boolean {
  const probe = matchable(line).trim();
  if (probe.length === 0) return false;
  return MESSAGE_OPENERS.some((re) => re.test(probe));
}

/** A line that only carries a timestamp, sitting above the message it stamps. */
function headerTimestamp(line: string, reference: Date): number | undefined {
  return parseTimestampHeader(line, reference);
}

/**
 * A fragment that is a single line with no figures in it is a sender or bank
 * header, not a message: banks put their own name above the alert. Rejoining
 * it to the message below undoes a split that should not have happened.
 */
function isOrphanHeader(segment: string): boolean {
  const lines = segment.split('\n').filter((line) => line.trim().length > 0);
  return lines.length === 1 && !/\d/.test(segment);
}

function breakBlock(block: string): string[] {
  const lines = block.split('\n');
  const segments: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (current.length > 0 && looksLikeOpener(line)) {
      segments.push(current.join('\n'));
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) segments.push(current.join('\n'));

  const out: string[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i] ?? '';
    const next = segments[i + 1];
    if (next !== undefined && isOrphanHeader(segment)) {
      segments[i + 1] = `${segment}\n${next}`;
      continue;
    }
    out.push(segment);
  }
  return out;
}

/**
 * Splits a pasted blob into individual messages.
 *
 * @param blob raw pasted text, any order, any mix of languages
 * @param reference date used to resolve relative headers such as "Today"
 */
export function splitMessages(blob: string, reference: Date = new Date()): SplitMessage[] {
  const text = blob.replace(/\r\n?/g, '\n').trim();
  if (text.length === 0) return [];

  const blocks = text
    .split(/\n[ \t]*\n+/)
    .flatMap(breakBlock)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  const messages: SplitMessage[] = [];
  let pendingTimestamp: number | undefined;

  for (const block of blocks) {
    const lines = block.split('\n');
    let receivedAt = pendingTimestamp;
    pendingTimestamp = undefined;

    // A block that is nothing but a timestamp stamps the block that follows.
    if (lines.length === 1) {
      const only = headerTimestamp(lines[0] ?? '', reference);
      if (only !== undefined) {
        pendingTimestamp = only;
        continue;
      }
    }

    // A timestamp on the first line of a block stamps that block.
    const first = headerTimestamp(lines[0] ?? '', reference);
    if (first !== undefined && lines.length > 1) {
      receivedAt = first;
    }

    const message: SplitMessage = { raw: block };
    if (receivedAt !== undefined) message.receivedAt = receivedAt;
    messages.push(message);
  }

  return messages;
}
