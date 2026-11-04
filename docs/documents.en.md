---
description: >-
  Documents in Kontext: Word, Excel, PowerPoint and PDF in the browser with Schreibzeug,
  self-hosted – folders per shared mailbox, filing attachments, sharing files on tasks,
  appointments, contacts and in the chat, without a second sign-in.
---

# Documents { #dokumente }

The “Documents” module is [Schreibzeug](https://github.com/firsttris/schreibzeug): open and edit
Word, Excel, PowerPoint and PDF files in the browser, on your own server. It runs as a service of
its own next to Kontext (optional) and appears in Kontext's window – without a second sign-in,
light or dark like Kontext; an open document stays open while you answer a mail.

## What you do with it { #was-man-damit-tut }

- **Save attachments to Documents** – into a folder, or open them right there. **Attach from
  Documents** while writing a mail. The files go from server to server, each time with the
  person's rights; for an encrypted mail the browser fetches them, so that they reach Stalwart
  only encrypted.
- **One folder per shared mailbox:** info@ and rechnung@ have documents of their own, open to
  everyone who works in the mailbox, and always in line with the company admin. An attachment from
  info@ lands there first.
- **Files where they belong:** share them in the chat, link them to a task or a contact, attach
  them to an appointment – whoever is there may open them.
- **Signing out and blocking** apply to both: whoever is blocked in Kontext is blocked in
  Documents too.

Schreibzeug also runs on its own, with “Sign in with Kontext” (OpenID Connect).

Setup: [Installation → Documents](installation.md#dokumente). Technical details:
[Architecture → Documents](architecture.md#dokumente).
