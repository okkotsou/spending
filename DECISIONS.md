# Decisions

Choices that were not obvious, and the reasoning behind each. Where two options
were both defensible, the tie-break was the brief's: simplest to maintain, most
useful in daily life.

---

## Parsing

**Day-first dates, with a plausibility check.**
`12/06/2024` is unambiguous only if you know the convention. Saudi banks write
day first, so that is the default. Where every group is two digits the layout is
genuinely ambiguous — `24-06-12` is Al Rajhi writing `2024-06-12`, and
`12-06-24` is another bank writing `12 Jun 2024` — so the parser builds both
readings, discards any that land in the future (a bank does not announce
tomorrow's purchase), and takes whichever remaining reading is closest to today.
A tie falls to day-first. This resolves every sampled format correctly and
degrades sensibly on one it has not seen.

**Balance clauses are removed, not ranked.**
A wallet alert routinely says "spent 32.00, balance remaining 418.20". Scoring
candidate amounts and picking the best would work most of the time; the failure
mode is silently booking someone's balance as a purchase. Lines and clauses that
mention a balance are deleted from the working text before any amount is read,
so the wrong number is not available to be chosen.

**A message with no confident reading is kept, not guessed.**
The parser requires both a transaction kind and an amount. Anything else becomes
an unrecognised message with its full original text, visible in the app, with a
form to enter it by hand. This is the single most important behaviour in the
system: a budget built on invented numbers is worse than no budget.

**The raw text is never discarded.**
Every transaction keeps the message it came from, and a merged duplicate keeps
the text of the alert that lost. Parsing rules will change; the evidence should
survive them.

**Rules are written in ordinary Arabic and folded when compiled.**
Matching happens on text with alef variants unified, ta marbuta written as ha
and diacritics stripped. Rather than ask whoever adds a rule to remember that
spelling convention, `patterns.ts` compiles each rule through the same folding
function. Folding is character-for-character, so offsets into the folded text
address the same characters in the original — which is how the parser recovers a
merchant's real spelling and casing after matching on the folded form.

**A foreign charge with no riyal leg is flagged, not converted.**
When a message reports both legs (`USD 15.49` and `Amount in SAR 58.10`) the SAR
figure is what was charged and is used. When only the foreign amount is present
there is no exchange rate available offline and no honest way to invent one, so
the transaction is saved at face value and marked for review. Making up a rate,
or fetching one, would break either accuracy or the zero-cost constraint.

**Duplicate alerts merge on amount, merchant, card and time.**
Ten minutes is the window for two alerts that both carry their own timestamp.
Wallet alerts frequently carry no date at all, so their timestamp is import
time, which can be weeks after the purchase; for those, the inbox order is the
better signal. An undated alert is matched against the three messages beside it
in the same batch, requiring the same amount and either the same card tail or
the same named merchant. Outside a batch — a single message arriving by URL —
an undated alert may still match within four days on the same strengthened
identity test. The richer of two merged alerts wins, so a bank alert with a
merchant and a card beats an Apple Pay alert with neither.

**Refunds cancel, they do not net.**
A refund is linked to the charge it reverses and both are excluded from
spending. Treating a refund as income would inflate the month's income; netting
it into the category would make the category total no longer match the
statement. Excluding both is the only reading where every figure still ties out.

---

## Budgets and figures

**The budget month is labelled by the month its last day falls in.**
With a start day of 27, the period 27 May to 26 June is "June", because the
salary that arrives on 27 May is the money June is lived on. With a start day of
1 this collapses to the calendar month, so the rule is consistent either way.

**The start day is capped at 28.**
A month that started on the 30th would skip February. Rather than invent a rule
for short months, the setting is limited to a day every month has. Anyone paid
on the 30th sets 28 and loses two days of alignment, which is a smaller problem
than a February with no budget month at all.

**The current day counts as elapsed for pace.**
Pace compares actual spend against `limit × (days elapsed / days in month)`,
where today counts as a whole day. A limit already spent by lunchtime is over
pace whatever the clock says, and counting today makes the even-pace line meet
the limit exactly on the final day rather than a day early.

**Rollover carries surplus, never debt.**
An unspent limit can be carried into the next month, per category, off by
default. An overspend is not carried forward as a negative: a second punishing
month is not what the setting is for, and a compounding deficit stops being a
budget.

**Suggested limits come from the months a category was used.**
The suggester averages the last three budget months, ignoring months with no
spending, adds five percent of headroom, and rounds to a figure a person would
actually pick. Including empty months would set an impossible limit for anything
seasonal.

**"Unusual" is measured against the median.**
A charge is called unusual when it exceeds three times the median charge in its
category, with at least five prior charges and at least 150 riyals. The median
rather than the mean, so one previous outlier does not raise the bar for the
next.

**Recurring needs three occurrences, not two.**
Two charges a month apart are a coincidence. Three at a similar amount with
monthly gaps are a subscription. The amount filter also excludes a one-off large
purchase at a merchant that also bills monthly, so a single big Amazon order does
not distort the estimate of the Amazon subscription.

**Income waits for confirmation.**
Detected inflows are held as pending and excluded from every figure until
confirmed. A misparsed message can therefore never inflate income, which is the
number every other calculation leans on. Off is available in settings for anyone
who would rather not confirm.

---

## Storage and privacy

**IndexedDB through Dexie, and nothing else.**
No account, no sync, no export unless the user asks. Dexie is used for its
indexes and transactions, not as an abstraction: the repository layer is the
only thing that touches tables, so write ordering and seeding live in one place.

**Restore replaces, it does not merge.**
Merging a backup into an existing database would duplicate every transaction
that is in both. Restore is destructive and says so before it runs.

**Backups are validated before anything is written.**
The whole file is parsed through the Zod schemas first. A truncated or
hand-edited file fails with a message rather than half-importing.

**Seeded categories cannot be deleted, only merged or archived.**
A transaction must always point at a category that exists. Built-in categories
can be renamed, recoloured and merged away — a merged built-in is archived
rather than deleted, so the seed set stays complete and the merge can be undone.

---

## Interface

**Arabic is the default, and RTL is real.**
`dir` is set on the document element and the layout is built from logical
properties throughout, so the same CSS produces a correct mirrored layout with
no per-direction overrides. Charts are mirrored by reversing the axis, not by
transforming the SVG, so labels stay upright.

**Arabic uses Latin digits.**
The whole interface depends on tabular lining figures to keep columns aligned,
and IBM Plex Sans Arabic does not offer Eastern Arabic numerals in a tabular
form. Latin digits in Arabic are also the norm in Saudi banking apps and on
receipts. The parser reads both digit systems on input regardless.

**Arabic count strings are written to work at every number.**
Arabic has six plural categories. Rather than six forms of every string, the
count-bearing Arabic strings put the number after a plural noun and a colon
("عمليات بحاجة إلى مراجعة: 1"), which is grammatical for every count and is
common in Arabic interfaces. English, which needs only two forms, has proper
singular variants selected through `Intl.PluralRules`. This is a deliberate
trade of a small stylistic compromise in one language for a large reduction in
strings to keep in step.

**Hash routing.**
The app has to work from a GitHub Pages subdirectory, from a Netlify root, and
from a home-screen icon with no server to consult about paths. A hash route is
the only form that satisfies all three with no redirect rules, and it gives URL
ingestion somewhere to live.

**The period selector changes the totals; pace stays monthly.**
Selecting three or twelve months changes the headline figures, the breakdown,
the top merchants and the insights. Budget health and the even-pace line are
defined against a single budget month, so on a multi-month period the pace card
is replaced by the trend chart rather than showing a pace line against a limit
that never existed for that span.

**The service worker is written here rather than generated.**
A build plugin injects the real content-hashed asset list into a small worker in
`src/pwa/sw-template.js`. That is a dozen lines of Vite plugin instead of a
dependency, and the caching strategy stays readable: precache the shell, serve
it cache-first, fall back to the shell for navigations. Legacy `.woff` faces are
left out of the precache because every browser that runs this app reads `.woff2`.

**Icons are generated, not vendored.**
`scripts/generate-icons.mjs` rasterises the app mark to PNG with signed distance
fields and writes the file with Node's own zlib. No image dependency, no binary
committed that nobody can regenerate, and the mark can be changed in one place.

**No emoji anywhere.**
Lucide throughout, including in these documents and in the commit history.

**A declined attempt is recorded, never counted.**
"Insufficient balance" messages carry a card, a merchant, an amount and a
timestamp, so they parse as cleanly as a real purchase. No money moved, so
booking one would overstate the month. They stop at the parser with the reason
`declined` and appear in the not-counted queue, where the user can see the app
handled the message rather than lost it.

**Money between the user's own accounts is a kind of its own.**
Topping up a wallet arrives as an ordinary purchase alert: same card, same
format, only the counterparty differs. The kind `self_transfer` is neither an
outflow nor income, so it changes no total, and the row is drawn without a sign
because the message genuinely does not say which direction the money went. The
signal is the counterparty alone -- a bank or a wallet provider -- read from the
merchant field only, so a card issued by a bank cannot turn every purchase on it
into a transfer. Anything this reads wrong is one tap to correct, and it is
listed in the row's matched rules so the reason is visible.

**A stated total wins over the goods amount, but only when it reconciles.**
A cross-border card purchase reports the amount, then VAT and fees, then the sum
actually debited. Taking the first figure understates the month. The parser
prefers the stated total only when it equals the amount plus the stated charges
to the cent; a total that does not add up is some other figure and is ignored.

---

## Deliberate non-goals

- **No exchange rates.** They cannot be fetched offline or for free forever.
- **No cloud sync.** It would need a backend, which would need an account.
- **No machine learning at runtime.** The categoriser is a dictionary and a rule
  list. It is inspectable, correctable, and the same every time.
- **No transaction import from bank APIs.** Open banking in the region needs
  credentials and agreements this app deliberately does not have.
