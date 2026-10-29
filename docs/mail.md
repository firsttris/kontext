---
description: >-
  Webmail für den eigenen Mailserver (Stalwart, JMAP): gemeinsame Postfächer wie info@, alle
  Posteingänge in einer Liste, Kategorien, Regeln, Suche wie Gmail, Wiedervorlage, später
  senden, Textbausteine, Gmail und GMX abrufen, Schutz vor gefälschten Absendern.
---

# Mail

Kontext ist das Mailprogramm im Browser und am Handy für den eigenen Mailserver
[Stalwart](https://stalw.art) – gebaut für Teams mit gemeinsamen Postfächern. Mails kommen per
JMAP-Push ohne Neuladen; Thunderbird, Outlook und die Mail-App am Handy verbinden sich weiter per
IMAP und SMTP.

![Posteingang mit Ordnern, gemeinsamen Postfächern info@ und rechnung@, Kategorien und einer geöffneten Mail mit PDF-Vorschau](screenshots/mail.png)

## Im Team

- **Gemeinsame Postfächer** (info@, rechnung@) stehen bei jedem Mitglied in der Seitenleiste,
  mit voller Adresse wie das eigene – so heißen sie überall, auch in den Listen, bei Aufgaben,
  im Chat, im Kalender und in den Kontakten.
  Antworten gehen als info@ hinaus, mit dem Namen der Person, die geantwortet hat; die Liste
  zeigt, wer schon geantwortet hat („Jonas · 14:02“). Rechte je Person: kein Zugriff, nur lesen,
  lesen und senden. [Mehr](architecture.md#gemeinsame-postfacher)
- **Alle Posteingänge** in einer Liste: das eigene Postfach und die gemeinsamen zusammen.
- **Kategorien** wie „In Bearbeitung“, „Wartet auf Antwort“, „Erledigt“ – mehrere je Mail, eigene
  dazu, per Regel gesetzt. In info@ sieht sie das ganze Team: eine kleine Aufgabenliste.
- **Besprechen statt weiterleiten:** „Besprechen“ (`b`) bringt eine Mail als Karte in den
  [Team-Chat](chat.md); „Aufgabe“ (`t`) macht eine [Aufgabe](tasks.md) daraus.
- **Textbausteine** für Standardantworten, eigene und gemeinsame für info@; `{Name}` wird zum
  Empfänger.

## Ordnen und finden

- **Suche wie in Gmail** über alle Ordner und Postfächer, mit Operatoren wie `von:`, `an:`,
  `betreff:`, `hat:anhang`, `ist:ungelesen`, `kategorie:`, `in:info@`, `nach:`/`vor:` (auch
  englisch: `from:`, `has:attachment` …) und Vorschlägen beim Tippen.
- **Regeln** („wenn Absender, Empfänger, Betreff oder Text … dann in Ordner, markieren, Kategorie
  setzen, weiterleiten, Aufgabe anlegen“) laufen auf dem Server beim Eingang, auch wenn Kontext zu
  ist; aus einer Mail heraus angelegt, auf Wunsch auch auf vorhandene Mails.
- **Ordner und Unterordner**, verschieben per Menü oder Ziehen, auch zwischen info@ und den
  eigenen Ordnern.
- **Mehrere Mails auf einmal** (Kästchen links an jeder Zeile, Strg-/Shift-Klick, `x`; am Handy
  lange drücken): archivieren, löschen, gelesen, Kategorie, verschieben, Aufgaben erstellen.
- **Am Handy wischen:** eine Mail nach links wischen archiviert, nach rechts gelesen/ungelesen;
  je Richtung einstellbar ([Am Handy](app.md#am-handy)).
- **Spam und Papierkorb leeren:** oben in der Liste der beiden Ordner, nach einer Rückfrage mit
  der Zahl der Mails. Gelöscht ist dann gelöscht – Stalwarts Community-Edition hebt nichts auf.
  Eine Mail, die zugleich in einem anderen Ordner liegt, verlässt nur Spam bzw. Papierkorb. In
  gemeinsamen Postfächern nur, wer dort löschen darf.

  ![Papierkorb mit „Papierkorb leeren“ und der Rückfrage](screenshots/empty-trash.png)

- **Unterhaltungen beim Lesen:** frühere Mails und die Antworten seitdem, Zitate eingeklappt;
  gruppiert wie Gmail auf Wunsch.
- **Wiedervorlage:** eine Mail aus dem Weg bis morgen, Montag oder einem Zeitpunkt – dann ist sie
  wieder oben im Posteingang, ungelesen, auch bei geschlossener App.

## Schreiben

- **Formatierter Text**, Antworten mit Zitat, Anhänge, Empfänger-Vorschläge aus der Firma und den Kontakten,
  Signatur je Absenderadresse.
- **Mehr Formatierung** rechts in der Leiste: Schriftgröße (Klein, Normal, Groß, Sehr groß),
  Textfarbe, Hintergrundfarbe und **Tabellen** – einfügen, dann im Menü Zeilen und Spalten
  hinzufügen oder löschen, Kopfzeile an/aus. Alles geht als Inline-Stil hinaus, so sehen es
  Outlook, Gmail und Apple Mail wie geschrieben; im Textteil steht eine Tabellenzeile je Zeile,
  die Zellen mit Tabulator getrennt. Dieselbe Leiste haben die Signaturen.

  ![Neue Mail mit Tabelle, blauem Text und dem Menü „Hintergrundfarbe“](screenshots/compose-formatting.png)
- **Bilder im Text:** über „Bild einfügen“ in der Leiste, mit Einfügen aus der Zwischenablage
  (etwa ein Bildschirmfoto) oder durch Ziehen in den Text; Fotos (JPEG), PNG, GIF und WebP. An
  den Ecken lässt sich ein Bild größer oder kleiner ziehen, das Seitenverhältnis bleibt. Es geht
  als Inline-Bild hinaus (`cid:`, zusammen mit dem HTML in `multipart/related`), so zeigen es
  Outlook, Gmail und Apple Mail im Text statt als Anhang; ein Entwurf behält seine Bilder.
  Andere Dateien, auch SVG, kommen weiter als Anhang mit. Bilder im zitierten oder
  weitergeleiteten Original nimmt Kontext noch nicht mit.

  ![Neue Mail mit einem Foto im Text, ausgewählt mit den Ecken zum Ziehen](screenshots/compose-image.png)
- **„Anhang vergessen?“** Steht im eigenen Text oder im Betreff „Anhang“, „anbei“, „angehängt“,
  „beigefügt“, „attached“ …, aber nichts ist angehängt, fragt Kontext vor dem Senden nach: „Datei
  anhängen“ oder „Ohne Anhang senden“. Nur der eigene Text zählt: nicht das Zitat, nicht die
  weitergeleitete Mail, nicht die Signatur und nicht ein übernommener Betreff („AW: …“).

  ![Rückfrage „Anhang vergessen?“ beim Senden einer Mail mit „anbei“ ohne Anhang](screenshots/forgotten-attachment.png)

- **Hinweis „Extern“** (schaltet die [Firmenverwaltung](company.md#mitarbeiter-und-postfacher)
  ein): Mails von außerhalb der Firma tragen in der Liste und beim Lesen die Marke „Extern“. Geht
  eine Mail an Empfänger außerhalb, fragt Kontext vor dem Senden einmal nach – „An externe
  Empfänger senden?“ mit diesen Adressen, „Zurück“ oder „Trotzdem senden“. Kommt vorher „Anhang
  vergessen?“, folgt diese Frage danach. Dasselbe gilt für Einladungen im Kalender, die neue
  Teilnehmer von außerhalb bekommen. Intern sind die eigenen Domains der Firma und die
  eingetragenen Partner-Domains, jeweils mit ihren Subdomains.

  ![Rückfrage „An externe Empfänger senden?“ vor einer Antwort an Petra Keller, in der Liste die Marke „Extern“](screenshots/external-hint.png)

- **Pflichtangaben:** Hat die Firmenverwaltung sie eingetragen ([Firmenverwaltung](company.md)),
  stehen sie beim Schreiben grau unter dem Text – zu sehen, aber nicht änderbar. Kontext hängt
  sie erst beim Senden an, ganz unten (auch unter dem Zitat), im HTML- und im Textteil; Entwürfe
  enthalten sie nie, so stehen sie auch nach dem Öffnen eines Entwurfs oder nach „Rückgängig“
  nicht doppelt da.

  ![Neue Mail, darunter grau die Pflichtangaben der Firma](screenshots/legal-footer.png)

- **Senden rückgängig** (5 bis 30 Sekunden) und **später senden** („morgen 8 Uhr“) – der Server
  sendet, auch wenn der Rechner aus ist.
- **Lesebestätigung** anfordern; eine erbetene beantwortet man mit einem Klick, nie von selbst.
- **Vertraulich senden** und **PGP/S/MIME**: siehe [Verschlüsselung](encryption.md).
- **Aus Dokumente anhängen**, Anhänge **in Dokumente ablegen**: siehe [Dokumente](documents.md).

## Abwesenheit und Signaturen

- **Abwesenheitsnotiz** unter *Einstellungen → Abwesenheit*: „Abwesenheitsnotiz einschalten“,
  auf Wunsch mit Zeitraum („Ab“, „Bis“), Betreff und Nachricht. Wer einem schreibt, bekommt einmal
  diese Antwort. Sie kommt vom Mailserver, also auch, wenn Kontext und der Rechner aus sind, und
  sie verträgt sich mit eigenen [Regeln](#ordnen-und-finden).
- **Für Kollegen** (etwa bei Krankheit) trägt die Firmenverwaltung die Abwesenheit ein, mit einer
  Vertretung in der Antwort ([Firmenverwaltung](company.md)).
- **Signatur** unter *Einstellungen → Signatur*: für jede Adresse, von der man sendet (die eigene,
  info@ …), Absendername und Signatur mit Formatierung. Eine neue Mail bekommt die Signatur der
  Absenderadresse, eine Antwort über dem Zitat.
- **Firmen-Signatur:** Legt die Firmenverwaltung eine an und übernimmt sie für alle, ersetzt sie
  die Signaturen aller Mitarbeiter, auch selbst geänderte.

## Sicherheit

- **Warnung vor gefälschten Absendern:** wenn der Absender nicht bestätigt ist, sich jemand von
  außen als die eigene Firma ausgibt oder Antworten an eine andere Adresse gehen (ein Muster bei
  Rechnungsbetrug); „Details anzeigen“ zeigt SPF, DKIM, DMARC und die Spam-Bewertung.
  [Mehr](architecture.md#prufung-des-absenders)
- **Als Spam markieren** (`!`) und „Kein Spam“ – der Filter lernt aus beidem.
- **Bilder aus dem Internet** laden erst auf Wunsch, oder sofort für Absender, denen man vertraut
  (auch alle Kontakte) – aber nur, wenn die Mail wirklich von ihnen kommt.
- **Newsletter abbestellen** mit einem Klick direkt an der Mail.
- Mails werden in einem abgeschotteten Rahmen ohne Skripte angezeigt.

## Weitere Postfächer: Gmail, GMX, WEB.DE & Co.

Unter *Einstellungen → Weitere Postfächer* verbindet jede Person ihre anderen Adressen: Neue Mail
kommt alle zwei Minuten in Kontext, gesendet wird als diese Adresse über den Server des Anbieters
(damit SPF und DMARC stimmen), Antworten gehen von der Adresse, an die die Mail ging.
[Mehr](architecture.md#weitere-postfacher)

## Anhänge, Drucken, Tastatur

- **Vorschau** von Fotos und der ersten PDF-Seite; ein Klick öffnet sie groß.
- **winmail.dat:** Ältere Outlook-Versionen packen ihre Anhänge in eine Datei „winmail.dat“
  (TNEF). Kontext packt sie im Browser aus und zeigt die Dateien darin als normale Anhänge, mit
  Vorschau, Herunterladen und „In Dokumente“. Dafür lädt Kontext sie als Blobs ins Postfach hoch
  (Stalwart räumt nicht verwendete nach einer Weile weg). Eingebettete Outlook-Elemente bleiben
  draußen. Geht das nicht (eine Datei, die Kontext nicht lesen kann, ein Postfach nur zum
  Lesen), bleibt die winmail.dat selbst stehen.

  ![Eine Mail mit winmail.dat: darunter Lieferschein-48211.pdf mit Vorschau und eine Textdatei](screenshots/winmail.png)
- **Drucken** nur der Mail, sauber auf A4 (auch mit Strg+P).
- **Tastaturkürzel wie in Gmail**; `?` zeigt alle.
- **Neben der Mail** (auf breiten Bildschirmen): wer schreibt, mit Firma, nächsten Terminen,
  letzten Mails und „Anrufen“.
