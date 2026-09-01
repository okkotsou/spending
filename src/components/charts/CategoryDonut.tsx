/**
 * Category breakdown.
 *
 * A donut only because the total belongs in the middle; the ranked list beside
 * it is what people actually read, and it is the accessible representation of
 * the same data. Segments are clickable and filter the transactions list.
 */
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import type { Category } from '@/types';
import type { CategoryTotal } from '@/domain/stats';
import { useI18n } from '@/i18n';
import { formatMoney } from '@/lib/format';
import { cx } from '@/lib/cx';

export function CategoryDonut({
  totals,
  categoryById,
  total,
  onSelect,
}: {
  totals: CategoryTotal[];
  categoryById: Map<string, Category>;
  total: number;
  onSelect: (categoryId: string) => void;
}) {
  const { locale, language, t } = useI18n();
  const name = (id: string) => {
    const category = categoryById.get(id);
    if (!category) return t('common.uncategorised');
    return language === 'ar' ? category.nameAr : category.nameEn;
  };
  const colour = (id: string) => categoryById.get(id)?.color ?? 'var(--c-border-strong)';

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      {/* The ranked list beside it is the accessible form of the same data. */}
      <div className="relative mx-auto h-[168px] w-[168px] shrink-0" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={totals}
              dataKey="amount"
              nameKey="categoryId"
              innerRadius={58}
              outerRadius={82}
              paddingAngle={1.5}
              stroke="var(--c-surface)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {totals.map((row) => (
                <Cell
                  key={row.categoryId}
                  fill={colour(row.categoryId)}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="num text-figure text-ink">{formatMoney(total, locale, { decimals: 'never' })}</span>
        </div>
      </div>

      <ul className="min-w-0 flex-1">
        {totals.slice(0, 6).map((row) => (
          <li key={row.categoryId}>
            <button
              type="button"
              onClick={() => onSelect(row.categoryId)}
              className={cx(
                'flex min-h-11 w-full items-center gap-2.5 rounded-[var(--r-sm)] px-1.5 text-start',
                'hover:bg-sunken transition-colors duration-[120ms]',
              )}
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-[var(--r-full)]"
                style={{ backgroundColor: colour(row.categoryId) }}
              />
              <span className="text-body text-ink min-w-0 flex-1 truncate">{name(row.categoryId)}</span>
              <span className="num text-body text-ink-2 shrink-0">
                {formatMoney(row.amount, locale, { decimals: 'never' })}
              </span>
              <span className="num text-caption text-ink-3 w-9 shrink-0 text-end">
                {total > 0 ? `${Math.round((row.amount / total) * 100)}%` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
