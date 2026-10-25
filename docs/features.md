# Funktionen

Alles, was Kontext kann, nach Bereichen. Einen Überblick gibt die [Startseite](index.md), die
Einrichtung die [Installation](installation.md).

## ✉️ Mail

- **Gemeinsame Postfächer**: info@ & Co. stehen bei jedem Mitglied in der Seitenleiste; eine Mail daraus sagt „Gemeinsames Postfach info@…“. Antworten gehen als info@ raus, mit dem Namen der Person, die geantwortet hat. Postfächer nur zum Lesen zeigen nur, was erlaubt ist.
- **Alle Posteingänge in einer Liste**: eigene Mails und die aus info@ & Co. zusammen.
- **Vertraulich senden** an alle: Wer einen Schlüssel hat, bekommt PGP, alle anderen einen Link auf deinen eigenen Server und einen Code, den du am Telefon weitergibst – lesen, Anhänge laden und antworten geht dort.
- **Weitere Postfächer**: Gmail, GMX, WEB.DE & Co. behalten – neue Mails kommen alle zwei Minuten herein, gesendet wird als diese Adresse über ihren eigenen Server, Antworten gehen automatisch von der Adresse, an die die Mail ging.
- **Verschlüsselung**: dein eigener OpenPGP-Schlüssel, sicher verwahrt; verschlüsselt und unterschrieben senden, verschlüsselte Mails lesen und Unterschriften prüfen – direkt im Browser; Schlüssel anderer aus ihren Mails (Autocrypt), per WKD oder von keys.openpgp.org. Mehr im [Konzept](encryption.md).
- **Lesebestätigung**: beim Senden anfordern, auf Nachfrage mit einem Klick bestätigen – nie von selbst.
- **Newsletter abbestellen** mit einem Klick, direkt an der Mail.
- **Bilder aus dem Internet** nur auf Wunsch – oder gleich bei Absendern, denen du vertraust (auch deinen Kontakten), wenn die Mail wirklich von ihnen kommt.
- **Kategorien**: farbige Markierungen wie „In Bearbeitung“, „Wartet auf Antwort“, „Erledigt“ – mehrere je Mail, eigene anlegbar, per Regel automatisch. In info@ & Co. sieht das ganze Team sie: ein kleines Aufgabenbrett.
- **Regeln**: „Wenn Absender, Empfänger, Betreff oder Text … dann in Ordner verschieben, markieren, Kategorie setzen, weiterleiten“ – laufen auf dem Server beim Eingang, auch wenn Kontext geschlossen ist; aus einer Mail heraus anlegbar und auf Wunsch auf den Posteingang anwendbar. Für gemeinsame Postfächer pflegt sie der Chef.
- **Mehrere Mails auf einmal**: auswählen (auch per Shift-Klick oder `x`) und gemeinsam archivieren, löschen, als gelesen markieren, kategorisieren oder verschieben.
- **Schutz vor gefälschten Mails**: eine Warnung über der Mail, wenn der Absender nicht bestätigt ist, sich jemand von außen als die eigene Firma ausgibt oder Antworten an eine fremde Adresse gehen; „Details anzeigen“ zeigt die Prüfung (SPF, DKIM, DMARC, Spam-Bewertung).
- **Als Spam markieren**: ein Klick (oder `!`), „Kein Spam“ holt sie zurück – der Spamfilter lernt aus beidem.
- **Ordner und Unterordner**: Mails per Menü oder mit der Maus verschieben, auch zwischen info@ und den eigenen Ordnern; Archiv und Papierkorb mit einem Klick.
- **Schreiben mit Formatierung**, Antworten mit Zitat, Anhänge, Vorschläge aus den Kontakten.
- **Wer schreibt mir da?** Auf breiten Bildschirmen steht neben der Mail der Absender mit Firma, nächsten Terminen und letzten Mails.
- **Anhänge mit Vorschau**: Fotos und die erste Seite eines PDFs als kleines Bild.
- **Suche wie in Gmail**: über alle Ordner und Postfächer, mit `von:`, `an:`, `betreff:`, `hat:anhang`, `kategorie:`, `in:info@`, `nach:`/`vor:`; „Angebote“ findet auch „Angebot“.
- **Unterhaltungen ohne Durcheinander**: Die Liste bleibt, wie die Mails hereinkommen; beim Lesen stehen die früheren Mails der Unterhaltung und die Antworten seitdem dabei, Zitate eingeklappt. In gemeinsamen Postfächern siehst du, wer schon geantwortet hat („Jonas · 14:02“). Gruppieren wie bei Gmail ist ein Schalter.
- **Senden rückgängig und später senden**: ein paar Sekunden, um eine Mail zurückzuholen; „morgen 8 Uhr“ oder ein Zeitpunkt nach Wahl, und der Server schickt sie dann – auch wenn dein Rechner aus ist.
- **Wiedervorlage**: eine Mail bis morgen, Montag oder einen Zeitpunkt nach Wahl aus dem Weg; dann liegt sie wieder oben im Posteingang, ungelesen – auch bei geschlossenem Kontext, und in info@ für das ganze Team sichtbar.
- **Textbausteine**: Standardantworten mit zwei Klicks, eigene und gemeinsame für info@ & Co.; `{Name}` wird zum Empfänger.
- **Drucken**: die Mail allein, sauber auf A4 (auch per Strg+P).
- **Sofort aktuell**: neue Mails und Änderungen von Kollegen erscheinen ohne Neuladen (JMAP Push).

## ✅ Aufgaben

- **Aufgaben für dich und das Team**: Meine Aufgaben, Heute, Demnächst, Erledigt; ein Board fürs eigene Postfach und eins pro gemeinsamem Postfach (info@, rechnung@).
- **Liste oder Kanban**: nach Fälligkeit gruppiert, oder als Board mit Offen, In Arbeit, Wartet, Erledigt – Karten zwischen den Spalten ziehen.
- **Aus einer Mail**: „Aufgabe“ (oder `t`) macht aus einer Mail eine Aufgabe mit Betreff, Fälligkeit und Zuständigem; die Mail zeigt danach ihre Aufgabe.
- **In Thunderbird und auf dem Handy**: deine Boards als Aufgabenlisten über CalDAV (Thunderbird, DAVx⁵ mit tasks.org, Apple Erinnerungen), in beide Richtungen.
- **Aufgaben aus Regeln**: Eine Mail-Regel macht aus jeder passenden Mail eine Aufgabe, auch wenn Kontext geschlossen ist.
- **Eigene Spalten** pro Board („Material bestellt“ …) und **wiederkehrende Aufgaben** (täglich, an Werktagen, wöchentlich, monatlich, jährlich).
- **Schnelleingabe**: „Rückruf Hoffmann morgen“ ist morgen fällig; Checkliste, Notiz, Zuständige.
- **Überall in Kontext**: Der Kontakt zeigt seine offenen Aufgaben, der Kalender das Fällige am Tag, die Glocke neu Zugewiesenes und heute Fälliges. Erinnerungen kommen als Benachrichtigung, auch bei geschlossener App. „Aufgaben erstellen“ macht aus mehreren ausgewählten Mails je eine Aufgabe.
- **Live**: Neue oder verschobene Aufgaben von Kollegen erscheinen sofort.

## 💬 Team-Chat

- **Kanäle**: #allgemein für alle, einer pro gemeinsamem Postfach (info@, rechnung@) für alle, die darin arbeiten, und eigene wie #baustelle-hoffmann mit ausgewählten Mitgliedern.
- **Direktnachrichten** an eine Kollegin oder ein paar Kollegen, mit „Gelesen“.
- **Live**: Nachrichten, „Sandra schreibt …“ und wer online ist, ohne Neuladen; Ungelesenes am Chat und am App-Symbol.
- **@Erwähnungen** mit Vorschlägen beim Tippen; eine Erwähnung oder Direktnachricht kommt aufs Handy, auch wenn Kontext geschlossen ist.
- **Fotos und Dateien**: mit der Handykamera, per Ziehen oder Einfügen; Fotos werden vor dem Senden verkleinert.
- **Mails, Aufgaben und Kontakte als Karten**: „Besprechen“ an einer Mail (`b`) spricht im Kanal darüber, statt sie intern weiterzuleiten; die Mail zeigt danach, wo sie besprochen wurde. Öffnen kann die Karte nur, wer das Postfach sehen darf – kopiert wird nichts.
- **Antworten im Thread und Reaktionen**: auf eine Nachricht antworten, ohne den Kanal vollzuschreiben; 👍 ✅ 🎉 statt noch einem „Ok“.
- **Mail als Kopie teilen**, mit Anhängen, für Kolleginnen ohne Zugriff auf das Postfach.
- **Aufgabe aus einer Nachricht**, in beide Richtungen verknüpft.
- **Anrufe und Videoanrufe** direkt aus der Unterhaltung: eine Kollegin anrufen oder im Kanal eine Besprechung starten, der die anderen beitreten; stummschalten, Kamera, Bildschirm teilen, und das Gespräch bleibt offen, während du zur Mail wechselst; verpasste Anrufe und die Dauer stehen im Verlauf. Läuft auf dem eigenen Server ([LiveKit](https://github.com/livekit/livekit), optional).
- **Telefonieren in Kontext**: Eine kleine Telefonbox im Büro meldet sich als IP-Telefon an der Fritzbox an. Anrufe klingeln in Kontext mit dem Wichtigsten zum Anrufer (Kontakt, Firma, letzte Mail, nächster Termin), du nimmst im Browser oder am Tischtelefon ab, rufst aus jedem Kontakt an, und verpasste Anrufe stehen mit Notiz und „Zurückrufen“ in einer Liste.
  - Ein verpasster Anruf legt die Aufgabe „Zurückrufen“ auf dem gewählten Board an; sie erledigt sich, sobald jemand mit der Nummer gesprochen hat.
  - **Mailbox**: Nimmt niemand ab, spielt die Box eure Ansage (im Browser gesprochen oder hochgeladen) und nimmt eine Nachricht auf; sie kommt als Mail mit der Aufnahme an und lässt sich beim Anruf anhören.
  - **Öffnungszeiten** mit Mittagspause, geschlossenen Tagen und den Feiertagen auf einen Klick: Außerhalb klingelt nichts, Anrufer hören eure Ansage und können eine Nachricht hinterlassen. Die Box entscheidet selbst, auch wenn Kontext gerade nicht erreichbar ist.
  - **Weitervermitteln** an Kolleginnen (es klingelt bei ihnen, du gehst, sobald sie dran sind) oder an jede Nummer und an Telefone der Fritzbox (`**610`): Die Box wählt sie zum Gespräch dazu, und du übergibst, sobald abgenommen ist.
  - **Halten, Rückfrage, Dreierkonferenz**: Wartemusik für den Anrufer, erst die Kollegin dazuholen, den Anrufer zurückholen und zu dritt sprechen – oder die beiden allein lassen.
  - **Wer klingelt wann**: alle gleichzeitig oder der Reihe nach (dann alle), und nach einer Weile auch ein Handy.
  - **Durchwahlen**: weitere Nummern des Anschlusses, die jeweils bei ihren Leuten klingeln; wer auf einer ist, ruft auch mit ihr an.
  - **Snom-Tischtelefone** melden sich an der Box an und richten sich von dort selbst ein: Sie klingeln mit Kontext, erreichen sich per Kurzwahl, und Anrufe lassen sich dorthin weitervermitteln.
  - **Präsenz**: „telefoniert“ neben den Kolleginnen im Chat; *Bitte nicht stören* oder *Abwesend bis …*, dann klingelt es bei den anderen (und das eigene Tischtelefon bleibt still).
  - **Sprachmenü**: „Für den Kundendienst drücken Sie die 1 …“ – jede Taste klingelt bei ihren Leuten oder führt auf die Mailbox.
  - **Sperrliste**: „Sperren“ in der Anrufliste, oder gleich alle unterdrückten Nummern; die Box weist sie ab, bevor etwas klingelt.
  - **Auswertung**: Anrufe der letzten 30 Tage, wie schnell angenommen wurde, wann Anrufe verpasst wurden (Wochentag × Uhrzeit) und wer angenommen hat.
  - **Türsprechstelle** der Fritzbox: Es klingelt in Kontext, Tür öffnen oder sprechen mit einem Klick.
  - **Fax als PDF-Mail**: Eine Nummer des Anschlusses nimmt Faxe an; jedes kommt als PDF ins gewählte Postfach.
  - **Gespräche aufnehmen** (wenn die Firma es erlaubt): Die Box spielt vorher eine Ansage, die Aufnahme steht beim Anruf.
- **Suche** über alle deine Kanäle; eigene Nachrichten bearbeiten oder löschen; Kanäle stummschalten, verlassen oder löschen.
- **Aufbewahrung**, die die Firmenverwaltung festlegt (30 Tage bis 5 Jahre oder unbegrenzt): Ältere Nachrichten, Fotos und Dateien löscht Kontext von selbst.
- **Am Handy**: ein eigener Tab, Unterhaltungen als Sprechblasen.

## 📄 Dokumente

- **Word, Excel, PowerPoint und PDF** im Fenster von Kontext, mit [Schreibzeug](https://github.com/firsttris/schreibzeug) als Modul „Dokumente“ (optional, ein eigener Dienst): keine zweite Anmeldung, hell oder dunkel wie Kontext, ein offenes Dokument bleibt offen, während du eine Mail beantwortest.
- **Dateien, wo sie hingehören**: ein Dokument im Chat teilen, mit einer Aufgabe oder einem Kontakt verknüpfen oder an einen Termin hängen; wer dort dabei ist, darf es öffnen.
- **Ein Ordner pro gemeinsamem Postfach**: info@ und rechnung@ haben eigene Dokumente, offen für alle, die im Postfach arbeiten, und immer so, wie die Firmenverwaltung es festlegt; ein Anhang aus info@ landet zuerst dort.
- **Anhänge in Dokumente**: den Anhang einer Mail in einen Ordner ablegen oder gleich dort öffnen; beim Schreiben **aus Dokumente anhängen**. Die Dateien gehen von Server zu Server, mit den Rechten der jeweiligen Person.

## 📅 Kalender

- **Tag, Woche, Monat und Liste**, Termine mit der Maus verschieben, wiederkehrende Termine mit Ausnahmen.
- **Videobesprechung am Termin**: ein Klick legt einen Link an; Kunden treten im Browser bei, ohne Konto – sobald jemand aus deiner Firma da ist.
- **Kalender teilen** mit Kollegen – nur die Verfügbarkeit, zum Lesen oder Bearbeiten; **Einladungen** mit Zusage und Absage.
- **Wer hat Zeit?** Beim Einladen zeigt Kontext, wer zu der Zeit belegt ist, und schlägt die nächsten Zeiten vor, in denen alle frei sind – wie Outlooks Terminplanungs-Assistent. In der Firma sieht jeder, wann Kollegen belegt sind (ohne Titel); jeder kann das pro Kalender abschalten.
- **Am Handy**: Tagesansicht mit Wochenleiste, Monat und Liste.

## 👥 Kontakte

- **Kunde auf einen Blick**: letzte Mails und nächste Termine mit diesem Kontakt.
- **Gruppen** wie „Lieferanten“, an die man mit einer Mail schreibt; **vCard-Import und -Export**.
- **Adressbücher teilen** mit Kollegen – zum Lesen oder Bearbeiten.

## ⚙️ Einstellungen

- **Signatur pro Absender**, **Abwesenheitsnotiz** mit Zeitraum, **Anmeldung mit Code** (Authenticator-App).
- **Hell oder dunkel**, **Tastaturkürzel** wie in Gmail (`?` zeigt alle).
- **Als App auf jedem Gerät**: Kontext aus dem Browser installieren (PC, Android, iPhone) – eigenes Fenster und Symbol, Ungelesen-Zahl am Symbol, startet auch ohne Netz; Fotos und Dateien aus anderen Apps direkt in eine neue Mail teilen; `mailto:`-Links öffnen Kontext. Neue Versionen kommen zuverlässig an und laden auf Klick auf „Neu laden“.
- **Benachrichtigungen**: Glocke mit Einladungen, heutigen Terminen und neuen Mails; auf deinen Geräten auch bei geschlossener App (Web Push, Ende-zu-Ende verschlüsselt): neue Mails, Direktnachrichten, @Erwähnungen und eingehende Anrufe.
- **Speicherplatz im Blick**: ein feiner Ring um das eigene Bild zeigt, wie voll das Postfach ist.
- **KI-Agenten (MCP)**: Kontext in Claude als Connector eintragen und im Browser anmelden (OAuth) oder einem Agenten einen Zugangsschlüssel geben – er schlägt Kunden, letzte Mails, Termine und Aufgaben über alle Postfächer nach, mit deinen Rechten; wenn du es erlaubst, schreibt er auch Entwürfe und legt Termine, Kontakte und Aufgaben an. Er sendet und löscht nie selbst: Antworten warten in den Entwürfen auf dich. Jede Änderung wird protokolliert, jede Verbindung lässt sich trennen.

## 🏢 Firmenverwaltung

- **Mitarbeiter anlegen**, Passwort und zweiten Faktor zurücksetzen, **Zugang sperren**.
- **Gemeinsame Postfächer** mit Rechten pro Person: kein Zugriff, nur lesen, oder lesen und senden; weitere Adressen wie buchhaltung@.
- **Abwesenheit eintragen** mit Vertretung, **Firmen-Signatur** für alle.
- **Austritt**: Zugang sperren, Postfach übergeben, weiterleiten, automatisch antworten – gelöscht wird nichts.
- **Umzug** von Microsoft 365, Gmail, GMX, WEB.DE & Co. (mit Ordnern und Kategorien, danach laufender Abgleich), aus Outlook (PST) und dem Google-Export.


## 🧩 Module

Kontext bleibt im Kern schlank: Mail, Kalender, Kontakte und die Firmenverwaltung. Dazu kommen
Module, die ein Betrieb einschaltet, wenn er sie braucht – wer sie nicht braucht, sieht sie nicht.

| Modul | Stand |
| --- | --- |
| Mail, Kalender, Kontakte, Firmenverwaltung | ✅ verfügbar |
| Aufgaben und Kanban-Board | ✅ verfügbar |
| Team-Chat | ✅ verfügbar |
| Anrufe und Videobesprechungen im Chat | ✅ verfügbar |
| Telefonie über die Fritzbox (Telefonbox) | 🧪 im Test |
| Dokumente (Schreibzeug) | ✅ verfügbar |

Was als Nächstes kommt, steht in der [Roadmap](https://github.com/firsttris/kontext/blob/main/ROADMAP.md).

