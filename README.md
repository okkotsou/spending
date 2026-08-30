# Misraf

A spending tracker that reads Saudi bank and wallet SMS notifications and keeps
every figure on your own device. No account, no server, no analytics. Arabic
first, English available, and it installs to an iPhone home screen as a
progressive web app that works offline.

The name is مصرف: the place money is spent, and the place it is banked.

---

## What it does

**Reads your bank messages.** Paste a month of notifications into the app and it
splits them into individual messages, reads each one, works out the type,
amount, merchant, card and date, and shows you what it found before saving
anything. Arabic and English, mixed in any order, with or without timestamps.

Supported message formats include Al Rajhi, SNB/AlAhli, Riyad Bank, Alinma,
STC Bank, STC Pay, urpay, and Apple Pay and mada point-of-sale alerts. The rules
are a named list in `src/parser/patterns.ts`, so a new format is one entry.

**Never guesses.** A message it cannot read with confidence goes to an
unrecognised queue where you can enter it by hand or discard it. It is never
dropped and never guessed at.

**Merges duplicate alerts.** The bank and Apple Pay both announce the same
purchase. Misraf detects that by amount, merchant, card and timing, and keeps
one transaction with the fuller of the two messages.

**Cancels refunds against their charges.** A refund is not income. Misraf links
it to the original purchase and removes both from your spending.

**Categorises automatically.** A seeded dictionary of Saudi merchants in both
languages assigns a category on import. When you correct one, Misraf offers to
apply that correction to every past and future transaction from that merchant,
and remembers the rule.

**Follows your pay cycle.** Set the budget month to start on the day your salary
lands, and every total, limit, chart and alert follows it.

**Warns before you run out.** Per-category and whole-month limits, a suggester
that proposes limits from your last three months, an even-pace line on the
spending chart, and alerts at 80 percent, at the limit, when you are more than
25 percent ahead of pace, and when a single charge is far above normal for its
category.

**Finds your subscriptions.** Charges from the same merchant at a similar amount
roughly a month apart are surfaced as recurring, with an estimated monthly total
and the next renewal date.

---

## Running it

Requires Node 22 or newer.

```
npm install
npm run dev
```

Then open the address Vite prints.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type-check and produce the static bundle in `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the test suite once |
| `npm run coverage` | Run tests with coverage over the parser, categoriser and domain logic |
| `npm run lint` | ESLint over the whole repository |
| `npm run verify` | Lint, type-check, test and build, in that order |
| `npm run icons` | Regenerate the PWA icon set from `scripts/generate-icons.mjs` |

---

## Getting your messages in

There are four ways in, and all of them work.

### 1. Paste (the main one)

Open **Add**, paste any number of messages into the box, and press **Read
messages**. The review screen lists what was read, what was merged as a
duplicate, and what could not be read, with the category it guessed for each.
Correct anything that is wrong and confirm the batch in one action.

On an iPhone: open Messages, long-press a message, **More**, select the ones you
want, then **Forward** and copy the text; or use **Select All** in a thread.

### 2. An iOS Shortcut, with no typing at all

Misraf reads a message from the URL hash and imports it silently on load:

```
https://<your-deployment>/#/ingest?m=<url-encoded message text>
```

`SHORTCUTS.md` has the full automation recipe: when your bank texts you, the
Shortcut opens that URL and the transaction is in the app before you look at it.

### 3. A file

**Add → File** takes a `.txt`, `.csv` or `.json` file of messages. A `.json`
file may be an array of strings or `{ "messages": [...] }`. A `.csv` is read one
message per row, taking the widest column, which is what every SMS export
produces. A Misraf backup dropped here is recognised and restored instead.

### 4. By hand

**Add → Manual**, for cash and for anything the parser could not read.

---

## Your data

Everything lives in IndexedDB in your browser, on your device. Nothing is sent
anywhere: there is no backend, no account, no telemetry, and no network request
at runtime beyond loading the app itself.

That also means nothing is backed up for you. **Settings → Data → Back up**
writes a single JSON file containing every transaction, category, rule, budget,
income source and setting. **Restore** reads it back exactly, replacing what is
there. The round trip is covered by a test that exports, wipes, restores, and
compares.

Clearing your browser's site data deletes everything. Take a backup first.

---

## Installing on an iPhone

1. Open the deployed URL in Safari.
2. Share, then **Add to Home Screen**.
3. Open it from the home screen. It runs full screen, respects the safe areas,
   and works with no connection.

The service worker precaches the app shell at install, so a cold start with the
phone in aeroplane mode works. Your data was never on the network to begin with.

---

## Deploying, free

### GitHub Pages

`.github/workflows/deploy.yml` builds and publishes on every push to `main`.
In the repository settings, under **Pages**, set the source to **GitHub
Actions**. The workflow sets `BASE_PATH` to `/<repository-name>/` so the bundle
resolves correctly from a project site. For a user site or a custom domain,
delete the `BASE_PATH` env line and the app builds for the root.

### Netlify

`netlify.toml` is ready: connect the repository, and the defaults there build
with `npm run build` and publish `dist`. The free tier is enough; the app makes
no server calls.

### Anywhere else

`npm run build` produces a directory of static files. Any static host works.
Serve `/sw.js` with `Cache-Control: no-cache` so a new deploy can reach devices
that already installed the app; `netlify.toml` does this already.

---

## How it is put together

```
src/
  parser/        Message parsing. Pure, deterministic, no UI imports.
    normalize.ts   Digit systems, diacritics, bidi controls, whitespace
    money.ts       Amounts, currencies, balance clauses, foreign-currency pairs
    dates.ts       Five date layouts in two languages, and their ambiguities
    patterns.ts    The rule tables: reject, kind, institution, merchant, card
    merchants.ts   Acquirer-string cleanup and the matching key
    parse.ts       Puts them together into one transaction, or one refusal
    split.ts       Cuts a paste into individual messages
    dedupe.ts      Near-duplicate and refund matching
    fixtures.ts    52 realistic messages with their expected results
  categorize/    Category seeds, the merchant dictionary, the rule engine
  domain/        Budget month, statistics, budgets, alerts, recurring, insights
  db/            Zod schemas, Dexie, the repository, ingestion, backup
  i18n/          Arabic and English tables, direction, pluralisation
  components/    Design-system primitives, charts, shared pieces
  screens/       Dashboard, Transactions, Add, Budgets, Settings
```

The parser and the domain logic have no React import between them. They are
plain functions over plain data, which is why they can be tested exhaustively
and why the review screen can show exactly what will happen before it happens.

`DESIGN.md` fixes the palette, type scale, spacing and component rules.
`DECISIONS.md` records the choices that were not obvious, and why.
`REVIEW.md` is the record of reviewing this work and fixing what it found.

---

## Tests

```
npm test
npm run coverage
```

230 tests across 10 files. The parser is checked against a corpus of 52 realistic messages
covering both languages, both Arabic digit systems, diacritics, thousands
separators, five date layouts, foreign-currency purchases, balance clauses,
duplicate alerts, refunds, and the messages that must be refused. Coverage over
`src/parser`, `src/categorize` and `src/domain` is enforced at 90 percent of lines,
statements and functions, and 82 percent of branches; the run fails if any of
them slips. A separate test reads the colour tokens out of `src/index.css` and
checks every contrast ratio the design depends on, so an accessibility
regression cannot pass unnoticed either.

---

## Licence

The typeface is IBM Plex Sans Arabic, under the SIL Open Font License, vendored
through `@fontsource` so the app needs no font CDN and works offline.
