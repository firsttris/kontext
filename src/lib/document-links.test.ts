import { describe, expect, it } from "vitest";
import type { Principal } from "@/jmap/principals";
import {
  channelReaders,
  documentCard,
  documentHref,
  documentLink,
  documentsOfLinks,
  eventReaders,
  taskReaders,
  withDocuments,
} from "./document-links";

const principals: Principal[] = [
  { id: "a", type: "individual", name: "Anna", email: "Anna@weber.test" },
  { id: "j", type: "individual", name: "Jonas", email: "jonas@weber.test" },
  { id: "i", type: "group", name: "info", email: "info@weber.test" },
  { id: "x", type: "individual", name: "Ohne Adresse" },
];

describe("document links", () => {
  it("makes cards and task links of a file", () => {
    const file = { id: "f1", name: "Angebot.docx" };
    expect(documentCard(file)).toMatchObject({
      kind: "document",
      ref: "f1",
      label: "Angebot.docx",
    });
    expect(documentLink(file)).toMatchObject({
      kind: "document",
      ref: "f1",
      label: "Angebot.docx",
    });
  });

  it("keeps an appointment's documents as its links, beside the others", () => {
    const origin = "https://kontext.firma.de";
    const agenda = { id: "f 1", name: "Tagesordnung.docx", href: documentHref(origin, "f 1") };
    expect(agenda.href).toBe("https://kontext.firma.de/documents/edit/f%201");
    const teams = { href: "https://teams.example/agenda", title: "Agenda" };
    const links = withDocuments({ t: teams, "kontext-document-old": { href: "x" } }, [agenda]);
    expect(links).toEqual({
      t: teams,
      "kontext-document-f 1": { "@type": "Link", href: agenda.href, title: "Tagesordnung.docx" },
    });
    expect(documentsOfLinks(links)).toEqual([agenda]);
    expect(withDocuments(null, [])).toBeNull();
  });

  it("knows who reads a channel, a task and an appointment", () => {
    expect(channelReaders({ kind: "team", members: [] }, principals)).toEqual([
      "anna@weber.test",
      "jonas@weber.test",
    ]);
    expect(channelReaders({ kind: "direct", members: ["a", "j"] }, principals)).toEqual([
      "anna@weber.test",
      "jonas@weber.test",
    ]);
    expect(channelReaders({ kind: "mailbox", members: [] }, principals)).toEqual([]);
    expect(taskReaders("j", principals)).toEqual(["jonas@weber.test"]);
    expect(taskReaders(null, principals)).toEqual([]);
    expect(eventReaders(["ANNA@weber.test", "kunde@example.org"], principals)).toEqual([
      "anna@weber.test",
    ]);
  });
});
