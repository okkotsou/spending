/**
 * Editing one transaction.
 *
 * Parsing will never be perfect, so every field the parser fills is editable
 * here, and the original message is always shown underneath: the record of
 * what the bank actually said is the thing that cannot be lost.
 *
 * Changing the category offers to apply the same choice to every transaction
 * from that merchant, which is how the dictionary learns.
 */
import { useState } from 'react';
import type { Transaction, TxKind } from '@/types';
import { useApp } from '@/state/AppProvider';
import { useI18n } from '@/i18n';
import {
  confirmPending,
  deleteTransaction,
  markReviewed,
  recategorise,
  updateTransaction,
} from '@/db/repo';
import { merchantKey as toMerchantKey, prettyMerchant } from '@/parser/merchants';
import { formatMoney, fromDateTimeInput, toDateInputValue, toTimeInputValue } from '@/lib/format';
import { Sheet, ConfirmSheet } from './ui/Sheet';
import { Button, Field, Input, Select, Toggle } from './ui/primitives';
import { CategorySelect } from './CategorySelect';

const KINDS: TxKind[] = [
  'purchase',
  'refund',
  'transfer_out',
  'transfer_in',
  'atm_withdrawal',
  'deposit',
  'salary',
  'fee',
  'subscription',
];

/**
 * Keyed on the transaction id by its caller, so opening a different row
 * remounts the form with fresh initial state instead of synchronising state
 * from props in an effect.
 */
export function TransactionSheet({
  tx,
  onClose,
}: {
  tx: Transaction | undefined;
  onClose: () => void;
}) {
  if (!tx) return null;
  return <TransactionForm tx={tx} onClose={onClose} />;
}

function TransactionForm({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const { categories, transactions, pushToast } = useApp();
  const { t, locale } = useI18n();

  const [kind, setKind] = useState<TxKind>(tx.kind);
  const [amount, setAmount] = useState(String(tx.amountSar));
  const [merchant, setMerchant] = useState(tx.merchant);
  const [categoryId, setCategoryId] = useState(tx.categoryId);
  const [date, setDate] = useState(() => toDateInputValue(tx.occurredAt));
  const [time, setTime] = useState(() => toTimeInputValue(tx.occurredAt));
  const [note, setNote] = useState(tx.note ?? '');
  const [applyToMerchant, setApplyToMerchant] = useState(true);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [amountError, setAmountError] = useState<string | undefined>(undefined);

  const categoryChanged = categoryId !== tx.categoryId;
  const canLearn = categoryChanged && tx.merchantKey.length > 0;

  const save = async () => {
    const parsed = Number.parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setAmountError(t('reason.no_amount'));
      return;
    }
    const occurredAt = fromDateTimeInput(date, time, tx.occurredAt);
    const cleanMerchant = merchant.trim();
    await updateTransaction(tx.id, {
      kind,
      amount: parsed,
      amountSar: parsed,
      merchant: cleanMerchant.length > 0 ? prettyMerchant(cleanMerchant) : '',
      merchantRaw: cleanMerchant,
      merchantKey: cleanMerchant.length > 0 ? toMerchantKey(cleanMerchant) : '',
      occurredAt,
      dateSource: 'message',
      // The user typed a time, so it is known from here on.
      timeKnown: true,
      note: note.trim().length > 0 ? note.trim() : undefined,
      needsReview: false,
    });
    if (categoryChanged) {
      const affected = await recategorise(tx.id, categoryId, canLearn && applyToMerchant);
      if (affected > 1) pushToast(t('transactions.applied', { count: affected }));
    }
    onClose();
  };

  const merchantLabel = tx.merchant || t(`kind.${tx.kind}`);
  const reversedCharge = tx.reverses
    ? transactions.find((row) => row.id === tx.reverses)
    : undefined;

  return (
    <>
      <Sheet
        open
        onClose={onClose}
        title={merchantLabel}
        description={formatMoney(tx.amountSar, locale)}
        footer={
          <div className="flex gap-2">
            <Button
              variant="danger"
              icon="trash"
              onClick={() => setConfirmingDelete(true)}
              aria-label={t('action.delete')}
            >
              {t('action.delete')}
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => void save()}>
              {t('action.save')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {tx.pending ? (
            <div className="bg-warn-soft border-warn/25 flex items-center justify-between gap-3 rounded-[var(--r-sm)] border px-3 py-2">
              <span className="text-caption text-warn">{t('transactions.pending')}</span>
              <Button
                compact
                variant="secondary"
                onClick={() => {
                  void confirmPending([tx.id]).then(() => {
                    pushToast(t('transactions.confirmed'));
                    onClose();
                  });
                }}
              >
                {t('transactions.confirmIncome')}
              </Button>
            </div>
          ) : null}

          {tx.needsReview ? (
            <div className="bg-sunken border-line flex items-center justify-between gap-3 rounded-[var(--r-sm)] border px-3 py-2">
              <span className="text-caption text-ink-2">{t('transactions.needsReview')}</span>
              <Button compact variant="ghost" onClick={() => void markReviewed([tx.id])}>
                {t('action.done')}
              </Button>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('common.amount')} htmlFor="tx-amount" error={amountError}>
              <Input
                id="tx-amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value);
                  setAmountError(undefined);
                }}
                aria-invalid={amountError !== undefined}
              />
            </Field>
            <Field label={t('common.type')} htmlFor="tx-kind">
              <Select id="tx-kind" value={kind} onChange={(event) => setKind(event.target.value as TxKind)}>
                {KINDS.map((value) => (
                  <option key={value} value={value}>
                    {t(`kind.${value}`)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label={t('common.merchant')} htmlFor="tx-merchant">
            <Input
              id="tx-merchant"
              value={merchant}
              onChange={(event) => setMerchant(event.target.value)}
            />
          </Field>

          <Field label={t('common.category')} htmlFor="tx-category">
            <CategorySelect
              id="tx-category"
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
            />
          </Field>

          {canLearn ? (
            <Toggle
              id="tx-learn"
              checked={applyToMerchant}
              onChange={setApplyToMerchant}
              label={t('transactions.applyToMerchant', { merchant: merchantLabel })}
            />
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('common.date')} htmlFor="tx-date">
              <Input
                id="tx-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
            <Field label={t('common.time')} htmlFor="tx-time">
              <Input
                id="tx-time"
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </Field>
          </div>

          <Field label={`${t('common.note')} (${t('common.optional')})`} htmlFor="tx-note">
            <Input id="tx-note" value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>

          {reversedCharge ? (
            <p className="text-caption text-income">
              {t('ingest.review.reverses', {
                label: reversedCharge.merchant || t(`kind.${reversedCharge.kind}`),
              })}
            </p>
          ) : null}

          <div>
            <p className="label mb-1.5">{t('transactions.original')}</p>
            <pre className="bg-sunken border-line text-caption text-ink-2 max-h-40 overflow-auto rounded-[var(--r-sm)] border p-3 whitespace-pre-wrap">
              {tx.raw}
            </pre>
            {tx.mergedRaw && tx.mergedRaw.length > 0 ? (
              <p className="text-caption text-ink-3 mt-1.5">
                {t('transactions.merged', { count: tx.mergedRaw.length + 1 })}
              </p>
            ) : null}
          </div>
        </div>
      </Sheet>

      <ConfirmSheet
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        onConfirm={() => {
          void deleteTransaction(tx.id).then(() => {
            pushToast(t('transactions.deleted'));
            onClose();
          });
        }}
        title={t('transactions.confirmDelete')}
        confirmLabel={t('action.delete')}
      />
    </>
  );
}
