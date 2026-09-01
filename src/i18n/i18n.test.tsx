import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider, interpolate, useI18n } from './index';
import { en } from './en';
import { ar } from './ar';

function Probe({ render: draw }: { render: (t: ReturnType<typeof useI18n>) => string }) {
  const value = useI18n();
  return <span data-testid="out">{draw(value)}</span>;
}

function text(language: 'ar' | 'en', draw: (t: ReturnType<typeof useI18n>) => string): string {
  render(
    <I18nProvider language={language}>
      <Probe render={draw} />
    </I18nProvider>,
  );
  return screen.getAllByTestId('out').at(-1)?.textContent ?? '';
}

describe('translation tables', () => {
  it('has the same keys in both languages', () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
  });

  it('has no empty strings', () => {
    for (const [key, value] of Object.entries({ ...en, ...ar })) {
      expect(value.trim(), key).not.toBe('');
    }
  });

  it('uses the same placeholders in both languages', () => {
    const names = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      // A count-agnostic Arabic phrasing may drop a placeholder English needs,
      // but it must never introduce one that is not supplied.
      const extra = names(ar[key]).filter((name) => !names(en[key]).includes(name ?? ''));
      expect(extra, key).toEqual([]);
    }
  });

  it('contains no emoji', () => {
    const emoji = /\p{Extended_Pictographic}/u;
    for (const [key, value] of Object.entries({ ...en, ...ar })) {
      expect(emoji.test(value), key).toBe(false);
    }
  });
});

describe('interpolate', () => {
  it('substitutes named values and leaves unknown ones alone', () => {
    expect(interpolate('a {x} b', { x: 1 })).toBe('a 1 b');
    expect(interpolate('a {y} b', { x: 1 })).toBe('a {y} b');
    expect(interpolate('plain')).toBe('plain');
  });
});

describe('useI18n', () => {
  it('selects the English singular for a count of one', () => {
    expect(text('en', ({ t }) => t('dashboard.needsReview', { count: 1 }))).toBe(
      '1 transaction needs a look',
    );
    expect(text('en', ({ t }) => t('dashboard.needsReview', { count: 4 }))).toBe(
      '4 transactions need a look',
    );
  });

  it('uses the count-agnostic Arabic phrasing at every count', () => {
    expect(text('ar', ({ t }) => t('dashboard.needsReview', { count: 1 }))).toBe(
      'عمليات بحاجة إلى مراجعة: 1',
    );
    expect(text('ar', ({ t }) => t('dashboard.needsReview', { count: 9 }))).toBe(
      'عمليات بحاجة إلى مراجعة: 9',
    );
  });

  it('reports the direction and locale for each language', () => {
    expect(text('ar', ({ dir }) => dir)).toBe('rtl');
    expect(text('en', ({ dir }) => dir)).toBe('ltr');
    expect(text('ar', ({ locale }) => locale)).toContain('nu-latn');
  });
});
