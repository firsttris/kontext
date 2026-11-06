# Roadmap

The features coming next to Kontext, sorted by benefit: the most useful first. The order is a
plan, not a promise; wishes are welcome as an [issue](https://github.com/firsttris/kontext/issues).
What is already done is in the [changelog](CHANGELOG.md) and the
[documentation](https://firsttris.github.io/kontext/en/). Auf Deutsch: [ROADMAP.de.md](ROADMAP.de.md).

## New in Stalwart

What Stalwart 1.0.2 and 1.0.3 bring and Kontext does not use yet.

| # | Feature | What it is about |
| --- | --- | --- |
| 1 | **Encrypt and compress the storage** | Stalwart encrypts stored data with a server key (`SymmetricKey`, AES-256-GCM) and compresses it with Zstandard; `BlobRecode` rewrites what is already there (since 1.0.3). Protects the disk and the backup. The setup command switches it on. |
| 2 | **Mail programs without an app password** | With two-factor sign-in, Apple Mail and Thunderbird no longer need an app password: Stalwart 1.0 implements the OAuth profile for mail programs. For it, the OAuth discovery under `/.well-known` has to go to Stalwart instead of Kontext (Caddy), and Stalwart's sign-in page has to be reachable from outside. |

## More features

| # | Feature | What it is about |
| --- | --- | --- |
| 3 | **The telephone box as its own phone system (SIP trunk)** | The telephone box signs in directly with the provider over a SIP trunk (such as Telekom, sipgate, easybell) instead of signing in at the Fritzbox as an IP phone. It then becomes the phone system itself, like 3CX or Placetel, but in Kontext and without a licence per extension: numbers, extensions, forwarding and desk phones hang on Kontext, and the Fritzbox is only a router or goes away. Along with it SIP over TLS, a queue with position and more desk phones (Yealink, Grandstream). The Fritzbox stays as the simple way for businesses that want to keep it. |
| 4 | **More languages** | After German and English, more European languages. |

## More ideas

Not planned yet; which of them come is decided later.

| Idea | What it is about |
| --- | --- |
| **Online appointment booking** | A booking page for customers with the free times from the calendar; the booked appointment goes straight into the calendar, with a confirmation by mail. For practices, law firms and trades; "Wer hat Zeit?" and the guest links for video meetings are already there. |
| **Book rooms, company cars and equipment** | Bookable resources with their own calendar, invited to an appointment and refusing double bookings. Stalwart knows only user and group accounts; a resource would be a group account like a shared mailbox. |
| **GoBD mail archive** | Keep business mail unchangeable and for years, as the German retention rules (GoBD) require; today that takes a separate archive. Large, rather a module of its own like [Schreibzeug](https://github.com/firsttris/schreibzeug). |
| **Mail merge to a contact group** | One mail to everyone in a group, each sent singly and personally with a salutation, for example for a company holiday or new prices. |
