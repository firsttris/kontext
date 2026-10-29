import { say } from "./language";
import type { Scene } from "./types";

/**
 * The film, scene by scene. A take scene shows a recording of e2e/video.spec.ts; its texts say in
 * a few words what the pictures show, for those who watch without sound; in the film's language
 * (video/language.ts).
 */
export const scenes: Scene[] = [
  {
    kind: "title",
    lines: [
      say("Fühlt sich vertraut an.", "Feels familiar."),
      say("Gehört dir.~", "Belongs to you.~"),
    ],
    seconds: 3.6,
  },
  {
    kind: "chips",
    title: say("Eine App. Dein Server.", "One app. Your server."),
    chips: [
      { icon: "mail", label: say("Mail", "Mail") },
      { icon: "calendar", label: say("Kalender", "Calendar") },
      { icon: "contacts", label: say("Kontakte", "Contacts") },
      { icon: "tasks", label: say("Aufgaben", "Tasks") },
      { icon: "chat", label: say("Chat", "Chat") },
      { icon: "video", label: say("Videocalls", "Video calls") },
      { icon: "phone", label: say("Telefon", "Phone") },
      { icon: "documents", label: say("Dokumente", "Documents") },
      { icon: "encryption", label: say("Verschlüsselung", "Encryption") },
      { icon: "agents", label: say("KI-Agenten", "AI agents") },
      { icon: "company", label: say("Firmenverwaltung", "Company admin") },
      { icon: "mobile", label: say("Handy", "Mobile") },
    ],
    seconds: 3.4,
  },
  {
    kind: "take",
    take: "mail",
    layout: "window",
    kicker: say("Mail", "Mail"),
    title: say("Ein Posteingang, der mitdenkt", "An inbox that thinks along"),
  },
  {
    kind: "take",
    take: "calendar",
    layout: "window",
    kicker: say("Kalender", "Calendar"),
    title: say("Nie wieder „Passt dir Dienstag?“", "No more “Does Tuesday work?”"),
  },
  {
    kind: "take",
    take: "contacts",
    layout: "window",
    kicker: say("Kontakte", "Contacts"),
    title: say("Der Kunde auf einen Blick", "The customer at a glance"),
  },
  {
    kind: "take",
    take: "phone",
    layout: "window",
    kicker: say("Telefon", "Phone"),
    title: say("Du weißt, wer anruft – und worum es geht", "You know who’s calling – and why"),
  },
  {
    kind: "take",
    take: "tasks",
    layout: "window",
    kicker: say("Aufgaben", "Tasks"),
    title: say("Aus der Mail wird eine Aufgabe", "The email becomes a task"),
  },
  {
    kind: "take",
    take: "chat",
    layout: "duo",
    kicker: say("Chat und Video", "Chat and video"),
    title: say(
      "Die WhatsApp-Gruppe fürs Büro – nur deine",
      "The office WhatsApp group – but yours",
    ),
  },
  {
    kind: "take",
    take: "documents",
    layout: "window",
    kicker: say("Dokumente", "Documents"),
    title: say("Word, Excel und PDF – gleich daneben", "Word, Excel and PDF – right alongside"),
  },
  {
    kind: "take",
    take: "secure-mail",
    layout: "window",
    kicker: say("Verschlüsselung", "Encryption"),
    title: say("Vertraulich senden – an jeden", "Send confidentially – to anyone"),
  },
  {
    kind: "take",
    take: "secure-chat",
    layout: "panel",
    kicker: say("Verschlüsselung", "Encryption"),
    title: say("Ende-zu-Ende, auch im Chat", "End-to-end, in chat too"),
  },
  {
    kind: "take",
    take: "agents",
    layout: "panel",
    kicker: say("KI-Agenten (MCP)", "AI agents (MCP)"),
    title: say("Dein Assistent kennt deine Kunden", "Your assistant knows your customers"),
  },
  {
    kind: "take",
    take: "company",
    layout: "window",
    kicker: say("Firmenverwaltung", "Company admin"),
    title: say("Chefsache in zwei Minuten", "The boss’s job in two minutes"),
  },
  {
    kind: "take",
    take: "phones",
    layout: "phones",
    kicker: say("Am Handy", "On mobile"),
    title: say("Wie eine App. Ohne App Store.", "Like an app. No app store."),
  },
  {
    kind: "end",
    title: "Kontext",
    claim: say(
      "Open Source · Deine Daten · Kein Preis pro Kopf",
      "Open source · Your data · No per-seat pricing",
    ),
    link: "firsttris.github.io/kontext",
    seconds: 3.6,
  },
];

/**
 * The short loop in the READMEs (docs/assets/kontext-teaser.*.webp): parts of scenes, each from a
 * time after the scene's start, cut from the rendered film.
 */
export const teaser: { scene: string; from: number; seconds: number }[] = [
  { scene: "chips", from: 0.3, seconds: 3 },
  { scene: "mail", from: 1.5, seconds: 4 },
  { scene: "chat", from: 7.5, seconds: 5.5 },
  { scene: "documents", from: 7, seconds: 3 },
  { scene: "agents", from: 3, seconds: 5.5 },
];
