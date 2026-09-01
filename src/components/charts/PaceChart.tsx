/**
 * Cumulative spend against the even-pace line.
 *
 * The one chart that answers "am I going to make it". Minimal chrome: no grid
 * beyond a few horizontal rules, no legend box, no dots. The pace line is a
 * dashed neutral so the eye reads the accent line as the real figure and the
 * gap between them as the story.
 *
 * RTL is handled by reversing the x axis, not by mirroring the SVG, so the
 * labels stay upright and readable.
 */
import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DailyPoint } from '@/domain/stats';
import { useI18n } from '@/i18n';
import { formatCompact, formatDayMonth, formatMoney } from '@/lib/format';

export function PaceChart({ data, height = 200 }: { data: DailyPoint[]; height?: number }) {
  const { locale, dir, t } = useI18n();

  const series = useMemo(
    () =>
      data.map((point) => ({
        day: point.day,
        date: point.date,
        spent: point.elapsed ? point.spent : null,
        ideal: point.ideal ?? null,
      })),
    [data],
  );

  const hasIdeal = series.some((point) => point.ideal !== null);
  const latest = [...data].reverse().find((point) => point.elapsed);

  return (
    <div>
      <div className="mb-2 flex items-center gap-4">
        <span className="text-caption text-ink-2 inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="bg-accent h-0.5 w-4 rounded-full" />
          {t('dashboard.actual')}
        </span>
        {hasIdeal ? (
          <span className="text-caption text-ink-3 inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-0 w-4 border-t border-dashed border-[var(--c-border-strong)]"
            />
            {t('dashboard.idealPace')}
          </span>
        ) : null}
      </div>
      {/* A screen reader gets the figure the chart is drawn from, not the SVG. */}
      <p className="sr-only">
        {t('a11y.spentSummary', {
          amount: formatMoney(latest?.spent ?? 0, locale),
          day: latest?.day ?? 0,
          days: data.length,
        })}
        {latest?.ideal !== undefined
          ? ` ${t('a11y.paceSummary', { ideal: formatMoney(latest.ideal, locale) })}`
          : ''}
      </p>
      <div style={{ height }} aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id="paceFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--c-accent)" stopOpacity={0.18} />
                <stop offset="100%" stopColor="var(--c-accent)" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--c-border)" strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="day"
              reversed={dir === 'rtl'}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              tick={{ fontSize: 11 }}
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
              cursor={{ stroke: 'var(--c-border-strong)', strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const point = payload[0]?.payload as { date: number; spent: number | null };
                return (
                  <div className="bg-surface border-line rounded-[var(--r-sm)] border px-2.5 py-2 shadow-[var(--shadow-pop)]">
                    <div className="text-caption text-ink-3">{formatDayMonth(point.date, locale)}</div>
                    <div className="num text-body text-ink font-medium">
                      {formatMoney(point.spent ?? 0, locale)}
                    </div>
                  </div>
                );
              }}
            />
            {hasIdeal ? (
              <Line
                type="linear"
                dataKey="ideal"
                stroke="var(--c-border-strong)"
                strokeWidth={1}
                strokeDasharray="4 4"
                dot={false}
                isAnimationActive={false}
              />
            ) : null}
            <Area
              type="monotone"
              dataKey="spent"
              stroke="var(--c-accent)"
              strokeWidth={2}
              fill="url(#paceFill)"
              connectNulls={false}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
