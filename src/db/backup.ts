/**
 * Backup, restore and file import.
 *
 * The backup is the only way data leaves the device, and it must round-trip
 * exactly: export, wipe, restore, and the app is in the same state, down to
 * dismissed alerts and learned rules. Restore validates the whole file through
 * the Zod schemas before touching the database, so a truncated or hand-edited
 * file fails cleanly instead of half-importing.
 */
import { db } from './db';
import { ensureSeeded, getSettings } from './repo';
import {
  BACKUP_VERSION,
  backupSchema,
  messageFileSchema,
  type Backup,
} from './schema';
import { splitMessages } from '@/parser/split';
import type { IngestInput } from './ingest';

export async function exportBackup(now = Date.now()): Promise<Backup> {
  const [transactions, unparsed, categories, rules, budgets, incomeSources, dismissedAlerts, settings] =
    await Promise.all([
      db.transactions.toArray(),
      db.unparsed.toArray(),
      db.categories.toArray(),
      db.rules.toArray(),
      db.budgets.toArray(),
      db.incomeSources.toArray(),
      db.dismissedAlerts.toArray(),
      getSettings(),
    ]);

  return {
    app: 'misraf',
    version: BACKUP_VERSION,
    exportedAt: now,
    transactions,
    unparsed,
    categories,
    rules,
    budgets,
    incomeSources,
    settings,
    dismissedAlerts,
  };
}

export function backupFilename(now = new Date()): string {
  const stamp = [
    now.getFullYear(),
    `${now.getMonth() + 1}`.padStart(2, '0'),
    `${now.getDate()}`.padStart(2, '0'),
  ].join('-');
  return `misraf-backup-${stamp}.json`;
}

export type RestoreOutcome =
  | { ok: true; counts: { transactions: number; categories: number; rules: number } }
  | { ok: false; error: 'invalid_json' | 'invalid_shape' | 'wrong_app' };

/**
 * Replaces the entire database with the contents of a backup. Destructive by
 * design: a restore that merged would silently duplicate every transaction.
 */
export async function restoreBackup(text: string): Promise<RestoreOutcome> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalid_json' };
  }

  if (typeof raw !== 'object' || raw === null || (raw as { app?: unknown }).app !== 'misraf') {
    return { ok: false, error: 'wrong_app' };
  }

  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'invalid_shape' };
  const backup = parsed.data;

  await db.transaction(
    'rw',
    [
      db.transactions,
      db.unparsed,
      db.categories,
      db.rules,
      db.budgets,
      db.incomeSources,
      db.settings,
      db.dismissedAlerts,
    ],
    async () => {
      await Promise.all([
        db.transactions.clear(),
        db.unparsed.clear(),
        db.categories.clear(),
        db.rules.clear(),
        db.budgets.clear(),
        db.incomeSources.clear(),
        db.dismissedAlerts.clear(),
      ]);
      await Promise.all([
        db.transactions.bulkAdd(backup.transactions),
        db.unparsed.bulkAdd(backup.unparsed),
        db.categories.bulkAdd(backup.categories),
        db.rules.bulkAdd(backup.rules),
        db.budgets.bulkAdd(backup.budgets),
        db.incomeSources.bulkAdd(backup.incomeSources),
        db.dismissedAlerts.bulkAdd(backup.dismissedAlerts),
        db.settings.put({ id: 'settings', ...backup.settings }),
      ]);
    },
  );
  await ensureSeeded();

  return {
    ok: true,
    counts: {
      transactions: backup.transactions.length,
      categories: backup.categories.length,
      rules: backup.rules.length,
    },
  };
}

/**
 * Reads a message file into ingestion inputs.
 *
 * `.json` may be an array of strings or `{ messages: [...] }`. `.csv` is read
 * as one message per row, using the widest text column, so an export from the
 * Messages app or a shortcut works without reformatting. Anything else is
 * treated as plain text and split by the same splitter the paste box uses.
 */
export function parseMessageFile(name: string, text: string): IngestInput[] {
  const lower = name.toLowerCase();

  if (lower.endsWith('.json')) {
    try {
      const parsed = messageFileSchema.safeParse(JSON.parse(text));
      if (parsed.success) {
        const messages = Array.isArray(parsed.data) ? parsed.data : parsed.data.messages;
        return messages.map((raw) => ({ raw }));
      }
    } catch {
      // Fall through: a .json file that is really a text dump still imports.
    }
  }

  if (lower.endsWith('.csv')) {
    return parseCsvMessages(text);
  }

  return splitMessages(text).map((message) =>
    message.receivedAt !== undefined
      ? { raw: message.raw, receivedAt: message.receivedAt }
      : { raw: message.raw },
  );
}

/**
 * A deliberately small CSV reader: quoted fields with doubled quotes, comma
 * separated, newlines allowed inside quotes. The message is taken from the
 * longest cell in the row, which is the text column in every export format
 * seen, without needing a header convention.
 */
export function parseCsvMessages(text: string): IngestInput[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') cell += ch;
  }
  row.push(cell);
  if (row.some((value) => value.trim().length > 0)) rows.push(row);

  const messages = rows
    .map((cells) => cells.reduce((longest, value) => (value.length > longest.length ? value : longest), ''))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  // A leading column-name row carries no figures and is short; dropping it
  // keeps it out of the unrecognised queue on every CSV import.
  const first = messages[0];
  if (first !== undefined && first.length < 24 && !/\d/.test(first)) messages.shift();

  return messages.map((raw) => ({ raw }));
}
