/**
 * The Firmenverwaltung under /api/company: people and shared mailboxes of the company. Only users
 * with the company role may use it; the server works with its own Stalwart key and allows only
 * what is here (no roles beyond the mark, no other accounts, no server settings).
 */
import { Hono } from "hono";
import { z } from "zod";
import {
  aliasesValue,
  type Company,
  isCompanyUser,
  membershipPatches,
  newPassword,
  parseAddress,
  passwordKey,
  permissionsValue,
  type Roles,
  rolesValue,
  type StalwartAccount,
  toCompany,
} from "./accounts";
import type { Management } from "./management";

export type CompanyDeps = {
  management: Management;
  /** The signed-in user's address, or null. */
  currentEmail: (request: Request) => Promise<string | null>;
  /** Ends the user's Sekretär sessions (after deactivating or a new password). */
  endSessions: (email: string) => Promise<void>;
  random?: (size: number) => Uint8Array;
};

type Loaded = { company: Company; accounts: StalwartAccount[]; roles: Roles; selfId: string };

const fullName = z.string().trim().min(1).max(200);
const addresses = z.array(z.string().trim().max(320)).max(50);
const ids = z.array(z.string().max(64)).max(500);

const newEmployee = z.object({
  email: z.string().trim().max(320),
  fullName,
  admin: z.boolean().default(false),
  mailboxIds: ids.default([]),
});
const employeePatch = z.object({
  fullName: fullName.optional(),
  aliases: addresses.optional(),
  mailboxIds: ids.optional(),
  admin: z.boolean().optional(),
  active: z.boolean().optional(),
});
const newMailbox = z.object({
  email: z.string().trim().max(320),
  description: z.string().trim().max(200).default(""),
  memberIds: ids.default([]),
});
const mailboxPatch = z.object({
  description: z.string().trim().max(200).optional(),
  aliases: addresses.optional(),
  memberIds: ids.optional(),
});

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export const createCompanyRoutes = ({
  management,
  currentEmail,
  endSessions,
  random = (size) => crypto.getRandomValues(new Uint8Array(size)),
}: CompanyDeps) => {
  let roles: Roles | undefined;

  /** Everything a request needs, or null when the caller may not use the Firmenverwaltung. */
  const load = async (request: Request): Promise<Loaded | null> => {
    const email = await currentEmail(request);
    if (!email) return null;
    roles ??= await management.loadRoles();
    const [accounts, domains] = await Promise.all([
      management.listAccounts(),
      management.listDomains(),
    ]);
    const company = toCompany(accounts, roles, domains);
    const self = company.employees.find((e) => sameAddress(e.email, email));
    if (!self?.admin || !self.active) return null;
    return { company, accounts, roles, selfId: self.id };
  };

  const app = new Hono<{ Variables: { loaded: Loaded } }>();

  /** Whether to show the Firmenverwaltung at all; asked by every signed-in user. */
  app.get("/me", async (c) => c.json({ admin: Boolean(await load(c.req.raw)) }));

  app.use("*", async (c, next) => {
    const loaded = await load(c.req.raw);
    if (!loaded) return c.json({ error: "Keine Berechtigung" }, 403);
    c.set("loaded", loaded);
    await next();
  });

  const bad = (error: string) => Response.json({ error }, { status: 400 });

  const userOf = (loaded: Loaded, id: string) =>
    loaded.accounts.find((a) => a.id === id && isCompanyUser(a, loaded.roles));
  const groupOf = (loaded: Loaded, id: string) => loaded.company.mailboxes.find((m) => m.id === id);
  const knownMailboxes = (loaded: Loaded, wanted: string[]) =>
    wanted.every((id) => groupOf(loaded, id));

  app.get("/", (c) => {
    const { company, selfId } = c.get("loaded");
    return c.json({ ...company, selfId });
  });

  app.post("/employees", async (c) => {
    const loaded = c.get("loaded");
    const body = newEmployee.safeParse(await c.req.json());
    if (!body.success) return bad("Angaben unvollständig.");
    const address = parseAddress(body.data.email, loaded.company.domains);
    if (!address.ok) return bad(address.error);
    if (!knownMailboxes(loaded, body.data.mailboxIds)) return bad("Unbekanntes Postfach.");
    const password = newPassword(random);
    const created = await management.createAccount({
      "@type": "User",
      ...address.value,
      description: body.data.fullName,
      locale: "de-DE",
      timeZone: "Europe/Berlin",
      roles: rolesValue(body.data.admin, loaded.roles),
      memberGroupIds: Object.fromEntries(body.data.mailboxIds.map((id) => [id, true])),
      credentials: { "0": { "@type": "Password", secret: password } },
    });
    if (!created.ok) return bad(created.error);
    return c.json({ id: created.value, password }, 201);
  });

  app.patch("/employees/:id", async (c) => {
    const loaded = c.get("loaded");
    const id = c.req.param("id");
    const user = userOf(loaded, id);
    if (!user) return c.json({ error: "Nicht gefunden" }, 404);
    const body = employeePatch.safeParse(await c.req.json());
    if (!body.success) return bad("Angaben unvollständig.");
    const change = body.data;
    if (id === loaded.selfId && (change.admin === false || change.active === false)) {
      return bad("Das eigene Konto kann sich nicht selbst aussperren.");
    }
    const patch: Record<string, unknown> = {};
    if (change.fullName !== undefined) patch.description = change.fullName;
    if (change.admin !== undefined) patch.roles = rolesValue(change.admin, loaded.roles);
    if (change.active !== undefined) {
      patch.permissions = permissionsValue(change.active, user.permissions);
    }
    if (change.aliases !== undefined) {
      const aliases = aliasesValue(change.aliases, loaded.company.domains);
      if (!aliases.ok) return bad(aliases.error);
      patch.aliases = aliases.value;
    }
    if (change.mailboxIds !== undefined) {
      if (!knownMailboxes(loaded, change.mailboxIds)) return bad("Unbekanntes Postfach.");
      for (const mailbox of loaded.company.mailboxes) {
        const wanted = change.mailboxIds.includes(mailbox.id);
        if (wanted !== Boolean(user.memberGroupIds?.[mailbox.id])) {
          patch[`memberGroupIds/${mailbox.id}`] = wanted ? true : null;
        }
      }
    }
    const result = await management.updateAccounts({ [id]: patch });
    if (!result.ok) return bad(result.error);
    if (change.active === false) await endSessions(user.emailAddress ?? "");
    return c.json({ ok: true });
  });

  app.post("/employees/:id/password", async (c) => {
    const loaded = c.get("loaded");
    const user = userOf(loaded, c.req.param("id"));
    const key = user && passwordKey(user);
    if (!user || !key) return c.json({ error: "Nicht gefunden" }, 404);
    const password = newPassword(random);
    const result = await management.updateAccounts({
      [user.id]: { [`credentials/${key}/secret`]: password },
    });
    if (!result.ok) return bad(result.error);
    await endSessions(user.emailAddress ?? "");
    return c.json({ password });
  });

  /** For a lost phone: the person signs in with the password only and sets up the code again. */
  app.delete("/employees/:id/two-factor", async (c) => {
    const loaded = c.get("loaded");
    const user = userOf(loaded, c.req.param("id"));
    const key = user && passwordKey(user);
    if (!user || !key) return c.json({ error: "Nicht gefunden" }, 404);
    const result = await management.updateAccounts({
      [user.id]: { [`credentials/${key}/otpAuth`]: null },
    });
    if (!result.ok) return bad(result.error);
    return c.json({ ok: true });
  });

  app.post("/mailboxes", async (c) => {
    const loaded = c.get("loaded");
    const body = newMailbox.safeParse(await c.req.json());
    if (!body.success) return bad("Angaben unvollständig.");
    const address = parseAddress(body.data.email, loaded.company.domains);
    if (!address.ok) return bad(address.error);
    if (!body.data.memberIds.every((id) => userOf(loaded, id))) return bad("Unbekannte Person.");
    const created = await management.createAccount({
      "@type": "Group",
      ...address.value,
      description: body.data.description || null,
      locale: "de-DE",
      timeZone: "Europe/Berlin",
    });
    if (!created.ok) return bad(created.error);
    const users = loaded.accounts.filter((a) => isCompanyUser(a, loaded.roles));
    const members = await management.updateAccounts(
      membershipPatches(created.value, body.data.memberIds, users),
    );
    if (!members.ok) return bad(members.error);
    return c.json({ id: created.value }, 201);
  });

  app.patch("/mailboxes/:id", async (c) => {
    const loaded = c.get("loaded");
    const id = c.req.param("id");
    if (!groupOf(loaded, id)) return c.json({ error: "Nicht gefunden" }, 404);
    const body = mailboxPatch.safeParse(await c.req.json());
    if (!body.success) return bad("Angaben unvollständig.");
    const change = body.data;
    const patch: Record<string, unknown> = {};
    if (change.description !== undefined) patch.description = change.description || null;
    if (change.aliases !== undefined) {
      const aliases = aliasesValue(change.aliases, loaded.company.domains);
      if (!aliases.ok) return bad(aliases.error);
      patch.aliases = aliases.value;
    }
    const users = loaded.accounts.filter((a) => isCompanyUser(a, loaded.roles));
    if (change.memberIds && !change.memberIds.every((m) => userOf(loaded, m))) {
      return bad("Unbekannte Person.");
    }
    const result = await management.updateAccounts({
      ...(Object.keys(patch).length ? { [id]: patch } : {}),
      ...(change.memberIds ? membershipPatches(id, change.memberIds, users) : {}),
    });
    if (!result.ok) return bad(result.error);
    return c.json({ ok: true });
  });

  return app;
};
