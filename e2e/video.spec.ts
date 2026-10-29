import { type Browser, test } from "@playwright/test";
import { recordAgents } from "../video/takes/agents";
import { recordCalendar } from "../video/takes/calendar";
import { recordChat } from "../video/takes/chat";
import { recordCompany } from "../video/takes/company";
import { recordContacts } from "../video/takes/contacts";
import { recordDocuments } from "../video/takes/documents";
import { recordMail } from "../video/takes/mail";
import { recordPhone } from "../video/takes/phone";
import { recordPhones } from "../video/takes/phones";
import { recordSecureChat, recordSecureMail } from "../video/takes/secure";
import { recordTasks } from "../video/takes/tasks";
import { fillDemo } from "./demo-data";

/**
 * The takes of the film on the start page of the docs: `bun run video` records them and renders
 * the film (video/render.ts). Each take drives the real app with the seed of Weber Haustechnik;
 * TAKE=chat records only that one.
 */
type Demo = Awaited<ReturnType<typeof fillDemo>>;

const takes: Record<string, (browser: Browser, demo: Demo) => Promise<void>> = {
  mail: (browser) => recordMail(browser),
  calendar: (browser) => recordCalendar(browser),
  contacts: (browser) => recordContacts(browser),
  phone: (browser) => recordPhone(browser),
  tasks: (browser, demo) => recordTasks(browser, demo.infoBoard),
  chat: (browser, demo) => recordChat(browser, demo.channelId),
  documents: (browser) => recordDocuments(browser),
  "secure-mail": (browser) => recordSecureMail(browser),
  "secure-chat": (browser) => recordSecureChat(browser),
  agents: (browser) => recordAgents(browser),
  company: (browser) => recordCompany(browser),
  phones: (browser) => recordPhones(browser),
};

test.describe
  .serial("Film @video", () => {
    let demo: Demo;
    test.beforeAll(async () => {
      demo = await fillDemo();
    });
    for (const [name, record] of Object.entries(takes)) {
      test(name, async ({ browser }) => {
        test.skip(Boolean(process.env.TAKE) && process.env.TAKE !== name);
        await record(browser, demo);
      });
    }
  });
