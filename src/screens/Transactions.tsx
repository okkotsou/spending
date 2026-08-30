/**
 * The ledger.
 *
 * Search, filter, edit inline, and recategorise in bulk. Three focused views
 * hang off it, reached from the dashboard: amounts waiting for confirmation,
 * transactions the parser was unsure about, and messages it could not read at
 * all. The last of these is the promise that nothing is ever dropped silently.
 */
import { useMemo, useState } from 'react';
import type { Transaction, TxSource } from '@/types';
import { useApp } from '@/state/AppProvider';
import { useI18n } from '@/i18n';
import {
  confirmPending,
  discardUnparsed,
  markReviewed,
  recategoriseMany,
  resolveUnparsed,
  addManualTransaction,
} from '@/db/repo';
import { matchable } from '@/parser/normalize';
import { totalSpend } from '@/domain/stats';
import { formatMoney, toDateInputValue } from '@/lib/format';
import { categoryName } from '@/lib/category';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
} from '@/components/ui/primitives';
import { cx } from '@/lib/cx';
import { Icon } from '@/components/ui/Icon';
import { Sheet } from '@/components/ui/Sheet';
import { CategorySelect } from '@/components/CategorySelect';
import { TransactionRow } from '@/components/TransactionRow';
import { TransactionSheet } from '@/components/TransactionSheet';
import { UnreadQueue } from './UnreadQueue';

const SOURCES: TxSource[] = ['paste', 'url', 'file', 'manual'];

interface Filters {
  query: string;
  categoryId: string;
  source: string;
  from: string;
  to: string;
  min: string;
  max: string;
}

const EMPTY_FILTERS: Filters = {
  query: '',
  categoryId: '',
  source: '',
  from: '',
  to: '',
  min: '',
  max: '',
};

export function Transactions({ params }: { params: URLSearchParams }) {
  const app = useApp();
  const { t, locale, language } = useI18n();
  const view = params.get('view') ?? '';
  // A link from the dashboard carries its filter in the URL. The screen is
  // keyed on the query string in App, so a new link remounts it with the new
  // starting filter rather than syncing state from props.
  const [filters, setFilters] = useState<Filters>(() => ({
    ...EMPTY_FILTERS,
    categoryId: params.get('category') ?? '',
  }));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Transaction | undefined>(undefined);
  const [bulkCategory, setBulkCategory] = useState('other');
  const [bulkOpen, setBulkOpen] = useState(false);

  // Normalising every message on every keystroke is O(rows x keystrokes) of
  // string work; building the index once per ledger change makes typing free.
  const haystacks = useMemo(() => {
    const index = new Map<string, string>();
    for (const tx of app.transactions) {
      index.set(
        tx.id,
        matchable(`${tx.merchant} ${tx.merchantRaw} ${tx.raw} ${tx.note ?? ''}`).toLowerCase(),
      );
    }
    return index;
  }, [app.transactions]);

  const rows = useMemo(() => {
    const needle = matchable(filters.query).toLowerCase().trim();
    const min = filters.min ? Number.parseFloat(filters.min) : undefined;
    const max = filters.max ? Number.parseFloat(filters.max) : undefined;
    const from = filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : undefined;
    const to = filters.to ? new Date(`${filters.to}T23:59:59.999`).getTime() : undefined;

    return app.transactions.filter((tx) => {
      if (view === 'pending' && !tx.pending) return false;
      if (view === 'review' && !tx.needsReview) return false;
      if (filters.categoryId && tx.categoryId !== filters.categoryId) return false;
      if (filters.source && tx.source !== filters.source) return false;
      if (from !== undefined && tx.occurredAt < from) return false;
      if (to !== undefined && tx.occurredAt > to) return false;
      if (min !== undefined && Number.isFinite(min) && tx.amountSar < min) return false;
      if (max !== undefined && Number.isFinite(max) && tx.amountSar > max) return false;
      if (needle.length > 0 && !(haystacks.get(tx.id) ?? '').includes(needle)) return false;
      return true;
    });
  }, [app.transactions, haystacks, filters, view]);

  // Spending only: adding inflows into the same figure would make the header
  // read as neither a total spend nor a net, but as a number with no meaning.
  const total = useMemo(() => totalSpend(rows), [rows]);

  const activeFilterCount = useMemo(
    () =>
      (Object.keys(EMPTY_FILTERS) as (keyof Filters)[]).filter(
        (key) => key !== 'query' && filters[key] !== '',
      ).length,
    [filters],
  );

  const toggleSelect = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (view === 'unread') {
    return (
      <UnreadQueue
        onEnter={async (id, raw, input) => {
          await addManualTransaction(input, raw);
          await resolveUnparsed(id);
          app.pushToast(t('ingest.manual.saved'));
        }}
        onDiscard={async (ids) => {
          await discardUnparsed(ids);
        }}
      />
    );
  }

  const title =
    view === 'pending'
      ? t('transactions.pendingTitle')
      : view === 'review'
        ? t('transactions.needsReview')
        : t('transactions.title');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-title text-ink">{title}</h1>
        <span className="num text-caption text-ink-3">
          {t('transactions.count', { count: rows.length })} ·{' '}
          {formatMoney(total, locale, { decimals: 'never' })}
        </span>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="text-ink-3 pointer-events-none absolute inset-y-0 start-3 flex items-center">
            <Icon name="search" size={16} />
          </span>
          <Input
            type="search"
            value={filters.query}
            onChange={(event) => setFilters((c) => ({ ...c, query: event.target.value }))}
            placeholder={t('transactions.searchPlaceholder')}
            aria-label={t('common.search')}
            className="ps-9"
          />
        </div>
        <Button
          icon="list-filter"
          onClick={() => setFiltersOpen(true)}
          aria-label={t('a11y.filterOpen')}
          className="shrink-0"
        >
          {activeFilterCount > 0 ? <span className="num">{activeFilterCount}</span> : null}
        </Button>
      </div>

      {view === 'pending' && rows.length > 0 ? (
        <div className="bg-warn-soft border-warn/25 flex items-center justify-between gap-3 rounded-[var(--r-sm)] border px-3 py-2">
          <span className="text-caption text-warn">{t('transactions.pendingTitle')}</span>
          <Button
            compact
            onClick={() => {
              void confirmPending(rows.map((tx) => tx.id)).then(() =>
                app.pushToast(t('transactions.confirmed')),
              );
            }}
          >
            {t('transactions.confirmIncome')}
          </Button>
        </div>
      ) : null}

      {view === 'review' && rows.length > 0 ? (
        <div className="bg-sunken border-line flex items-center justify-between gap-3 rounded-[var(--r-sm)] border px-3 py-2">
          <span className="text-caption text-ink-2">{t('transactions.needsReview')}</span>
          <Button compact onClick={() => void markReviewed(rows.map((tx) => tx.id))}>
            {t('action.done')}
          </Button>
        </div>
      ) : null}

      {selected.size > 0 ? (
        <div className="bg-accent-soft border-accent/25 flex flex-wrap items-center gap-2 rounded-[var(--r-sm)] border px-3 py-2">
          <span className="num text-caption text-accent flex-1">
            {t('transactions.bulk.selected', { count: selected.size })}
          </span>
          <Button compact onClick={() => setBulkOpen(true)}>
            {t('transactions.bulk.recategorise')}
          </Button>
          <Button compact variant="ghost" onClick={() => setSelected(new Set())}>
            {t('action.clearSelection')}
          </Button>
        </div>
      ) : null}

      <Card className="p-2">
        {rows.length === 0 ? (
          <EmptyState
            icon="receipt"
            title={t('transactions.empty.title')}
            body={t('transactions.empty.body')}
            action={
              activeFilterCount > 0 || filters.query ? (
                <Button onClick={() => setFilters(EMPTY_FILTERS)}>
                  {t('transactions.filter.clear')}
                </Button>
              ) : null
            }
          />
        ) : (
          <ul className="flex flex-col">
            {rows.map((tx, index) => (
              <li key={tx.id} className={cx(index > 0 && 'hairline')}>
                <TransactionRow
                  tx={tx}
                  category={app.categoryById.get(tx.categoryId)}
                  onOpen={setEditing}
                  selectable
                  selected={selected.has(tx.id)}
                  onToggleSelect={toggleSelect}
                  now={app.now}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <TransactionSheet key={editing?.id} tx={editing} onClose={() => setEditing(undefined)} />

      <Sheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={t('transactions.filter.title')}
        footer={
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => {
                setFilters({ ...EMPTY_FILTERS, query: filters.query });
              }}
            >
              {t('transactions.filter.clear')}
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => setFiltersOpen(false)}>
              {t('action.done')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label={t('transactions.filter.category')} htmlFor="filter-category">
            <CategorySelect
              id="filter-category"
              categories={app.categories}
              value={filters.categoryId}
              includeAll
              onChange={(value) => setFilters((c) => ({ ...c, categoryId: value }))}
            />
          </Field>
          <Field label={t('transactions.filter.source')} htmlFor="filter-source">
            <Select
              id="filter-source"
              value={filters.source}
              onChange={(event) => setFilters((c) => ({ ...c, source: event.target.value }))}
            >
              <option value="">{t('common.all')}</option>
              {SOURCES.map((source) => (
                <option key={source} value={source}>
                  {t(`source.${source}`)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('transactions.filter.from')} htmlFor="filter-from">
              <Input
                id="filter-from"
                type="date"
                max={toDateInputValue(app.now)}
                value={filters.from}
                onChange={(event) => setFilters((c) => ({ ...c, from: event.target.value }))}
              />
            </Field>
            <Field label={t('transactions.filter.to')} htmlFor="filter-to">
              <Input
                id="filter-to"
                type="date"
                value={filters.to}
                onChange={(event) => setFilters((c) => ({ ...c, to: event.target.value }))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('transactions.filter.min')} htmlFor="filter-min">
              <Input
                id="filter-min"
                inputMode="decimal"
                value={filters.min}
                onChange={(event) => setFilters((c) => ({ ...c, min: event.target.value }))}
              />
            </Field>
            <Field label={t('transactions.filter.max')} htmlFor="filter-max">
              <Input
                id="filter-max"
                inputMode="decimal"
                value={filters.max}
                onChange={(event) => setFilters((c) => ({ ...c, max: event.target.value }))}
              />
            </Field>
          </div>
        </div>
      </Sheet>

      <Sheet
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title={t('transactions.bulk.recategorise')}
        description={t('transactions.bulk.selected', { count: selected.size })}
        footer={
          <Button
            variant="primary"
            block
            onClick={() => {
              const ids = [...selected];
              void recategoriseMany(ids, bulkCategory).then(() => {
                app.pushToast(t('transactions.applied', { count: ids.length }));
                setSelected(new Set());
                setBulkOpen(false);
              });
            }}
          >
            {t('action.apply')}
          </Button>
        }
      >
        <Field label={t('common.category')} htmlFor="bulk-category">
          <CategorySelect
            id="bulk-category"
            categories={app.categories}
            value={bulkCategory}
            onChange={setBulkCategory}
          />
        </Field>
        <p className="text-caption text-ink-3 mt-3">
          {categoryName(app.categoryById.get(bulkCategory), language, t('common.uncategorised'))}
        </p>
      </Sheet>
    </div>
  );
}
