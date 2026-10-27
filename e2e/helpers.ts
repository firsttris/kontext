import { type Cookie, expect, type Page } from "@playwright/test";
import { DEV_DOMAIN, DEV_PASSWORD } from "../dev/config";
import { assertSetOk, createJmapClient } from "../src/jmap/client";

export const STALWART = "http://127.0.0.1:28080";

export const address = (user: string) => `${user}@${DEV_DOMAIN}`;

/**
 * The session cookies of each person's last sign-in in this test worker: the next test of theirs
 * starts with them instead of the sign-in form (it takes a few seconds, and nearly every test signs
 * in). A session that has ended since (signed out, locked, new password) leads to the form again.
 */
const sessions = new Map<string, Cookie[]>();

const signInWithForm = async (page: Page, user: string) => {
  await page.goto("/login");
  await page.getByLabel("E-Mail-Adresse").fill(address(user));
  await page.getByLabel("Passwort").fill(DEV_PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
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

export const login = async (page: Page, user = "jonas") => {
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
