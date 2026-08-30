/**
 * The unrecognised queue.
 *
 * The parser's contract is that a message it cannot read with confidence is
 * kept, not guessed at and not thrown away. This is where those messages wait:
 * the original text in full, with a form to enter what it actually was, or the
 * option to discard it.
 */
import { useState } from 'react';
import type { TxKind } from '@/types';
import { useApp } from '@/state/AppProvider';
import { useI18n } from '@/i18n';
import { fromDateTimeInput, toDateInputValue, toTimeInputValue } from '@/lib/format';
import type { ManualTransactionInput } from '@/db/repo';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Select,
} from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { ConfirmSheet, Sheet } from '@/components/ui/Sheet';
import { CategorySelect } from '@/components/CategorySelect';

const KINDS: TxKind[] = [
  'purchase',
  'subscription',
  'fee',
  'atm_withdrawal',
  'transfer_out',
  'transfer_in',
  'deposit',
  'salary',
  'refund',
];

export function UnreadQueue({
  onEnter,
  onDiscard,
}: {
  onEnter: (id: string, raw: string, input: ManualTransactionInput) => Promise<void>;
  onDiscard: (ids: string[]) => Promise<void>;
}) {
  const { unparsed, categories } = useApp();
  const { t } = useI18n();
  const [entering, setEntering] = useState<{ id: string; raw: string; receivedAt: number } | undefined>(
    undefined,
  );
  const [kind, setKind] = useState<TxKind>('purchase');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [categoryId, setCategoryId] = useState('other');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [confirmingDiscardAll, setConfirmingDiscardAll] = useState(false);

  const open = (row: { id: string; raw: string; receivedAt: number }) => {
    setEntering(row);
    setKind('purchase');
    setAmount('');
    setMerchant('');
    setCategoryId('other');
    setDate(toDateInputValue(row.receivedAt));
    setTime(toTimeInputValue(row.receivedAt));
    setError(undefined);
  };

  const submit = async () => {
    if (!entering) return;
    const parsed = Number.parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError(t('reason.no_amount'));
      return;
    }
    await onEnter(entering.id, entering.raw, {
      kind,
      amount: parsed,
      merchant: merchant.trim(),
      occurredAt: fromDateTimeInput(date, time, entering.receivedAt),
      categoryId,
    });
    setEntering(undefined);
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-title text-ink">{t('transactions.unread.title')}</h1>

      {unparsed.length === 0 ? (
        <Card>
          <EmptyState
            icon="inbox"
            title={t('transactions.unread.title')}
            body={t('alerts.none')}
          />
        </Card>
      ) : (
        <Card className="p-3">
          <CardHeader title={t('transactions.unread.body')} />
          <ul className="flex flex-col">
            {unparsed.map((row, index) => (
              <li key={row.id} className={cx('py-3', index > 0 && 'hairline')}>
                <p className="text-caption text-warn mb-1.5">{t(`reason.${row.reason}`)}</p>
                <pre className="bg-sunken border-line text-caption text-ink-2 mb-2 max-h-32 overflow-auto rounded-[var(--r-sm)] border p-2.5 whitespace-pre-wrap">
                  {row.raw}
                </pre>
                <div className="flex gap-2">
                  <Button compact variant="secondary" icon="pencil" onClick={() => open(row)}>
                    {t('transactions.unread.enter')}
                  </Button>
                  <Button
                    compact
                    variant="ghost"
                    icon="trash"
                    onClick={() => void onDiscard([row.id])}
                  >
                    {t('transactions.unread.discard')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {unparsed.length > 1 ? (
            <div className="border-line mt-3 border-t pt-3">
              <Button variant="ghost" icon="trash" onClick={() => setConfirmingDiscardAll(true)}>
                {t('transactions.unread.discard')} ({unparsed.length})
              </Button>
            </div>
          ) : null}
        </Card>
      )}

      <ConfirmSheet
        open={confirmingDiscardAll}
        onClose={() => setConfirmingDiscardAll(false)}
        onConfirm={() => void onDiscard(unparsed.map((row) => row.id))}
        title={t('transactions.unread.discard')}
        body={t('transactions.unread.discardAllConfirm', { count: unparsed.length })}
        confirmLabel={t('transactions.unread.discard')}
      />

      <Sheet
        open={entering !== undefined}
        onClose={() => setEntering(undefined)}
        title={t('transactions.unread.enter')}
        footer={
          <Button variant="primary" block onClick={() => void submit()}>
            {t('action.save')}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <pre className="bg-sunken border-line text-caption text-ink-2 max-h-32 overflow-auto rounded-[var(--r-sm)] border p-2.5 whitespace-pre-wrap">
            {entering?.raw}
          </pre>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('common.amount')} htmlFor="unread-amount" error={error}>
              <Input
                id="unread-amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setError(undefined);
                }}
                aria-invalid={error !== undefined}
              />
            </Field>
            <Field label={t('common.type')} htmlFor="unread-kind">
              <Select
                id="unread-kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as TxKind)}
              >
                {KINDS.map((value) => (
                  <option key={value} value={value}>
                    {t(`kind.${value}`)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={t('common.merchant')} htmlFor="unread-merchant">
            <Input
              id="unread-merchant"
              value={merchant}
              onChange={(event) => setMerchant(event.target.value)}
            />
          </Field>
          <Field label={t('common.category')} htmlFor="unread-category">
            <CategorySelect
              id="unread-category"
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('common.date')} htmlFor="unread-date">
              <Input
                id="unread-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
            <Field label={t('common.time')} htmlFor="unread-time">
              <Input
                id="unread-time"
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </Field>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
