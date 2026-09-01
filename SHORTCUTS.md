# Getting bank messages into Misraf automatically on iPhone

iOS does not let a web app read SMS. It does let Shortcuts react to an incoming
message and open a URL, and Misraf reads a message straight out of the URL hash
and imports it silently. Set this up once and a transaction lands in the app
without you typing anything.

Everything here runs on your phone. The message text goes into a URL that opens
your own copy of Misraf. It is not sent to any service.

---

## Before you start

1. Deploy Misraf, or open the copy you already have, and note its address.
   The examples below use `https://example.github.io/misraf/` — replace it with
   yours everywhere it appears.
2. Add Misraf to your home screen (Share, then **Add to Home Screen**) so the
   automation opens the installed app rather than a Safari tab.
3. Find the sender name your bank texts from. It appears at the top of the
   thread in Messages: `AlRajhiBank`, `SNB`, `stcpay`, `Alinma`, `RiyadBank`,
   and so on. You will need it exactly.

---

## The automation

**Shortcuts app → Automation → New Automation → Message**

Configure the trigger:

| Field | Setting |
| --- | --- |
| **Sender** | Choose **Sender**, then type your bank's sender name |
| **Message contains** | Leave empty, or narrow it (see "Filtering" below) |
| **Run** | **Run Immediately** |
| **Notify When Run** | Off |

Then **Next**, and build these actions in order.

### Action 1 — Text

Add a **Text** action. Tap the field, then tap the **Shortcut Input** variable
so the action contains only the message that triggered the automation.

> Text
> `[Shortcut Input]`

If Shortcut Input is not offered, use **Get Details of Message → Content** as
the first action and put that variable here instead.

### Action 2 — URL Encode

Add **URL Encode** (search for "URL Encode"; it is under Text). Set it to encode
the **Text** from Action 1.

> URL Encode `[Text]`

This is the step that matters. Bank messages contain newlines, colons, `*`,
`#` and Arabic characters, all of which break a URL if they are not encoded.

### Action 3 — URL

Add a **URL** action and enter your address followed by the ingest route, with
the encoded text from Action 2 pasted in as a variable at the end:

```
https://example.github.io/misraf/#/ingest?m=[URL Encoded Text]
```

Type the fixed part by hand, then tap the **URL Encoded Text** variable at the
point where `[URL Encoded Text]` appears above. Do not type the square brackets.

### Action 4 — Open URLs

Add **Open URLs** and point it at the **URL** from Action 3.

Save the automation.

---

## What happens when it runs

The bank texts you. Shortcuts opens Misraf at the ingest route. Misraf reads the
message, parses it, checks it is not a duplicate of something already stored,
categorises it, saves it, and replaces the URL so a refresh cannot import the
same message twice. A short confirmation appears at the bottom of the screen.

If the message is one Misraf cannot read, it goes to the unrecognised queue
rather than being dropped, and you will see it under **Transactions** the next
time you look, with the option to enter it by hand.

If the message is not a transaction at all — a passcode, a marketing message, a
balance notice — Misraf recognises that and does not create anything.

---

## Filtering, so the automation does not fire on everything

Banks send passcodes and offers from the same sender as purchase alerts. Misraf
refuses those, so nothing is corrupted either way, but you can avoid the app
opening at all by narrowing the trigger. In the automation trigger, set
**Message contains** to one of:

- `شراء` — Arabic purchase alerts
- `Purchase` — English purchase alerts
- `مبلغ` — anything with an amount, which is broader

You can create more than one automation, one per phrase and one per bank sender.

---

## Sending several messages at once

The ingest route accepts repeated parameters and multi-line payloads, so a
Shortcut that has collected a batch can send them together:

```
https://example.github.io/misraf/#/ingest?m=<first>&m=<second>&m=<third>
```

A single `m` containing several messages separated by blank lines works too:
Misraf splits it with the same splitter the paste box uses.

---

## A manual Share Sheet shortcut, as a fallback

If you prefer not to run an automation, make a shortcut you can invoke from the
Share Sheet after copying a message:

**Shortcuts → New Shortcut → Shortcut Details → Show in Share Sheet**, accept
**Text**, then the same three actions: **URL Encode** the Shortcut Input,
build the **URL**, **Open URLs**.

Then in Messages: long-press a message, **Share**, and pick the shortcut.

---

## If it does not work

**The app opens but nothing is imported.**
The text was probably not URL-encoded. Check that Action 2 is **URL Encode** and
that Action 3 uses its output, not the raw text.

**"That message could not be read".**
The format is not in the rule table yet. Open **Transactions → messages could
not be read**, and enter it by hand; the original text is kept there. To add the
format properly, a new entry in `src/parser/patterns.ts` and a fixture in
`src/parser/fixtures.ts` is all it takes.

**"That message was already recorded".**
Working as intended: the same message was imported before, or the bank and Apple
Pay both announced one purchase and Misraf merged them.

**The automation does not trigger.**
Personal automations for messages must be set to **Run Immediately** with
**Notify When Run** off, and the sender has to match exactly. Check the sender
name at the top of the Messages thread.

**Safari opens instead of the installed app.**
Add Misraf to the home screen first. iOS routes a URL to an installed web app
only when its scope has been installed.
