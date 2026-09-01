/**
 * The review screen.
 *
 * A batch is never written blind. This lists everything the parser produced,
 * grouped by outcome: what will be added, what was merged into an existing
 * transaction, and what could not be read. Each new transaction can be
 * unchecked, and its category can be corrected before it is saved, which is
 * the "confirm or fix in bulk with one action" the paste flow is for.
 */
import { useState } from 'react';
import type { IngestPlan } from '@/db/ingest';
import { useApp } from '@/state/AppProvider';
import { useI18n } from '@/i18n';
import { formatDayMonth, formatMoney } from '@/lib/format';
import { categoryColor } from '@/lib/category';
import { Sheet } from '@/components/ui/Sheet';
import {
  Button,
  Chip,
  Label,
  Toggle,
} from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { Icon } from '@/components/ui/Icon';
import { CategorySelect } from '@/components/CategorySelect';

/**
 * Keyed on the plan by its caller, so each new batch mounts a fresh review
 * rather than synchronising selection state from props.
 */
export function ReviewSheet({
  plan,
  onClose,
  onCommit,
}: {
  plan: IngestPlan | undefined;
  onClose: () => void;
  onCommit: (plan: IngestPlan, keptIds: Set<string>, keepUnread: boolean) => Promise<void>;
}) {
  if (!plan) return null;
  return <ReviewList plan={plan} onClose={onClose} onCommit={onCommit} />;
}

function ReviewList({
  plan,
  onClose,
  onCommit,
}: {
  plan: IngestPlan;
  onClose: () => void;
  onCommit: (plan: IngestPlan, keptIds: Set<string>, keepUnread: boolean) => Promise<void>;
}) {
  const { categories, categoryById } = useApp();
  const { t, locale } = useI18n();
  const [kept, setKept] = useState<Set<string>>(() => new Set(plan.items.map((item) => item.id)));
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [keepUnread, setKeepUnread] = useState(true);
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) => {
    setKept((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const commit = async () => {
    setSaving(true);
    // Corrections made here are folded into a new plan rather than written
    // back onto the one this component was handed.
    const corrected: IngestPlan = {
      ...plan,
      items: plan.items.map((item) => {
        const override = overrides[item.id];
        if (!override || override === item.transaction.categoryId) return item;
        return {
          ...item,
          transaction: { ...item.transaction, categoryId: override, categorySource: 'user' },
        };
      }),
    };
    try {
      await onCommit(corrected, kept, keepUnread);
    } finally {
      // If the write fails the sheet stays open; leaving `saving` set would
      // lock the only way to retry.
      setSaving(false);
    }
  };

  const nothingToDo = plan.items.length === 0;

  return (
    <Sheet
      open
      wide
      onClose={onClose}
      title={t('ingest.review.title')}
      description={t('ingest.review.summary', {
        added: plan.items.length,
        merged: plan.duplicates.length,
        unread: plan.unrecognized.length,
      })}
      footer={
        // No total here: a batch mixes purchases and income, so a single sum
        // of both would be a number that means nothing. The count is the
        // figure that matters, and it is on the button.
        <Button variant="primary" block disabled={saving} onClick={() => void commit()}>
          {nothingToDo ? t('action.done') : t('ingest.review.confirmAll', { count: kept.size })}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        {nothingToDo && plan.duplicates.length === 0 && plan.unrecognized.length === 0 ? (
          <p className="text-body text-ink-2">{t('ingest.review.nothing')}</p>
        ) : null}

        {plan.items.length > 0 ? (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <Label>{t('ingest.review.title')}</Label>
              <button
                type="button"
                onClick={() =>
                  setKept((current) =>
                    current.size === plan.items.length
                      ? new Set()
                      : new Set(plan.items.map((item) => item.id)),
                  )
                }
                className="text-caption text-accent min-h-11 px-1"
              >
                {kept.size === plan.items.length
                  ? t('action.clearSelection')
                  : t('action.selectAll')}
              </button>
            </div>
            <ul className="flex flex-col">
              {plan.items.map((item, index) => {
                const tx = item.transaction;
                const categoryId = overrides[item.id] ?? tx.categoryId;
                const checked = kept.has(item.id);
                return (
                  <li key={item.id} className={cx('py-2.5', index > 0 && 'hairline')}>
                    <div className="flex items-start gap-3">
                      <label className="flex min-h-11 w-6 shrink-0 items-center justify-center">
                        <span className="sr-only">{t('ingest.review.keep')}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(item.id)}
                          className="accent-[var(--c-accent)] h-4 w-4"
                        />
                      </label>
                      <div className={cx('min-w-0 flex-1', !checked && 'opacity-50')}>
                        <div className="flex items-baseline gap-2">
                          <span className="text-body text-ink min-w-0 flex-1 truncate font-medium">
                            {tx.merchant || t(`kind.${tx.kind}`)}
                          </span>
                          <span className="num text-body text-ink shrink-0 font-medium">
                            {formatMoney(tx.amountSar, locale)}
                          </span>
                        </div>
                        <div className="text-caption text-ink-3 mt-0.5 flex flex-wrap items-center gap-x-1.5">
                          <span>{t(`kind.${tx.kind}`)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="num">{formatDayMonth(tx.occurredAt, locale)}</span>
                          {tx.last4 ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="num">••{tx.last4}</span>
                            </>
                          ) : null}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="h-2 w-2 shrink-0 rounded-[var(--r-full)]"
                            style={{ backgroundColor: categoryColor(categoryById.get(categoryId)) }}
                          />
                          <div className="w-[190px]">
                            <CategorySelect
                              categories={categories}
                              value={categoryId}
                              ariaLabel={t('common.category')}
                              onChange={(next) =>
                                setOverrides((current) => ({ ...current, [item.id]: next }))
                              }
                            />
                          </div>
                          {item.needsReview ? <Chip tone="warn">{t('ingest.review.guessed')}</Chip> : null}
                          {tx.pending ? <Chip tone="neutral">{t('ingest.review.pending')}</Chip> : null}
                          {item.reversesLabel ? (
                            <Chip tone="income">
                              {t('ingest.review.reverses', { label: item.reversesLabel })}
                            </Chip>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {plan.duplicates.length > 0 ? (
          <section>
            <Label className="mb-2 block">{t('ingest.review.duplicates')}</Label>
            <ul className="flex flex-col gap-1.5">
              {plan.duplicates.map((row, index) => (
                <li key={`${row.existingId}-${index}`} className="flex items-start gap-2.5">
                  <span className="text-ink-3 mt-0.5 shrink-0">
                    <Icon name="rotate-ccw" size={14} />
                  </span>
                  <span className="text-caption text-ink-2">
                    {t('ingest.review.duplicateOf', { label: row.existingLabel })}
                    {row.enriched ? ` · ${t('ingest.review.enriched')}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {plan.unrecognized.length > 0 ? (
          <section>
            <Label className="mb-2 block">{t('ingest.review.unread')}</Label>
            <ul className="flex flex-col gap-2">
              {plan.unrecognized.map((row) => (
                <li key={row.id} className="border-line rounded-[var(--r-sm)] border p-2.5">
                  <p className="text-caption text-warn mb-1">{t(`reason.${row.reason}`)}</p>
                  <p className="text-caption text-ink-2 line-clamp-3 whitespace-pre-wrap">{row.raw}</p>
                </li>
              ))}
            </ul>
            <div className="mt-2">
              <Toggle
                id="keep-unread"
                checked={keepUnread}
                onChange={setKeepUnread}
                label={t('ingest.review.keepUnread')}
              />
            </div>
          </section>
        ) : null}
      </div>
    </Sheet>
  );
}
