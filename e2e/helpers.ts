import { type Cookie, expect, type Locator, type Page } from "@playwright/test";
import { DEV_DOMAIN, DEV_PASSWORD } from "../dev/config";
import { assertSetOk, createJmapClient } from "../src/jmap/client";
import { createContact, deleteContact, listAddressBooks } from "../src/jmap/contacts";
import { applyDeputyPatches, loadDeputyObjects } from "../src/jmap/deputy";
import { listPrincipals } from "../src/jmap/principals";
import { revokePatches } from "../src/lib/deputy";

export const STALWART = "http://127.0.0.1:28080";

export const address = (user: string) => `${user}@${DEV_DOMAIN}`;

/**
 * The session cookies of each person's last sign-in in this test worker: the next test of theirs
 * starts with them instead of the sign-in form (it takes a few seconds, and nearly every test signs
 * in). A session that has ended since (signed out, locked, new password) leads to the form again.
 */
const sessions = new Map<string, Cookie[]>();

// In German or English: the film signs in with an English browser too (video/language.ts).
const signInWithForm = async (page: Page, user: string) => {
  await page.goto("/login");
  await page.getByLabel(/^(E-Mail-Adresse|Email address)$/).fill(address(user));
  await page.getByLabel(/^(Passwort|Password)$/).fill(DEV_PASSWORD);
  await page.getByRole("button", { name: /^(Anmelden|Sign in)$/ }).click();
  await expect(page).toHaveURL(/\/mail\//);
  sessions.set(user, await page.context().cookies());
};

/**
 * Whether the kept session still holds, asked of the server rather than read from where the app
 * lands: /jmap/session answers only while the Kontext session and the Stalwart sign-in behind it
 * are both valid (a new password ends the latter). Waiting for the app to bounce to /login raced
 * its own redirect: the URL could still show /mail when the bounce came, or a goto("/login") of
 * ours could abort the app's (net::ERR_ABORTED).
 */
const signedInWithKept = async (page: Page, user: string) => {
  const kept = sessions.get(user);
  if (!kept) return false;
  await page.context().addCookies(kept);
  if ((await page.context().request.get("/jmap/session")).ok()) {
    await page.goto("/mail");
    await expect(page).toHaveURL(/\/mail\//);
    return true;
  }
  sessions.delete(user);
  await page.context().clearCookies();
  return false;
};

/**
 * The tour of the first start counts as seen on this browser (src/features/tour/seen.ts), for every
 * page of the test: it would cover the app in every test not about it. Added to what is there, so
 * two people signed in side by side both have it.
 */
const skipTour = (page: Page, user: string) =>
  page.context().addInitScript((who) => {
    const key = "kontext.tour.seen";
    try {
      const seen = JSON.parse(window.localStorage.getItem(key) ?? "[]");
      const list = Array.isArray(seen) ? seen : [];
      if (!list.includes(who)) window.localStorage.setItem(key, JSON.stringify([...list, who]));
    } catch {
      window.localStorage.setItem(key, JSON.stringify([who]));
    }
  }, address(user));

/**
 * The cards above the mail list that offer installing and notifications stay away unless a test
 * is about them (`offers`): they would push the list down in every other test. So does the tour
 * of the first start, unless a test is about it (`tour`).
 */
export const login = async (page: Page, user = "jonas", { offers = false, tour = false } = {}) => {
  if (!tour) await skipTour(page, user);
  if (!offers) {
    await page.addInitScript(() => {
      for (const kind of ["install", "push"]) {
        const key = `kontext.notifications.offer.${kind}`;
        window.localStorage.setItem(key, JSON.stringify({ times: 2, at: 0 }));
      }
    });
  }
  if (!(await signedInWithKept(page, user))) await signInWithForm(page, user);
  // Mails go out at once in the tests; "Rückgängig" has its own (e2e/send-later.spec.ts).
  await page.evaluate(() => window.localStorage.setItem("kontext.mail.undo", "0"));
};

/** A JMAP client for checks behind the UI's back, e.g. whether a mail arrived. */
export const jmapAs = (user: string) =>
  createJmapClient({
    origin: STALWART,
    credentials: { username: address(user), password: DEV_PASSWORD },
  });

export const personalAccountId = async (user: string) => {
  const session = await jmapAs(user).getSession();
  return Object.entries(session.accounts).find(([, a]) => a.name === address(user))![0];
};

/** Subjects of the mails in a user's inbox. */
export const inboxSubjects = async (user: string): Promise<string[]> =>
  (await inboxMails(user)).map((email) => email.subject);

/** Subject and sender of the mails in a user's inbox. */
export const inboxMails = async (
  user: string,
): Promise<{ subject: string; from: string; fromName: string }[]> => {
  const client = jmapAs(user);
  const accountId = await personalAccountId(user);
  const { list } = await client.call<{ list: { id: string; role: string | null }[] }>(
    "Mailbox/get",
    {
      accountId,
      properties: ["role"],
    },
  );
  const inbox = list.find((mailbox) => mailbox.role === "inbox")!;
  const [, get] = await client.request([
    ["Email/query", { accountId, filter: { inMailbox: inbox.id } }, "q"],
    [
      "Email/get",
      {
        accountId,
        "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
        properties: ["subject", "from"],
      },
      "g",
    ],
  ]);
  return (
    get![1].list as { subject: string; from: { email: string; name: string | null }[] }[]
  ).map((email) => ({
    subject: email.subject,
    from: email.from[0]?.email ?? "",
    fromName: email.from[0]?.name ?? "",
  }));
};

export const unique = (text: string) => `${text} ${Date.now().toString(36)}`;

/** Types addresses into an appointment's attendee field and turns them into chips. */
export const addAttendees = async (dialog: Locator, addresses: string) => {
  const field = dialog.getByRole("combobox", { name: "Teilnehmer" });
  await field.fill(addresses);
  await field.press("Enter");
};

/**
 * Puts a read mail straight into the inbox of a mailbox the user can open (their own or a shared
 * one like info@), for tests that move it and must not touch the seed's mails.
 */
export const addMail = async (
  user: string,
  mailbox: string,
  subject: string,
  from = { name: "Erika Test", email: "erika@example.test" },
) => {
  const client = jmapAs(user);
  const session = await client.getSession();
  const accountId = Object.entries(session.accounts).find(
    ([, a]) => a.name === address(mailbox),
  )![0];
  const { list } = await client.call<{ list: { id: string; role: string | null }[] }>(
    "Mailbox/get",
    { accountId, properties: ["role"] },
  );
  const inbox = list.find((box) => box.role === "inbox")!.id;
  const result = await client.call("Email/set", {
    accountId,
    create: {
      m: {
        mailboxIds: { [inbox]: true },
        keywords: { $seen: true },
        from: [from],
        to: [{ name: null, email: address(mailbox) }],
        subject,
        receivedAt: new Date().toISOString(),
        bodyValues: { b: { value: "Eine Mail nur für diesen Test." } },
        textBody: [{ partId: "b", type: "text/plain" }],
      },
    },
  });
  assertSetOk(result, "Email/set");
};

/**
 * The keyboard of Chrome on Android (Chromium in tests can't show one): with
 * `interactive-widget=resizes-content` it makes the page shorter by its height.
 */
export const showKeyboard = async (page: Page, height: number) => {
  const screen = page.viewportSize()!;
  await page.setViewportSize({ width: screen.width, height: screen.height - height });
  return screen.height - height;
};

/**
 * Holds a finger on an element as long as a long press takes (`use-long-press.ts`), then lifts
 * it. Playwright's touchscreen only taps, so the pointer events are sent as a finger's.
 */
export const longPress = async (target: Locator) => {
  // Held on to: the sheet the press opens hides the rest from the accessibility tree, so the
  // locator would no longer find the element to lift the finger from.
  const element = (await target.elementHandle())!;
  const box = (await element.boundingBox())!;
  const finger = {
    pointerType: "touch",
    isPrimary: true,
    bubbles: true,
    clientX: box.x + Math.min(20, box.width / 2),
    clientY: box.y + Math.min(12, box.height / 2),
  };
  await element.dispatchEvent("pointerdown", finger);
  await target.page().waitForTimeout(550);
  await element.dispatchEvent("pointerup", finger);
  await element.dispose();
};

/** Saves a snippet in Einstellungen → Meine Textbausteine, as one would. */
export const addSnippet = async (page: Page, title: string, body: string) => {
  await page.goto("/settings?section=snippets");
  const mine = page
    .getByRole("region")
    .filter({ has: page.getByRole("heading", { name: "Meine Textbausteine" }) });
  await mine.getByRole("button", { name: "Neuer Textbaustein" }).click();
  await mine.getByLabel("Titel").fill(title);
  await mine.getByLabel("Text").fill(body);
  await mine.getByRole("button", { name: "Speichern" }).click();
  await expect(mine.getByRole("list")).toContainText(title);
};

/** Deletes the snippets with this title through the server, so no run leaves one behind. */
export const removeSnippet = async (page: Page, title: string) => {
  const { snippets } = (await (await page.request.get("/api/snippets")).json()) as {
    snippets: { id: string; title: string }[];
  };
  for (const snippet of snippets.filter((one) => one.title === title))
    await page.request.delete(`/api/snippets/${encodeURIComponent(snippet.id)}`);
};

/**
 * Takes back all of `deputy`'s access to `owner`'s mailbox, calendars and contacts the way
 * "Alles entziehen" does, for clean-up after a test that shares them.
 */
export const revokeDeputy = async (owner: string, deputy: string) => {
  const client = jmapAs(owner);
  const accountId = await personalAccountId(owner);
  const people = (await listPrincipals(client, accountId)).filter((p) => p.type === "individual");
  const deputyId = people.find((p) => p.email === address(deputy))!.id;
  const objects = await loadDeputyObjects(client, accountId);
  const others = people.filter((p) => p.email !== address(owner)).map((p) => p.id);
  await applyDeputyPatches(client, accountId, revokePatches(objects, deputyId, others));
};

/**
 * Hinweis „Extern“ switched on for this page only: the app's read of the setting is answered here
 * (the server's own domains and partners kept unless `change` names others). Switching it on at
 * the server would reach the tests running beside this one, which send to outside addresses.
 */
export const externalHintOn = (
  page: Page,
  change: { partners?: string[]; domains?: string[] } = {},
) =>
  page.route("**/api/company/external-hint", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const real = (await (await route.fetch()).json()) as { partners: string[]; domains: string[] };
    await route.fulfill({ json: { ...real, ...change, enabled: true } });
  });

/** A day (Berlin) some days from today. */
export const dayFromToday = (days: number) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(
    new Date(Date.now() + days * 86_400_000),
  );

/**
 * A card with a birthday on `day` in Jonas' address book, behind the UI's back; `age` is what the
 * person turns this year, without it the card knows only the day (calendar-birthdays.spec.ts, the
 * screenshot). Gives back the name and how to remove the card.
 */
export const addBirthday = async (
  given: string,
  day: string,
  age?: number,
  surname = `Geburtstag ${Date.now().toString(36)}`,
) => {
  const client = jmapAs("jonas");
  const accountId = await personalAccountId("jonas");
  const book = (await listAddressBooks(client, accountId)).find((b) => b.isDefault)!;
  const [year, month, date] = day.split("-").map(Number);
  const id = await createContact(client, accountId, book.id, {
    name: {
      components: [
        { kind: "given", value: given },
        { kind: "surname", value: surname },
      ],
      isOrdered: true,
    },
    anniversaries: {
      b: {
        "@type": "Anniversary",
        kind: "birth",
        date: {
          "@type": "PartialDate",
          ...(age ? { year: year! - age } : {}),
          month,
          day: date,
        },
      },
    },
  });
  return { name: `${given} ${surname}`, remove: () => deleteContact(client, accountId, id) };
};
