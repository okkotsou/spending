# Design specification

This document is fixed before UI code is written. Every screen is built to it.
Tokens live in `src/index.css` as CSS custom properties and are exposed to
Tailwind through `@theme`. If a value is not in this document it does not
belong in a component.

## 1. Product posture

Misraf is a ledger, not a landing page. The reference points are a bank
statement and a well-set financial table: dense, quiet, legible, and honest
about numbers. The interface never celebrates. It reports.

Explicitly avoided: purple and indigo gradients, glassmorphism, blur panels,
uniformly oversized corner radii, drop shadows used for decoration, rainbow
chart palettes, centered hero copy with a gradient headline, grids of
identical cards, icon-in-a-circle list rows, and marketing filler.

## 2. Colour

One accent. Two signals. Everything else is a neutral. Neutrals are warm
(a paper grey, not a blue grey) so the surface reads as stock, not as glass.

### Light (`:root`)

| Token | Value | Use |
| --- | --- | --- |
| `--c-bg` | `#F7F6F3` | Page ground, warm paper |
| `--c-surface` | `#FFFFFF` | Cards, sheets, table bodies |
| `--c-sunken` | `#F1EFEA` | Inputs, table headers, inert tracks |
| `--c-border` | `#E4E1DA` | Hairline separation, default |
| `--c-border-strong` | `#8C8983` | Control borders, chart pace line, context bars |
| `--c-text` | `#1A1917` | Primary text and numbers |
| `--c-text-secondary` | `#56534C` | Labels, secondary values |
| `--c-text-muted` | `#706C65` | Meta, timestamps, axis labels |
| `--c-accent` | `#0D5C63` | Primary action, focus ring, selection |
| `--c-accent-hover` | `#0A4A50` | Primary action pressed/hover |
| `--c-accent-fg` | `#FFFFFF` | Text on accent |
| `--c-accent-soft` | `#E2EEEE` | Accent-tinted fills, active nav |
| `--c-over` | `#A3231B` | Over budget, overspend, destructive |
| `--c-over-soft` | `#F8E7E5` | Over-budget fills |
| `--c-income` | `#1E6B47` | Income, credits, under budget |
| `--c-income-soft` | `#E3EFE8` | Income fills |
| `--c-warn` | `#8A5B00` | Ahead of pace, approaching limit |
| `--c-warn-soft` | `#F6EDDC` | Pace-warning fills |

### Dark (`[data-theme="dark"]`)

| Token | Value |
| --- | --- |
| `--c-bg` | `#131211` |
| `--c-surface` | `#1B1A18` |
| `--c-sunken` | `#232120` |
| `--c-border` | `#2E2B28` |
| `--c-border-strong` | `#726A61` |
| `--c-text` | `#F1EFEA` |
| `--c-text-secondary` | `#ADA79E` |
| `--c-text-muted` | `#8E877F` |
| `--c-accent` | `#4FB9AE` |
| `--c-accent-hover` | `#6ACCC1` |
| `--c-accent-fg` | `#06211F` |
| `--c-accent-soft` | `#173231` |
| `--c-over` | `#F08279` |
| `--c-over-soft` | `#33201E` |
| `--c-income` | `#6BC79A` |
| `--c-income-soft` | `#172A22` |
| `--c-warn` | `#D9A441` |
| `--c-warn-soft` | `#2B2418` |

Contrast, enforced by a test (`src/theme.test.ts`) that reads these values out
of `src/index.css` and computes the ratios:

- every text token clears 4.5:1 against `--c-bg`, `--c-surface` and `--c-sunken`
  in both themes, including `--c-text-muted`, so no size caveat is needed;
- every signal colour clears 4.5:1 against its own soft fill;
- `--c-accent-fg` clears 4.5:1 on `--c-accent`;
- `--c-border-strong`, which draws control boundaries and the chart pace line,
  clears the 3:1 required of non-text UI.

`--c-border` is deliberately below that: it draws decorative separators only,
never a control boundary or a data mark.

### Category colours

Categories are user-recolourable. The seed palette is a sixteen-swatch earthy
set at matched chroma and lightness, not a spectrum: clay, ochre, olive,
moss, pine, teal, slate, indigo-free steel, plum-free mauve, brick, sand,
umber, sage, denim, rust, stone. Each swatch is stored once and rendered at
full strength for chart marks, and at 14 percent alpha for chips.

### Chart colour

Charts default to a single hue. Cumulative spend is `--c-accent`; the ideal
pace line is `--c-border-strong`, dashed. Trend bars use `--c-accent` for the
selected period and `--c-border-strong` for context periods. Only the category
breakdown uses the category palette, because there the colour *is* the key.

## 3. Typography

Family: **IBM Plex Sans Arabic**, self-hosted through `@fontsource` (SIL OFL,
no CDN, works offline). It carries Latin and Arabic in one metric-compatible
family, so the language toggle does not reflow the page. Fallback stack:
`"IBM Plex Sans Arabic", ui-sans-serif, system-ui, "Segoe UI", sans-serif`.

Every number renders with `font-variant-numeric: tabular-nums lining-nums`
via the `.num` utility. Numbers in tables are end-aligned; in RTL that means
they align to the left edge, which `text-end` handles natively.

Scale — at most four of these on any one screen:

| Name | Size / line | Weight | Use |
| --- | --- | --- | --- |
| `text-display` | 30px / 1.1 | 600 | The single headline figure on a screen |
| `text-figure` | 20px / 1.2 | 600 | Section-level figures, sheet titles |
| `text-title` | 15px / 1.35 | 600 | Card and row titles |
| `text-body` | 14px / 1.5 | 400 | Body copy, table cells |
| `text-caption` | 12px / 1.4 | 500 | Meta, secondary values |
| `text-label` | 11px / 1.3 | 600 | Uppercase (Latin only) section labels, 0.06em tracking |

Arabic never receives `uppercase` or letter-spacing; the `.label` utility
drops both when `[dir="rtl"]` is active.

## 4. Space, shape, line

- Spacing scale (px): 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48. Nothing else.
- Vertical rhythm inside cards is 8/12; between sections it is 16 on mobile,
  24 on desktop. Whitespace is used to separate meaning, not to pad.
- Radii: `--r-sm` 6px (inputs, chips, buttons), `--r-md` 10px (cards, sheets),
  `--r-full` 999px (pills and progress tracks only). No 24px blobs.
- Separation is a 1px hairline in `--c-border`. Shadows are used only for
  genuinely floating layers: `--shadow-pop` (`0 8px 24px -12px rgb(0 0 0/.28)`)
  on modals, sheets, dropdowns and toasts. Nothing else casts a shadow.
- Tap targets are at least 44x44 CSS px. Where a control looks smaller, it is
  padded with a transparent hit area.

## 5. Components

- **Button** — three variants. `primary`: accent fill, accent-fg text.
  `secondary`: surface fill, hairline border. `ghost`: transparent, text
  colour, hover to sunken. One `danger` variant for destructive confirms.
  Heights 44px (default) and 36px (`compact`, desktop toolbars only, never
  the sole target on touch). Radius `--r-sm`.
- **Card** — surface fill, hairline border, radius `--r-md`, 16px padding,
  no shadow. A card has a title row with an optional single trailing action.
  Cards are not all the same size; the dashboard is deliberately asymmetric.
- **Table / rows** — hairline row separators, no zebra striping, 44px min row
  height, numbers end-aligned, merchant name truncated with a title tooltip.
- **Progress** — 6px track in `--c-sunken`, radius full, fill in the pace
  state colour (`accent` on track, `warn` ahead of pace, `over` exceeded).
  A 1px tick marks the ideal pace position.
- **Field** — label above, 44px control, sunken fill, `--c-border-strong`
  border, radius `--r-sm`. Errors render below in `--c-over` at caption size
  and are wired with `aria-describedby`.
- **Sheet** — mobile-first bottom sheet with safe-area padding; on >= 768px it
  becomes a centred dialog at 480px. Both are the same component.
- **Empty state** — a Lucide glyph at 20px in `--c-text-muted`, one sentence
  of plain description, and exactly one primary action. Never a paragraph of
  encouragement.
- **Skeleton** — sunken blocks at the final content's dimensions, 1.4s pulse,
  disabled under `prefers-reduced-motion`.

## 6. Motion

120ms `ease-out` for colour and background transitions. 180ms
`cubic-bezier(.32,.72,0,1)` for sheet and toast entry. No motion on charts
beyond Recharts' default first-paint. All of it is suppressed by
`@media (prefers-reduced-motion: reduce)`.

## 7. Layout and direction

- Mobile-first. The base column is 100vw with 16px gutters and a fixed bottom
  tab bar; `padding-bottom` includes `env(safe-area-inset-bottom)` and the top
  bar includes `env(safe-area-inset-top)`.
- At >= 768px the shell becomes a two-column page with a persistent left (or
  right, in RTL) rail replacing the tab bar, content capped at 1120px.
- At >= 1440px the dashboard uses a 12-column grid; the pace chart spans 8 and
  the budget health list spans 4.
- Nothing may scroll horizontally. Wide content (tables, charts) is contained
  in an `overflow-x-auto` wrapper, never the page body.
- RTL is real: `dir` is set on `<html>`, and layout uses logical properties
  throughout (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`,
  `text-end`). Charts are mirrored by reversing the axis, not by CSS transform,
  so text stays readable.

## 8. Accessibility

- Focus is always visible: `outline: 2px solid var(--c-accent)` with a 2px
  offset, on a `:focus-visible` basis.
- Every icon-only control has an `aria-label` from the translation table.
- Colour is never the sole carrier of meaning: pace state is also a word, and
  over-budget rows also carry a `TriangleAlert` glyph.
- Sheets trap focus, close on Escape, restore focus to the opener, and are
  labelled by their title.
- Live regions announce alerts and toast messages politely.
