import type { Scene } from "./types";

/**
 * The film, scene by scene. A take scene shows a recording of e2e/video.spec.ts; its texts say in
 * a few words what the pictures show, for those who watch without sound.
 */
export const scenes: Scene[] = [
  {
    kind: "title",
    lines: ["Alles, was dein Team von Google kennt.", "Ohne dass Google dein Team kennt.~"],
    seconds: 3.6,
  },
  {
    kind: "chips",
    title: "Eine App. Dein Server.",
    chips: [
      "Mail",
      "Kalender",
      "Kontakte",
      "Aufgaben",
      "Chat",
      "Videocalls",
      "Telefon",
      "Dokumente",
      "Verschlüsselung",
      "KI-Agenten",
      "Firmenverwaltung",
      "Handy",
    ],
    seconds: 3.4,
  },
  {
    kind: "take",
    take: "mail",
    layout: "window",
    kicker: "Mail",
    title: "Ein Posteingang, der mitdenkt",
  },
  {
    kind: "take",
    take: "calendar",
    layout: "window",
    kicker: "Kalender",
    title: "Nie wieder „Passt dir Dienstag?“",
  },
  {
    kind: "take",
    take: "contacts",
    layout: "window",
    kicker: "Kontakte",
    title: "Der Kunde auf einen Blick",
  },
  {
    kind: "take",
    take: "phone",
    layout: "window",
    kicker: "Telefon",
    title: "Du weißt, wer anruft – und worum es geht",
  },
  {
    kind: "take",
    take: "tasks",
    layout: "window",
    kicker: "Aufgaben",
    title: "Aus der Mail wird eine Aufgabe",
  },
  {
    kind: "take",
    take: "chat",
    layout: "duo",
    kicker: "Chat und Video",
    title: "Die WhatsApp-Gruppe fürs Büro – nur deine",
  },
  {
    kind: "take",
    take: "documents",
    layout: "window",
    kicker: "Dokumente",
    title: "Word, Excel und PDF – gleich daneben",
  },
  {
    kind: "take",
    take: "secure-mail",
    layout: "window",
    kicker: "Verschlüsselung",
    title: "Vertraulich senden – an jeden",
  },
  {
    kind: "take",
    take: "secure-chat",
    layout: "panel",
    kicker: "Verschlüsselung",
    title: "Ende-zu-Ende, auch im Chat",
  },
  {
    kind: "take",
    take: "agents",
    layout: "panel",
    kicker: "KI-Agenten (MCP)",
    title: "Dein Assistent kennt deine Kunden",
  },
  {
    kind: "take",
    take: "company",
    layout: "window",
    kicker: "Firmenverwaltung",
    title: "Chefsache in zwei Minuten",
  },
  {
    kind: "take",
    take: "phones",
    layout: "phones",
    kicker: "Am Handy",
    title: "Wie eine App. Ohne App Store.",
  },
  {
    kind: "end",
    title: "Kontext",
    claim: "Open Source · Deine Daten · Kein Preis pro Kopf",
    link: "firsttris.github.io/kontext",
    seconds: 3.6,
  },
];
