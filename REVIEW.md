# Review

Two passes over the finished app, each reading the code as if seeing it for the
first time, followed by driving the real user paths in a browser. Every finding
is listed with what was wrong, what it would have cost, and what was done.

---

## Pass one

### Bugs found by driving the app, not by reading it

**1. The splitter cut messages in half.** `patterns` in `split.ts` treated a
bare `مدى` as the start of a new message. Al Rajhi puts `مدى-أبل باي` on the
second line of a purchase alert, so every Al Rajhi Apple Pay message was split
into a headless fragment (which then failed to parse, with no amount) and a
remainder. Two transactions became one transaction and one entry in the
unrecognised queue.
*Fixed:* network names only open a message when they are the entire line.
Regression test: `split.test.ts`, "does not split on a network name that appears
inside a message".

**2. A bank's own name was split off as a separate message.** SNB writes
`البنك الأهلي السعودي` above `شراء نقاط بيع`, and the second line is a valid
opener, so the bank name became a message of its own and landed in the
unrecognised queue on every import.
*Fixed:* a fragment that is a single line with no figures in it is a header, and
is rejoined to the message below. Regression test: "keeps a bank name header
with the message it introduces".

**3. Apple Pay duplicates were not merging.** The stated purpose of the
duplicate rule is to collapse the bank alert and the wallet alert for one
purchase. In practice it almost never fired, because an Apple Pay alert carries
no date, so its timestamp is import time — often days or weeks after the charge,
far outside the ten-minute window. A month of pasted history double-counted
every Apple Pay purchase.
*Fixed:* an undated alert is matched against the three messages beside it in the
same batch, requiring the same amount and either the same card tail or the same
named merchant, because the inbox order is the evidence the timestamp cannot
give. Outside a batch, the widened window still requires that strengthened
identity test. Three regression tests in `storage.test.ts`.

**4. Category limits did not refresh after the suggester wrote them.** The
per-category limit fields are uncontrolled with a `defaultValue`. Accepting the
suggested limits wrote new values to the database, the fields kept showing the
old ones, and the next blur wrote the stale value back — silently undoing the
suggestion.
*Fixed:* each field is keyed on its stored limit, so a limit changed elsewhere
remounts the field.

**5. Enter did not save a limit.** The limit fields committed on blur only. On a
phone, pressing the keyboard's return key dismissed the keyboard without a blur
event on some paths, and the typed limit was lost.
*Fixed:* Enter blurs the field, which commits it.

**6. Enrichment was lost when a batch contained only duplicates.** If a paste
contained nothing but re-sends of stored messages, the review screen's only
enabled control was the close button. The plan's enrichment updates — the fuller
merchant name and card tail from the new alert — were discarded.
*Fixed:* the commit button is enabled whenever there is a plan to commit.

**7. The suggester was unusable in a first month.** It reads the three
*completed* budget months, so a new user with one month of imported history was
told "not enough history yet" and given a disabled button.
*Fixed:* when the completed months are empty it proposes from the current month
instead, and the empty state now carries a real action rather than a dead
button.

### Accessibility

**8. Two palette tokens failed AA.** `--c-text-muted` measured 3.19:1 on the
sunken ground in light and 3.77:1 in dark — well under 4.5 — and it carries all
meta text and every chart axis label. `--c-border-strong`, which draws every
input boundary, measured 1.69:1 against 3:1 required for non-text UI. DESIGN.md
asserted both were compliant. The assertion was wrong.
*Fixed:* light muted `#8A857D` → `#706C65`, dark `#807A72` → `#8E877F`, light
border-strong `#CBC7BE` → `#8C8983`, dark `#443F3A` → `#726A61`. Added
`src/theme.test.ts`, which reads the tokens out of `index.css` and computes
every ratio, so this cannot silently regress and DESIGN.md's claim is now true
by construction.

**9. The skip link went nowhere.** `<main>` had an id but no `tabIndex`, so
following the link moved the viewport without moving focus.
*Fixed:* `tabIndex={-1}` on `<main>`.

**10. Three form fields were labelled with the wrong thing.** The transaction
type select was labelled "Purchase" (the name of one of its options), and every
time input was labelled with an em dash used as a placeholder.
*Fixed:* real `common.type` and `common.time` labels in both languages.

**11. Charts had no text equivalent.** The pace chart and the trend chart were
pure SVG with no accessible content.
*Fixed:* each carries a screen-reader summary of the figures it draws and hides
the drawing from the accessibility tree. The donut already had its ranked list
beside it, which is now marked as the accessible form.

**12. Compact controls were 36px on touch.** The brief requires 44px. Card
actions and dashboard chips used the compact height everywhere, including on
phones.
*Fixed:* `.control-compact` is 36px with a fine pointer and 44px with a coarse
one. Verified by an audit that measures the *effective* target — a control
inside a label is activated by the whole label — across all five screens on an
emulated iPhone: zero targets under 44px.

**13. The tab title stayed Arabic in English.** Set once in `index.html` and
never updated.
*Fixed:* the title follows the language along with `lang` and `dir`.

**14. The period selector's accessible name was "This month".** It was labelled
with the name of its first option.
*Fixed:* a `common.period` label.

### Correctness and honesty of the numbers

**15. The transactions header summed inflows and outflows together.** A filtered
list showing a salary and some purchases produced a figure that was neither a
total spend nor a net.
*Fixed:* it is spend, using the same `totalSpend` every other total uses.

**16. A refund named a category instead of the charge it cancelled.** The
transaction editor's "cancels X" line read the category name off the refund
rather than looking up the reversed transaction.
*Fixed:* it names the actual charge.

**17. Two alerts said the same thing.** A scope at 97 percent of its limit
raised both an approaching alert and a pace alert. On a phone that filled the
first screen with four amber cards for two problems.
*Fixed:* at most one budget alert per scope, at the highest severity that
applies; the pace projection and breach date ride along with the approaching
alert instead of duplicating it. Once a limit is passed, pace is moot and only
the overage shows.

### Language

**18. Arabic counts were ungrammatical.** Strings were built as
`{count} عمليات`, which reads "1 transactions" in Arabic just as badly as it
does in English, and Arabic has six plural categories rather than two.
*Fixed:* Arabic count strings put the number after a plural noun and a colon,
which is grammatical at every count and is the convention in Arabic interfaces.
English, which needs only two forms, has proper singular variants selected
through `Intl.PluralRules`. Recorded in DECISIONS.md, tested in `i18n.test.tsx`.

**19. A CSV header row was imported as a message.** Every CSV import put its own
column names into the unrecognised queue.
*Fixed:* a leading row with no figures and under 24 characters is dropped.

**20. System notifications had an empty body.** They announced "Misraf" and
nothing else, which is not worth an interruption.
*Fixed:* the dispatch moved out of the provider into `AlertNotifier`, which has
the translation table, and now sends a short translated line. It stays
deliberately vague about figures, because a notification lands on a lock screen
other people can read.

### Structure

**21. Four exported functions were never called.** `containsTime`,
`groupByBudgetMonth`, `isInflow`, and `buildIngestUrl`.
*Fixed:* the first three were deleted. The fourth was the wrong call to delete —
a person building the iOS Shortcut needs their own deployment's ingest address,
and had no way to get it. It is now used by the settings screen, which shows the
address with a copy button, and SHORTCUTS.md and the UI cannot drift apart.

**22. Test files were type-checked with the app's compiler options.** Adding a
test that reads a file off disk produced errors about `node:fs` not existing.
*Fixed:* tests moved into their own TypeScript project with Node types;
`tsc -b` builds both.

**23. `applySelection` mutated its input.** The ingest plan is a proposal the
review screen shows before anything is written, but committing a subset wrote
category corrections back onto the caller's plan objects, and the pool of
existing rows was shared rather than cloned.
*Fixed:* the plan is built over clones and corrections produce a new plan.
Caught by the lint rule, confirmed by reading the flow.

**24. Three components synchronised state from props in an effect.** The
transaction editor, the review sheet and the transactions filter all copied
props into state on change, which is a cascading render and goes stale under
concurrent rendering.
*Fixed:* each is keyed by its subject and initialises state once on mount, which
is the React-idiomatic form of the same intent.

---

## Verification after pass one

- `npm run lint` — clean.
- `tsc -b` — clean, no `any`, no unused locals, no unchecked switch cases.
- `npm test` — 220 passing.
- `npm run coverage` — 95.9 percent of statements, 99.2 percent of lines and
  85.5 percent of branches over `src/parser`, `src/categorize` and `src/domain`,
  against thresholds of 90/90/82 that fail the run if missed.
- `npm run build` — succeeds; 133 KB gzipped for the app, 118 KB for the charts,
  32 KB for storage, with the service worker precaching the shell.

Driven in a real browser, with the clock frozen so results are reproducible:

| Path | Result |
| --- | --- |
| First run, no data | Empty state with one action, no console errors |
| Paste 14 mixed Arabic and English messages | 11 to add, 1 duplicate merged, 2 unreadable |
| Duplicate bank and Apple Pay alert | Merged into one, bank's date and merchant kept |
| Refund | Linked to its charge; both excluded from spending |
| Salary deposit | Held as pending, confirmed from the dashboard chip |
| Crossing a limit | Over-limit alert with the exact overage |
| Pace warning | Fired with the projected month-end total and the breach date |
| Auto-suggested limits | Proposed, editable, applied, and the fields refreshed |
| Unrecognised queue | Two messages held; one entered by hand, queue dropped to one |
| Language and direction | `dir` flips, charts mirror, tab title follows |
| Theme | System, light and dark all apply without a reload |
| Backup and restore | 12 rows out, erased to zero, 12 rows back |
| Reload | State persists |
| 375 / 768 / 1440, both directions | No horizontal overflow at any width |
| Keyboard | Skip link is the first tab stop; 2px focus ring on every control |
| Touch targets | Zero under 44px across all five screens on an emulated iPhone |

---

## Pass two

A second reading, this time of the fixes themselves and of the paths pass one
had not driven. Eleven more findings, four of them real defects.

### Defects

**25. A backup dropped on the file importer was read as messages.** The file tab
recognises a Misraf backup by looking for `"app":"misraf"` in the text. The
exporter pretty-prints with two-space indentation, so the actual bytes read
`"app": "misraf"` and the check never matched. Anyone who dragged their own
backup into Add rather than Settings would have had it shredded into
unrecognised messages.
*Fixed:* the check parses the JSON and reads the field. Regression test asserts
that the exported form does *not* contain the compact substring, so the old
check cannot creep back.

**26. Escape closed the wrong sheet.** A confirmation opened over an editor
registered its keydown listener after the editor's, but both listen on
`document` in the capture phase, so the editor's fired first and
`stopPropagation` does not stop a sibling listener on the same node. Escape over
a delete confirmation closed the editor underneath and left the confirmation
orphaned.
*Fixed:* sheets register on a stack, and only the innermost acts on Escape.

**27. Search normalised every message on every keystroke.** The filter ran
`matchable()` over the merchant, the raw text and the note of every transaction
for each character typed. At a year of history that is thousands of string
normalisations per keypress.
*Fixed:* the haystack is built once per ledger change and looked up by id.

**28. Failing to commit a batch locked the only way to retry.** `saving` was set
before the write and never cleared, so if the write threw, the review sheet
stayed open with a permanently disabled button.
*Fixed:* cleared in a `finally`.

### Honesty of what is displayed

**29. Date-only messages displayed a time the bank never sent.** A message with
`التاريخ: 12/06/2024` and no clock is stored at local midnight, and the
transaction row printed "12:00 AM" beside it as if the bank had said so.
*Fixed:* the parser already knew — `hasTime` — but was throwing it away. It is
now carried through as `timeKnown` on the transaction, persisted, validated, and
the row shows a time only when there is one. The fixture suite asserts that no
date-only message ever claims a time.

**30. The review footer showed a total of purchases and income added together.**
A batch containing a salary and some purchases showed "SAR 17,268", which is
neither a spend nor a net.
*Fixed:* removed. The count is the figure that matters and it is on the button.

**31. Category names truncated to three letters on the budgets screen.** The
per-category row put the name, the amount spent, a limit field and the rollover
control on one line; at 375px the name was left about 40px and every Arabic
category rendered as "اتصا…", "صحة…", "ترفيه …".
*Fixed:* the name and the spent figure stack in one block, leaving the name the
width it needs. A row of zeros for unused categories is also suppressed, with a
fixed block height so the list stays even.

### Language, again

**32. Alerts joined their clauses with Latin punctuation in Arabic.** The comma
between clauses was `,` rather than `،`, and a full stop landed straight after
the riyal symbol, which already ends in a period, producing "ر.س..".
*Fixed:* the separators are themselves translated. Arabic joins with its own
comma and no full stops; English keeps the sentence break.

**33. Arabic alerts and insights failed gender agreement.** Strings were built
as "{category} بلغ ...", and a category name interpolated as the grammatical
subject cannot agree — "بقالة وتموين بلغ" needs "بلغت".
*Fixed:* the category is named before a colon and the sentence continues with a
fixed subject: "بقالة وتموين: بلغ الصرف 90% من الحد". Correct for every category
name, and no agreement table to maintain.

### Robustness

**34. A rejected promise failed silently.** Every write in the app is a promise
and most call sites used `void`. A quota error, a blocked IndexedDB or a corrupt
file would have produced a button press that did nothing and said nothing.
*Fixed:* `ErrorReporter` listens for unhandled rejections and uncaught errors
and raises a toast. It says only that nothing was changed, which is true because
every multi-row write runs inside a Dexie transaction; the detail goes to the
console.

**35. A render error left a white screen.** There was no error boundary
anywhere, and with all the data local a blank page would have looked like data
loss.
*Fixed:* an error boundary around the routed screen, keyed on the route, whose
fallback says the data is untouched and offers a reload and a retry.

**36. The URL payload was cleared before the import had settled.** A shortcut's
message was stripped from the address bar at read time, so a failed write lost
it with no way back.
*Fixed:* reading and clearing are separate steps; the URL is cleared only after
the import resolves. Re-reading an already-imported message is harmless, because
it collides on its fingerprint. Nine tests cover the URL contract, including a
round trip of a real Arabic message.

**37. Discarding the whole unrecognised queue asked nothing.** One tap deleted
every held message and their original text with it.
*Fixed:* a confirmation naming the count. Discarding one message still does not
confirm, which is proportionate.

### Structure, again

**38. `isInflow` and the kind lists were exported but unused.** Pass one deleted
three dead exports and then reintroduced one while tidying.
*Fixed:* the kind arrays are module-private and only the two predicates the app
actually calls are exported. The compiler's unused-locals check now enforces it:
an unused list fails the build rather than lingering.

### Found by looking at the screens, not the code

**39. Every toggle was drawn backwards.** The knob sat at the near end when the
switch was on and travelled to the far end when it was off, in both directions.
The state was announced correctly to assistive technology, so only sighted users
saw it, and they saw the opposite of the truth.
*Fixed:* the offsets were swapped. `translateX` is not direction-aware, so RTL
takes the negative of the same offset; verified by screenshot in both.

**40. Settings controls stretched the full width of a desktop column.** A select
1,300 pixels wide holding the word "System" reads as a mistake rather than a
choice.
*Fixed:* form controls on that screen are capped at 420px, which is the width
the design's field rules imply.

**41. The About card ran its labels into its values.** A definition list laid
out inline produced "Install on your phone   Share, then Add to Home Screen"
with nothing separating the two.
*Fixed:* label above value, matching the pattern the rest of the app uses.

---

## Verification after pass two

Every check re-run from clean:

- `npm run lint` — clean.
- `npx tsc -b` — clean across all three projects (app, tests, build scripts).
  No `any`, no unused locals or parameters, no unchecked switch cases.
- `npm test` — 230 passing across 10 files.
- `npm run coverage` — 95.7 percent of statements, 99.1 percent of lines,
  97.4 percent of functions and 85.7 percent of branches over `src/parser`,
  `src/categorize` and `src/domain`. Thresholds of 90/90/90/82 fail the run.
- `npm run build` — succeeds, service worker emitted with the hashed shell.

Driven again end to end in Chromium, at 375, 768 and 1280 pixels, in Arabic and
English, light and dark, and on an emulated iPhone:

- No console errors or page errors on any path.
- No horizontal overflow at any width in either direction.
- Zero effective tap targets under 44px on any of the five screens.
- Backup exported, everything erased, backup restored: the same twelve rows.
- Duplicate Apple Pay alert merged; the refund struck through and excluded; the
  salary held for confirmation and then counted; limits crossed, pace warned
  with a projected total and a breach date; the unrecognised queue emptied by
  entering one message by hand.

### Known limits, stated rather than hidden

- A foreign charge with no riyal leg is stored at face value and flagged for
  review. There is no free, offline exchange rate, and inventing one would be
  worse than asking.
- Two identical charges at the same merchant on the same card within ten
  minutes will merge. This is the correct trade: a double alert is common, two
  genuinely identical purchases minutes apart are not, and the transaction can
  be split by hand.
- The budget month starts on day 1 to 28. A pay date of the 29th or later has
  no equivalent in February, so the setting is capped rather than given a rule
  nobody would predict.
- Native date and time inputs render in the browser's locale, not the app's.
  That is not controllable from a web page, and the alternative — a hand-built
  date picker — would be worse on a phone than the system one.
