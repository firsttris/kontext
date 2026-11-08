---
description: >-
  Accessibility in Kontext: target WCAG 2.2 AA (EN 301 549, BITV 2.0), use with keyboard and
  screen reader, contrast, light and dark, reduced motion, how it is tested and what is still
  open.
---

# Accessibility { #barrierefreiheit }

Kontext is meant to be usable by everyone, also with a screen reader, with the keyboard only or
with enlarged text. The target is **WCAG 2.2 level AA**, the core of the European standard
EN 301 549 and so of the BITV 2.0, which applies to public bodies. In tenders and for
the workplaces of employees with disabilities (SGB IX § 164), that is the benchmark.

## What Kontext does for it { #was-kontext-dafur-tut }

- **Screen readers:** every button without text has a name (“Reply”, “Mark as read”), icons next to
  them are hidden. Messages like “Sent” or errors are read out (`role="status"` and
  `role="alert"`). Lists, select fields and the recipient field carry the fitting roles; the open
  mail, the selected day and the selected view are marked as current. The page is marked up in the
  chosen language (`lang`).
- **Keyboard:** everything can be reached with the keyboard, and the focus is always visible as a
  frame. The first tab stop is “Skip to content” (visible as soon as it has the focus): past the
  app bar and the sidebar to the mail list, the contact list or the content of the page. Dialogs
  and menus keep the focus, Escape closes them, and afterwards it is back on whatever opened them;
  a new dialog starts in its first field. The small month in the calendar is a single tab stop:
  the arrow keys go from day to day (up and down by a week), Page Up and Page Down by a month,
  Enter shows the day. Ctrl+Enter sends the mail you're writing. Whatever can be dragged also
  works without a mouse: mails through “Move to …”, tasks through their column in the task,
  appointments through the date and time in the appointment, files through “Attach file”. On top of
  that come keyboard shortcuts like in Gmail; `?` shows them ([App, phone and account](app.md)).
- **On the phone:** what a long press opens there, such as the actions for a chat message, a screen
  reader reaches through a button of its own that isn't visible. Zooming with two fingers is
  turned off, as in an installed app, inside a mail too; larger text comes from the browser's or
  the system's text size, on the desktop from Ctrl and plus.
- **Contrast:** text has at least 4.5 : 1 against its background, light and dark alike.
- **Reduced motion:** if “Reduce motion” is on in the system settings, sheets, notices and dialogs
  appear without animation.
- **Light and dark** follow the device or the choice under *Settings → Appearance*.

## How it is tested { #wie-es-gepruft-wird }

On every push, `e2e/accessibility.spec.ts` checks every page (sign-in, mail, new mail, calendar,
contacts, chat, tasks, settings, documents) with [axe-core](https://github.com/dequelabs/axe-core),
light and dark, on the desktop and on the phone, against the rules of WCAG 2.2 AA. A single
violation turns the test red. `e2e/keyboard.spec.ts` goes the ways with the keyboard only: skip to
content, dialogs open and closed, the small month, sending with Ctrl+Enter. On top of that, the
other end-to-end tests look for elements the way a screen reader finds them (by role and name),
and so check the labels along the way.

A machine only finds part of the problems, though. Whether a label is understandable, the reading
order is right and a task can be done with a screen reader has to be checked by a person.

## What is still open { #was-noch-offen-ist }

- **Manual testing:** a complete run with NVDA, VoiceOver and TalkBack is still to come, as is a
  test by an independent body following the BITV test procedure.
- **Mails from outside:** how accessible a received HTML mail is, its sender decides.
- **Zooming on the phone:** two fingers don't zoom (see above); a strict reading of WCAG 1.4.4
  asks for it.
- **Video calls:** there are no live captions yet.
- **Documents:** Word, Excel and PowerPoint are opened by [Schreibzeug](documents.md); how far its
  editor can be used with a screen reader is described in its own documentation.

## Accessibility statement { #barrierefreiheitserklarung }

Public bodies have to publish an accessibility statement for their applications. Whoever runs
Kontext can take this page as a basis: compliance status “partially compliant” as long as the
manual testing is still to come, with the open points above as the non-accessible content.
