import { expect, type Page } from "@playwright/test";
import { DEV_DOMAIN, DEV_PASSWORD } from "../dev/config";
import { createJmapClient } from "../src/jmap/client";

export const STALWART = "http://127.0.0.1:28080";

export const address = (user: string) => `${user}@${DEV_DOMAIN}`;

export const login = async (page: Page, user = "jonas") => {
  await page.goto("/login");
  await page.getByLabel("E-Mail-Adresse").fill(address(user));
  await page.getByLabel("Passwort").fill(DEV_PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/mail\//);
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
export const inboxSubjects = async (user: string): Promise<string[]> => {
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
        properties: ["subject"],
      },
      "g",
    ],
  ]);
  return (get![1].list as { subject: string }[]).map((email) => email.subject);
};

export const unique = (text: string) => `${text} ${Date.now().toString(36)}`;
