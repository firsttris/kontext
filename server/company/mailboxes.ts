/**
 * Shared mailboxes: Stalwart groups. Members (in the user's `memberGroupIds`) read, answer and
 * send as the address; readers get every folder shared with `READ_ONLY` instead.
 */
import { Hono } from "hono";
import { z } from "zod";
import { ruleSchema } from "../rules/script";
import { aliasesValue, membershipPatches, parseAddress, type Result } from "./accounts";
import {
  addresses,
  bad,
  bodyOf,
  type CompanyDeps,
  type Env,
  ids,
  type Loaded,
  mailboxOf,
  notFound,
  userOf,
  usersOf,
} from "./context";
import { READ_ONLY, sharePatches } from "./sharing";

const newMailbox = z.object({
  email: z.string().trim().max(320),
  description: z.string().trim().max(200).default(""),
  memberIds: ids.default([]),
  readerIds: ids.default([]),
});
const mailboxPatch = z.object({
  description: z.string().trim().max(200).optional(),
  aliases: addresses.optional(),
  memberIds: ids.optional(),
  readerIds: ids.optional(),
});

const rulesBody = z.object({ rules: z.array(ruleSchema).max(100) });
const applyBody = z.object({ rule: ruleSchema });

const knownPeople = (loaded: Loaded, people: string[]) => people.every((id) => userOf(loaded, id));

export const mailboxRoutes = ({ management, mailstore }: CompanyDeps) => {
  /** Members and readers of a mailbox; someone in both lists is a member. */
  const setAccess = async (
    loaded: Loaded,
    groupId: string,
    access: { memberIds?: string[]; readerIds?: string[] },
  ): Promise<Result<null>> => {
    if (access.memberIds) {
      const members = await management.updateAccounts(
        membershipPatches(groupId, access.memberIds, usersOf(loaded)),
      );
      if (!members.ok) return members;
    }
    if (!access.readerIds) return { ok: true, value: null };
    const memberIds = access.memberIds ?? mailboxOf(loaded, groupId)?.memberIds ?? [];
    const readers = access.readerIds.filter((id) => !memberIds.includes(id));
    // A new group has no folders in the loaded state yet.
    const folders =
      loaded.folders[groupId] ?? (await mailstore.listFolders([groupId]))[groupId] ?? [];
    return mailstore.updateFolders(groupId, sharePatches(folders, readers, READ_ONLY));
  };

  const app = new Hono<Env>();

  app.post("/", async (c) => {
    const loaded = c.get("loaded");
    const body = await bodyOf(c, newMailbox);
    if (!body) return bad("Angaben unvollständig.");
    const address = parseAddress(body.email, loaded.company.domains);
    if (!address.ok) return bad(address.error);
    if (!knownPeople(loaded, [...body.memberIds, ...body.readerIds])) {
      return bad("Unbekannte Person.");
    }
    const created = await management.createAccount({
      "@type": "Group",
      ...address.value,
      description: body.description || null,
      locale: "de-DE",
      timeZone: "Europe/Berlin",
    });
    if (!created.ok) return bad(created.error);
    const access = await setAccess(loaded, created.value, body);
    if (!access.ok) return bad(access.error);
    return c.json({ id: created.value }, 201);
  });

  app.patch("/:id", async (c) => {
    const loaded = c.get("loaded");
    const id = c.req.param("id");
    if (!mailboxOf(loaded, id)) return notFound();
    const change = await bodyOf(c, mailboxPatch);
    if (!change) return bad("Angaben unvollständig.");
    if (!knownPeople(loaded, [...(change.memberIds ?? []), ...(change.readerIds ?? [])])) {
      return bad("Unbekannte Person.");
    }
    const patch: Record<string, unknown> = {};
    if (change.description !== undefined) patch.description = change.description || null;
    if (change.aliases !== undefined) {
      const aliases = aliasesValue(change.aliases, loaded.company.domains);
      if (!aliases.ok) return bad(aliases.error);
      patch.aliases = aliases.value;
    }
    if (Object.keys(patch).length) {
      const result = await management.updateAccounts({ [id]: patch });
      if (!result.ok) return bad(result.error);
    }
    const access = await setAccess(loaded, id, change);
    if (!access.ok) return bad(access.error);
    return c.json({ ok: true });
  });

  /** The mailbox's rules, run by Stalwart when mail for info@ & co. arrives. */
  app.get("/:id/rules", async (c) => {
    const id = c.req.param("id");
    if (!mailboxOf(c.get("loaded"), id)) return notFound();
    return c.json(await mailstore.getRules(id));
  });

  app.put("/:id/rules", async (c) => {
    const id = c.req.param("id");
    if (!mailboxOf(c.get("loaded"), id)) return notFound();
    const body = await bodyOf(c, rulesBody);
    if (!body) return bad("Angaben unvollständig.");
    const result = await mailstore.setRules(id, body.rules);
    return result.ok ? c.json({ ok: true }) : bad(result.error);
  });

  /** One rule over the mails already in the inbox; how many it changed. */
  app.post("/:id/rules/apply", async (c) => {
    const id = c.req.param("id");
    if (!mailboxOf(c.get("loaded"), id)) return notFound();
    const body = await bodyOf(c, applyBody);
    if (!body) return bad("Angaben unvollständig.");
    return c.json({ changed: await mailstore.applyRules(id, [body.rule]) });
  });

  return app;
};
