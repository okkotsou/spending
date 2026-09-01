/**
 * Monthly totals.
 *
 * Two hues only: the period in focus in the accent, the rest in the neutral
 * rule colour. Reading a trend needs contrast between now and before, not a
 * colour per bar.
 */
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { MonthlyTotal } from '@/domain/stats';
import { useI18n } from '@/i18n';
import { formatCompact, formatMonth, formatMoney } from '@/lib/format';

export function TrendBars({
  data,
  height = 160,
  activeKey,
}: {
  data: MonthlyTotal[];
  height?: number;
  activeKey?: string;
}) {
  const { locale, dir, t } = useI18n();

  return (
    <>
      {/* The same figures as a list, for anyone not reading the drawing. */}
      <ul className="sr-only">
        <li>{t('a11y.trendSummary')}</li>
        {data.map((row) => (
          <li key={row.key}>
            {formatMonth(row.start, locale)}: {formatMoney(row.spent, locale)}
          </li>
        ))}
      </ul>
      <div style={{ height }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="start"
            reversed={dir === 'rtl'}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => formatMonth(value, locale)}
            tick={{ fontSize: 11 }}
            interval="preserveStartEnd"
          />
          <YAxis
            orientation={dir === 'rtl' ? 'right' : 'left'}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(value: number) => formatCompact(value, locale)}
            tick={{ fontSize: 11 }}
          />
          <Tooltip
            cursor={{ fill: 'var(--c-sunken)' }}
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const point = payload[0]?.payload as MonthlyTotal;
              return (
                <div className="bg-surface border-line rounded-[var(--r-sm)] border px-2.5 py-2 shadow-[var(--shadow-pop)]">
                  <div className="text-caption text-ink-3">{formatMonth(point.start, locale)}</div>
                  <div className="num text-body text-ink font-medium">
                    {formatMoney(point.spent, locale)}
                  </div>
                </div>
              );
            }}
          />
          <Bar dataKey="spent" radius={[3, 3, 0, 0]} isAnimationActive={false} maxBarSize={40}>
            {data.map((row) => (
              <Cell
                key={row.key}
                fill={
                  activeKey === undefined || row.key === activeKey
                    ? 'var(--c-accent)'
                    : 'var(--c-border-strong)'
                }
              />
            ))}
          </Bar>
        </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
