import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  addManualTransaction,
  deleteRule,
  dismissAlert,
  pruneDismissedAlerts,
  saveRule,
  clearEverything,
  commitIngest,
  deleteCategory,
  deleteTransaction,
  ensureSeeded,
  ingestSilently,
  mergeCategories,
  planIngest,
  reapplyRules,
  recategorise,
  saveBudget,
  saveSettings,
} from './repo';
import { backupFilename, exportBackup, parseCsvMessages, parseMessageFile, restoreBackup } from './backup';
import { FIXTURES } from '@/parser/fixtures';

const FIXTURE_NOW = new Date(2024, 5, 20, 12).getTime();

function corpus(): { raw: string }[] {
  return FIXTURES.map((fixture) => ({ raw: fixture.text }));
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureSeeded();
});

describe('seeding', () => {
  it('creates the built-in categories and default settings once', async () => {
    const first = await db.categories.count();
    await ensureSeeded();
    expect(await db.categories.count()).toBe(first);
    expect(first).toBe(17);
    const settings = await db.settings.get('settings');
    expect(settings?.language).toBe('ar');
    expect(settings?.budgetStartDay).toBe(1);
  });
});

describe('ingestion', () => {
  it('sorts a mixed batch into transactions, duplicates and unrecognised', async () => {
    const plan = await planIngest(corpus(), { source: 'paste', now: FIXTURE_NOW });
    const parseable = FIXTURES.filter((f) => f.expect !== null).length;
    expect(plan.items.length + plan.duplicates.length).toBe(parseable);
    expect(plan.unrecognized).toHaveLength(FIXTURES.filter((f) => f.expect === null).length);
    // Every message ends up somewhere; nothing is dropped.
    expect(plan.items.length + plan.duplicates.length + plan.unrecognized.length).toBe(
      FIXTURES.length,
    );
  });

  it('merges the second alert for the same purchase', async () => {
    const plan = await planIngest(corpus(), { source: 'paste', now: FIXTURE_NOW });
    expect(plan.duplicates.length).toBeGreaterThan(0);
    const merged = plan.duplicates.find((row) => row.existingLabel === 'Amazon');
    expect(merged).toBeDefined();
  });

  it('links a refund to the charge it cancels', async () => {
    const plan = await planIngest(corpus(), { source: 'paste', now: FIXTURE_NOW });
    const refund = plan.items.find((item) => item.transaction.kind === 'refund' && item.reversesId);
    expect(refund).toBeDefined();
    await commitIngest(plan, new Set(plan.items.map((item) => item.id)));
    const stored = await db.transactions.get(refund?.reversesId ?? '');
    expect(stored?.reversedBy).toBe(refund?.id);
  });

  it('holds income for confirmation before it counts', async () => {
    const plan = await planIngest(corpus(), { source: 'paste', now: FIXTURE_NOW });
    const salary = plan.items.find((item) => item.transaction.kind === 'salary');
    expect(salary?.transaction.pending).toBe(true);
  });

  it('does not re-import a message that is already stored', async () => {
    await ingestSilently(corpus(), 'paste');
    const before = await db.transactions.count();
    const second = await planIngest(corpus(), { source: 'paste', now: FIXTURE_NOW });
    expect(second.items).toHaveLength(0);
    await commitIngest(second, new Set());
    expect(await db.transactions.count()).toBe(before);
  });

  it('writes only the items the user kept', async () => {
    const plan = await planIngest(corpus(), { source: 'paste', now: FIXTURE_NOW });
    const first = plan.items[0];
    expect(first).toBeDefined();
    const result = await commitIngest(plan, new Set([first?.id ?? '']), false);
    expect(result.added).toBe(1);
    expect(await db.transactions.count()).toBe(1);
    expect(await db.unparsed.count()).toBe(0);
  });

  it('does not leave a dangling reversal link when the refund is dropped', async () => {
    const plan = await planIngest(corpus(), { source: 'paste', now: FIXTURE_NOW });
    const refund = plan.items.find((item) => item.reversesId !== undefined);
    const kept = new Set(plan.items.filter((item) => item.id !== refund?.id).map((i) => i.id));
    await commitIngest(plan, kept);
    const target = await db.transactions.get(refund?.reversesId ?? '');
    expect(target?.reversedBy).toBeUndefined();
  });
});

describe('categorisation over stored data', () => {
  it('applies a learned rule to past and future transactions', async () => {
    await ingestSilently(corpus(), 'paste');
    const panda = await db.transactions.where('merchantKey').equals('panda').first();
    expect(panda).toBeDefined();
    const affected = await recategorise(panda?.id ?? '', 'home', true);
    expect(affected).toBeGreaterThanOrEqual(1);
    const rule = await db.rules.get('learned:panda');
    expect(rule?.categoryId).toBe('home');

    const rows = await db.transactions.where('merchantKey').equals('panda').toArray();
    expect(rows.every((row) => row.categoryId === 'home')).toBe(true);
  });

  it('reapplies rules without disturbing a category the user set by hand', async () => {
    await ingestSilently(corpus(), 'paste');
    const row = await db.transactions.where('merchantKey').equals('starbucks').first();
    await recategorise(row?.id ?? '', 'other', false);
    await reapplyRules();
    const after = await db.transactions.get(row?.id ?? '');
    expect(after?.categoryId).toBe('other');
  });
});

describe('categories', () => {
  it('refuses to delete a built-in category', async () => {
    await deleteCategory('groceries');
    expect(await db.categories.get('groceries')).toBeDefined();
  });

  it('moves transactions and budgets when categories are merged', async () => {
    await ingestSilently(corpus(), 'paste');
    await saveBudget({ id: 'groceries', limit: 1000, rollover: false });
    await saveBudget({ id: 'restaurants', limit: 500, rollover: false });
    await mergeCategories('groceries', 'restaurants');
    expect(await db.transactions.where('categoryId').equals('groceries').count()).toBe(0);
    expect((await db.budgets.get('restaurants'))?.limit).toBe(1500);
    expect((await db.categories.get('groceries'))?.archived).toBe(true);
  });
});

describe('manual entry and deletion', () => {
  it('adds a transaction by hand', async () => {
    const id = await addManualTransaction({
      kind: 'purchase',
      amount: 42.5,
      merchant: 'سوق الخضار',
      occurredAt: FIXTURE_NOW,
      categoryId: 'groceries',
      note: 'cash',
    });
    const row = await db.transactions.get(id);
    expect(row?.amountSar).toBe(42.5);
    expect(row?.source).toBe('manual');
    expect(row?.note).toBe('cash');
  });

  it('repairs the reversal link when a linked transaction is deleted', async () => {
    await ingestSilently(corpus(), 'paste');
    const refund = await db.transactions.filter((row) => row.reverses !== undefined).first();
    const targetId = refund?.reverses ?? '';
    await deleteTransaction(refund?.id ?? '');
    expect((await db.transactions.get(targetId))?.reversedBy).toBeUndefined();
  });
});

describe('backup', () => {
  it('round-trips the entire database exactly', async () => {
    await ingestSilently(corpus(), 'paste');
    await saveSettings({ budgetStartDay: 27, language: 'en', theme: 'dark' });
    await saveBudget({ id: 'groceries', limit: 900, rollover: true });
    const panda = await db.transactions.where('merchantKey').equals('panda').first();
    await recategorise(panda?.id ?? '', 'home', true);

    const before = await exportBackup(1);
    const text = JSON.stringify(before);

    await clearEverything();
    expect(await db.transactions.count()).toBe(0);

    const outcome = await restoreBackup(text);
    expect(outcome.ok).toBe(true);

    const after = await exportBackup(1);
    expect(after).toEqual(before);
  });

  it('rejects a file that is not a Misraf backup', async () => {
    expect(await restoreBackup('not json')).toEqual({ ok: false, error: 'invalid_json' });
    expect(await restoreBackup('{"app":"other"}')).toEqual({ ok: false, error: 'wrong_app' });
    expect(await restoreBackup('{"app":"misraf","version":1}')).toEqual({
      ok: false,
      error: 'invalid_shape',
    });
  });

  it('names the file by date', () => {
    expect(backupFilename(new Date(2024, 5, 9))).toBe('misraf-backup-2024-06-09.json');
  });
});

describe('file import', () => {
  it('reads a JSON array of messages', () => {
    const inputs = parseMessageFile('m.json', JSON.stringify(['شراء 20 ريال', 'Purchase SAR 30']));
    expect(inputs).toHaveLength(2);
  });

  it('reads a wrapped JSON object', () => {
    const inputs = parseMessageFile('m.json', JSON.stringify({ messages: ['a', 'b', 'c'] }));
    expect(inputs).toHaveLength(3);
  });

  it('falls back to text splitting for a .json file that is really text', () => {
    const inputs = parseMessageFile('m.json', 'شراء\nالمبلغ: 20.00 ريال');
    expect(inputs).toHaveLength(1);
  });

  it('reads CSV, taking the widest column and honouring quotes', () => {
    const csv = 'date,body\n2024-06-12,"شراء\nالمبلغ: 20.00 ريال"\n2024-06-13,"He said ""hi"" once"';
    const inputs = parseCsvMessages(csv);
    // The column-name row is dropped; the two message rows remain.
    expect(inputs).toHaveLength(2);
    expect(inputs[0]?.raw).toContain('المبلغ');
    expect(inputs[1]?.raw).toContain('"hi"');
  });

  it('keeps the first row when it is a message rather than a header', () => {
    const inputs = parseCsvMessages('"شراء\nالمبلغ: 20.00 ريال"\n"Purchase SAR 30.00"');
    expect(inputs).toHaveLength(2);
  });

  it('reads a plain text dump with blank line separators', () => {
    const inputs = parseMessageFile('m.txt', 'شراء\nالمبلغ: 20.00 ريال\n\nPurchase\nAmount:SAR 30.00');
    expect(inputs).toHaveLength(2);
  });
});

describe('undated wallet alerts', () => {
  const BANK = `شراء انترنت
مدى-أبل باي
بطاقة:4560*;مدى
لدى:AMAZON SA
بمبلغ:SAR 214.50
في:24-06-12 19:33`;
  const WALLET = `Apple Pay
AMAZON SA
SAR 214.50
Visa ...4560`;

  it('merges an undated Apple Pay alert with the adjacent bank alert', async () => {
    const plan = await planIngest([{ raw: BANK }, { raw: WALLET }], {
      source: 'paste',
      now: FIXTURE_NOW,
    });
    expect(plan.items).toHaveLength(1);
    expect(plan.duplicates).toHaveLength(1);
    expect(plan.items[0]?.transaction.occurredAt).toBe(new Date(2024, 5, 12, 19, 33).getTime());
  });

  it('merges in either order, taking the date from the dated alert', async () => {
    const plan = await planIngest([{ raw: WALLET }, { raw: BANK }], {
      source: 'paste',
      now: FIXTURE_NOW,
    });
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]?.transaction.occurredAt).toBe(new Date(2024, 5, 12, 19, 33).getTime());
    expect(plan.items[0]?.transaction.merchant).toBe('Amazon');
  });

  it('does not merge an undated alert with a distant unrelated message', async () => {
    const other = `شراء
المبلغ: 214.50 ريال
لدى: بنده
البطاقة: 9999*
التاريخ: 12/06/2024`;
    const plan = await planIngest([{ raw: other }, { raw: WALLET }], {
      source: 'paste',
      now: FIXTURE_NOW,
    });
    expect(plan.items).toHaveLength(2);
  });
});

describe('alert dismissals', () => {
  it('prunes dismissals older than a year and keeps recent ones', async () => {
    const now = Date.now();
    await db.dismissedAlerts.bulkPut([
      { key: 'old', dismissedAt: now - 400 * 86_400_000 },
      { key: 'recent', dismissedAt: now - 10 * 86_400_000 },
    ]);
    await pruneDismissedAlerts(now);
    expect(await db.dismissedAlerts.get('old')).toBeUndefined();
    expect(await db.dismissedAlerts.get('recent')).toBeDefined();
  });

  it('records a dismissal once', async () => {
    await dismissAlert('exceeded:groceries:2024-06:300');
    await dismissAlert('exceeded:groceries:2024-06:300');
    expect(await db.dismissedAlerts.count()).toBe(1);
  });
});

describe('rules', () => {
  it('reapplies a manual rule across the ledger and reverts when deleted', async () => {
    await ingestSilently(corpus(), 'paste');
    const before = await db.transactions.where('categoryId').equals('home').count();
    await saveRule({
      id: 'r1',
      origin: 'manual',
      conditions: [{ type: 'merchant_contains', value: 'amazon' }],
      categoryId: 'home',
      enabled: true,
      createdAt: Date.now(),
      priority: 100,
    });
    await reapplyRules();
    const after = await db.transactions.where('categoryId').equals('home').count();
    expect(after).toBeGreaterThan(before);

    await deleteRule('r1');
    await reapplyRules();
    expect(await db.transactions.where('categoryId').equals('home').count()).toBe(before);
  });
});

describe('file type detection', () => {
  it('a pretty-printed backup is recognisable as one, not as messages', async () => {
    await ingestSilently(corpus(), 'paste');
    const text = JSON.stringify(await exportBackup(1), null, 2);
    // The exported form is indented, so any check that matches on a compact
    // `"app":"misraf"` substring would miss it.
    expect(text.includes('"app":"misraf"')).toBe(false);
    expect((JSON.parse(text) as { app: string }).app).toBe('misraf');
    // And it must not be readable as a pile of messages.
    const asMessages = parseMessageFile('backup.json', text);
    expect(asMessages.every((input) => input.raw.length > 0)).toBe(true);
  });
});
