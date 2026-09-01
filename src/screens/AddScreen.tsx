/**
 * Adding transactions.
 *
 * Three routes to the same pipeline: paste a batch of messages, import a file,
 * or type one in by hand. Paste and file both go through the review screen,
 * which shows exactly what was read, what was merged as a duplicate, and what
 * could not be read at all, before anything is written.
 */
import { useRef, useState } from 'react';
import { useApp } from '@/state/AppProvider';
import { useI18n } from '@/i18n';
import { navigate } from '@/state/router';
import { splitMessages } from '@/parser/split';
import { commitIngest, planIngest, addManualTransaction } from '@/db/repo';
import { parseMessageFile, restoreBackup } from '@/db/backup';
import type { IngestPlan } from '@/db/ingest';
import type { TxKind } from '@/types';
import { fromDateTimeInput, toDateInputValue, toTimeInputValue } from '@/lib/format';
import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
  Textarea,
} from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { CategorySelect } from '@/components/CategorySelect';
import { ReviewSheet } from './ReviewSheet';

type Tab = 'paste' | 'file' | 'manual';

const TABS: { id: Tab; label: 'ingest.tab.paste' | 'ingest.tab.file' | 'ingest.tab.manual' }[] = [
  { id: 'paste', label: 'ingest.tab.paste' },
  { id: 'file', label: 'ingest.tab.file' },
  { id: 'manual', label: 'ingest.tab.manual' },
];

export function AddScreen() {
  const { t } = useI18n();
  const { pushToast } = useApp();
  const [tab, setTab] = useState<Tab>('paste');
  const [plan, setPlan] = useState<IngestPlan | undefined>(undefined);
  // Increments per batch so the review sheet remounts with fresh selection.
  const [planKey, setPlanKey] = useState(0);
  const [working, setWorking] = useState(false);

  const runPlan = async (inputs: { raw: string; receivedAt?: number }[]) => {
    if (inputs.length === 0) {
      pushToast(t('ingest.empty'), 'over');
      return;
    }
    setWorking(true);
    try {
      const built = await planIngest(inputs, { source: tab === 'file' ? 'file' : 'paste' });
      setPlanKey((current) => current + 1);
      setPlan(built);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title text-ink">{t('ingest.title')}</h1>

      <div role="tablist" aria-label={t('ingest.title')} className="border-line flex gap-1 border-b">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            role="tab"
            type="button"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className={cx(
              'relative h-11 px-3 text-body transition-colors duration-[120ms]',
              tab === entry.id ? 'text-ink font-medium' : 'text-ink-3 hover:text-ink-2',
            )}
          >
            {t(entry.label)}
            {tab === entry.id ? (
              <span aria-hidden="true" className="bg-accent absolute inset-x-2 -bottom-px h-0.5" />
            ) : null}
          </button>
        ))}
      </div>

      {tab === 'paste' ? <PasteTab onRead={runPlan} working={working} /> : null}
      {tab === 'file' ? <FileTab onRead={runPlan} working={working} /> : null}
      {tab === 'manual' ? <ManualTab /> : null}

      <ReviewSheet
        key={planKey}
        plan={plan}
        onClose={() => setPlan(undefined)}
        onCommit={async (corrected, keptIds, keepUnread) => {
          const result = await commitIngest(corrected, keptIds, keepUnread);
          setPlan(undefined);
          pushToast(t('ingest.result', { added: result.added, merged: result.merged }));
          navigate('transactions');
        }}
      />
    </div>
  );
}

function PasteTab({
  onRead,
  working,
}: {
  onRead: (inputs: { raw: string; receivedAt?: number }[]) => Promise<void>;
  working: boolean;
}) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const count = text.trim().length > 0 ? splitMessages(text).length : 0;

  return (
    <Card>
      <Field label={t('ingest.paste.label')} hint={t('ingest.paste.hint')} htmlFor="paste-box">
        <Textarea
          id="paste-box"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('ingest.paste.placeholder')}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="min-h-[220px]"
        />
      </Field>
      <div className="mt-3 flex items-center gap-3">
        <Button
          variant="primary"
          icon="inbox"
          disabled={count === 0 || working}
          onClick={() => {
            void onRead(
              splitMessages(text).map((message) =>
                message.receivedAt !== undefined
                  ? { raw: message.raw, receivedAt: message.receivedAt }
                  : { raw: message.raw },
              ),
            );
          }}
        >
          {t('ingest.paste.action')}
        </Button>
        {count > 0 ? (
          <span className="num text-caption text-ink-3">
            {t('transactions.count', { count })}
          </span>
        ) : null}
      </div>
    </Card>
  );
}

function FileTab({
  onRead,
  working,
}: {
  onRead: (inputs: { raw: string; receivedAt?: number }[]) => Promise<void>;
  working: boolean;
}) {
  const { t } = useI18n();
  const { pushToast } = useApp();
  const inputRef = useRef<HTMLInputElement | null>(null);

  /**
   * A Misraf backup dropped here is restored rather than read as a pile of
   * unparseable messages. The check parses the file rather than matching a
   * substring, because an exported backup is pretty-printed and a naive
   * `"app":"misraf"` match never fires on it.
   */
  const looksLikeBackup = (name: string, text: string): boolean => {
    if (!name.toLowerCase().endsWith('.json')) return false;
    try {
      const parsed: unknown = JSON.parse(text);
      return (
        typeof parsed === 'object' && parsed !== null && (parsed as { app?: unknown }).app === 'misraf'
      );
    } catch {
      return false;
    }
  };

  const handleFile = async (file: File) => {
    const text = await file.text();
    if (looksLikeBackup(file.name, text)) {
      const outcome = await restoreBackup(text);
      if (outcome.ok) {
        pushToast(t('settings.restored', { count: outcome.counts.transactions }));
        navigate('dashboard');
      } else {
        pushToast(t(`settings.restoreFailed.${outcome.error}`), 'over');
      }
      return;
    }
    await onRead(parseMessageFile(file.name, text));
  };

  return (
    <Card>
      <CardHeader title={t('ingest.tab.file')} meta={t('ingest.file.hint')} />
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.csv,.json,text/plain,text/csv,application/json"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
          event.target.value = '';
        }}
      />
      <Button
        variant="primary"
        icon="upload"
        disabled={working}
        onClick={() => inputRef.current?.click()}
      >
        {working ? t('ingest.file.reading') : t('ingest.file.action')}
      </Button>
    </Card>
  );
}

const MANUAL_KINDS: TxKind[] = [
  'purchase',
  'subscription',
  'fee',
  'atm_withdrawal',
  'self_transfer',
  'transfer_out',
  'transfer_in',
  'deposit',
  'salary',
  'refund',
];

function ManualTab() {
  const { t } = useI18n();
  const { categories, pushToast } = useApp();
  const [kind, setKind] = useState<TxKind>('purchase');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [categoryId, setCategoryId] = useState('other');
  const [date, setDate] = useState(() => toDateInputValue(Date.now()));
  const [time, setTime] = useState(() => toTimeInputValue(Date.now()));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const submit = async () => {
    const parsed = Number.parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError(t('reason.no_amount'));
      return;
    }
    await addManualTransaction({
      kind,
      amount: parsed,
      merchant: merchant.trim(),
      occurredAt: fromDateTimeInput(date, time, Date.now()),
      categoryId,
      note: note.trim(),
    });
    setAmount('');
    setMerchant('');
    setNote('');
    setError(undefined);
    pushToast(t('ingest.manual.saved'));
  };

  return (
    <Card>
      <CardHeader title={t('ingest.manual.title')} />
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('common.amount')} htmlFor="manual-amount" error={error}>
            <Input
              id="manual-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setError(undefined);
              }}
              aria-invalid={error !== undefined}
            />
          </Field>
          <Field label={t('common.type')} htmlFor="manual-kind">
            <Select
              id="manual-kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as TxKind)}
            >
              {MANUAL_KINDS.map((value) => (
                <option key={value} value={value}>
                  {t(`kind.${value}`)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label={t('common.merchant')} htmlFor="manual-merchant">
          <Input
            id="manual-merchant"
            value={merchant}
            onChange={(event) => setMerchant(event.target.value)}
          />
        </Field>

        <Field label={t('common.category')} htmlFor="manual-category">
          <CategorySelect
            id="manual-category"
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('common.date')} htmlFor="manual-date">
            <Input
              id="manual-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
          <Field label={t('common.time')} htmlFor="manual-time">
            <Input
              id="manual-time"
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </Field>
        </div>

        <Field label={`${t('common.note')} (${t('common.optional')})`} htmlFor="manual-note">
          <Input id="manual-note" value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>

        <Button variant="primary" block onClick={() => void submit()}>
          {t('action.save')}
        </Button>
      </div>
    </Card>
  );
}
