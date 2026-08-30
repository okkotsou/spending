/**
 * Contrast regression test.
 *
 * The palette is a design decision, but AA contrast is not: it either holds or
 * it does not. This reads the tokens straight out of `src/index.css` so a
 * future recolour cannot quietly drop below the threshold, and so DESIGN.md's
 * contrast claim stays true by construction rather than by assertion.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Read from the project root: the test runs in a jsdom environment where
// import.meta.url is not a file URL.
const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

/** Reads the custom properties from one block of the stylesheet. */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  expect(start, `${selector} block missing`).toBeGreaterThan(-1);
  const block = css.slice(start, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const match of block.matchAll(/(--c-[\w-]+):\s*(#[0-9a-fA-F]{6});/g)) {
    out[match[1] as string] = match[2] as string;
  }
  return out;
}

const channel = (value: number) =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => channel(Number.parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

export function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
}

const LIGHT = tokens(':root {');
const DARK = tokens("[data-theme='dark'] {");

const GROUNDS = ['--c-bg', '--c-surface', '--c-sunken'] as const;
const TEXT = ['--c-text', '--c-text-secondary', '--c-text-muted'] as const;
const SIGNALS: [string, string][] = [
  ['--c-accent', '--c-accent-soft'],
  ['--c-over', '--c-over-soft'],
  ['--c-income', '--c-income-soft'],
  ['--c-warn', '--c-warn-soft'],
];

describe.each([
  ['light', LIGHT],
  ['dark', DARK],
])('%s theme contrast', (_name, palette) => {
  it('defines every token the app uses', () => {
    for (const key of [...GROUNDS, ...TEXT, '--c-accent', '--c-accent-fg', '--c-border-strong']) {
      expect(palette[key], key).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('clears AA for every text colour on every ground', () => {
    for (const text of TEXT) {
      for (const ground of GROUNDS) {
        const ratio = contrast(palette[text] as string, palette[ground] as string);
        expect(ratio, `${text} on ${ground} is ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('clears AA for text on the accent fill', () => {
    expect(contrast(palette['--c-accent-fg'] as string, palette['--c-accent'] as string)).toBeGreaterThanOrEqual(4.5);
  });

  it('clears AA for every signal colour on its own soft fill and on every ground', () => {
    for (const [signal, soft] of SIGNALS) {
      const onSoft = contrast(palette[signal] as string, palette[soft] as string);
      expect(onSoft, `${signal} on ${soft} is ${onSoft.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      for (const ground of GROUNDS) {
        const ratio = contrast(palette[signal] as string, palette[ground] as string);
        expect(ratio, `${signal} on ${ground} is ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('clears the 3:1 required of control boundaries and chart marks', () => {
    for (const ground of GROUNDS) {
      const ratio = contrast(palette['--c-border-strong'] as string, palette[ground] as string);
      expect(ratio, `--c-border-strong on ${ground} is ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('category palette', () => {
  it('keeps every seeded swatch distinguishable from both surfaces', async () => {
    const { CATEGORY_PALETTE } = await import('./categorize/categories');
    for (const swatch of CATEGORY_PALETTE) {
      // Chart marks and category dots must be visible on both grounds.
      expect(contrast(swatch, LIGHT['--c-surface'] as string), swatch).toBeGreaterThanOrEqual(3);
      expect(contrast(swatch, DARK['--c-surface'] as string), swatch).toBeGreaterThanOrEqual(3);
    }
  });
});
