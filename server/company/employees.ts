/**
 * The company's people: create, change, password and second factor, lock, out-of-office reply.
 * Only users with the plain user role (see `isCompanyUser`); the caller cannot lock themselves out.
 */
import { Hono } from "hono";
import { z } from "zod";
import {
  aliasesValue,
  newPassword,
  parseAddress,
  passwordKey,
  permissionsValue,
  rolesValue,
} from "./accounts";
import {
  addresses,
  bad,
  bodyOf,
  type CompanyDeps,
  type Env,
  fullName,
  ids,
  type Loaded,
  mailboxOf,
  notFound,
  userOf,
} from "./context";
import { OFFBOARDING_SCRIPT, offboardingScript } from "./offboarding";
import { FULL_ACCESS, sharePatches } from "./sharing";
import { applySignature } from "./signature-routes";

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
const dateTime = z.string().max(40).nullable();
const vacation = z.object({
  isEnabled: z.boolean(),
  fromDate: dateTime,
  toDate: dateTime,
  subject: z.string().max(500).nullable(),
  textBody: z.string().max(20_000).nullable(),
  htmlBody: z.string().max(100_000).nullable(),
});

const offboarding = z.object({
  /** Who gets full access to all folders of the mailbox. */
  handoverTo: z.string().max(64).nullable(),
  /** Who gets new mail instead. */
  forwardTo: z.string().max(64).nullable(),
  reply: z.object({ subject: z.string().max(500), text: z.string().max(20_000) }).nullable(),
});

const knownMailboxes = (loaded: Loaded, wanted: string[]) =>
  wanted.every((id) => mailboxOf(loaded, id));

export const employeeRoutes = ({
  management,
  mailstore,
  calendars,
  settings,
  endSessions,
  random,
}: CompanyDeps) => {
  const makePassword = () =>
    newPassword(random ?? ((size) => crypto.getRandomValues(new Uint8Array(size))));
  const app = new Hono<Env>();

  app.post("/", async (c) => {
    const loaded = c.get("loaded");
    const body = await bodyOf(c, newEmployee);
    if (!body) return bad("Angaben unvollständig.");
    const address = parseAddress(body.email, loaded.company.domains);
    if (!address.ok) return bad(address.error);
    if (!knownMailboxes(loaded, body.mailboxIds)) return bad("Unbekanntes Postfach.");
    const password = makePassword();
    const created = await management.createAccount({
      "@type": "User",
      ...address.value,
      description: body.fullName,
      locale: "de-DE",
      timeZone: "Europe/Berlin",
      roles: rolesValue(body.admin, loaded.roles),
      memberGroupIds: Object.fromEntries(body.mailboxIds.map((id) => [id, true])),
      credentials: { "0": { "@type": "Password", secret: password } },
    });
    if (!created.ok) return bad(created.error);
    // New people start with the company signature; a refusal there does not undo the account.
    const signature = await settings.signature();
    if (signature) await applySignature(mailstore, created.value, signature);
    // Colleagues see when they are busy and the other way round, like in Outlook; a refusal
    // there does not undo the account either.
    await calendars.welcome(created.value, [
      ...loaded.company.employees.map((employee) => employee.id),
      created.value,
    ]);
    return c.json({ id: created.value, password }, 201);
  });

  /** Every colleague sees every calendar's busy times, also where someone took it back. */
  app.post("/availability", async (c) => {
    const { employees } = c.get("loaded").company;
    const result = await calendars.showEveryone(employees.map((employee) => employee.id));
    if (!result.ok) return bad(result.error);
    return c.json({ calendars: result.value });
  });

  app.patch("/:id", async (c) => {
    const loaded = c.get("loaded");
    const id = c.req.param("id");
    const user = userOf(loaded, id);
    if (!user) return notFound();
    const change = await bodyOf(c, employeePatch);
    if (!change) return bad("Angaben unvollständig.");
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
    // Unlocked again after leaving: forwarding and reply of the offboarding stop.
    if (change.active === true) {
      const back = await mailstore.endOffboarding(id);
      if (!back.ok) return bad(back.error);
    }
    return c.json({ ok: true });
  });

  app.post("/:id/password", async (c) => {
    const user = userOf(c.get("loaded"), c.req.param("id"));
    const key = user && passwordKey(user);
    if (!user || !key) return notFound();
    const password = makePassword();
    const result = await management.updateAccounts({
      [user.id]: { [`credentials/${key}/secret`]: password },
    });
    if (!result.ok) return bad(result.error);
    await endSessions(user.emailAddress ?? "");
    return c.json({ password });
  });

  /** For a lost phone: the person signs in with the password only and sets up the code again. */
  app.delete("/:id/two-factor", async (c) => {
    const user = userOf(c.get("loaded"), c.req.param("id"));
    const key = user && passwordKey(user);
    if (!user || !key) return notFound();
    const result = await management.updateAccounts({
      [user.id]: { [`credentials/${key}/otpAuth`]: null },
    });
    if (!result.ok) return bad(result.error);
    return c.json({ ok: true });
  });

  /** The out-of-office reply, e.g. when someone falls ill and cannot set it themselves. */
  app.get("/:id/vacation", async (c) => {
    const user = userOf(c.get("loaded"), c.req.param("id"));
    if (!user) return notFound();
    return c.json(await mailstore.getVacation(user.id));
  });

  app.put("/:id/vacation", async (c) => {
    const user = userOf(c.get("loaded"), c.req.param("id"));
    if (!user) return notFound();
    const body = await bodyOf(c, vacation);
    if (!body) return bad("Angaben unvollständig.");
    const result = await mailstore.setVacation(user.id, body);
    return result.ok ? c.json({ ok: true }) : bad(result.error);
  });

  /**
   * Someone leaves: access locked, the mailbox handed over, new mail forwarded and answered.
   * Nothing is deleted; the mailbox stays for the GoBD retention.
   */
  app.post("/:id/offboarding", async (c) => {
    const loaded = c.get("loaded");
    const user = userOf(loaded, c.req.param("id"));
    if (!user) return notFound();
    if (user.id === loaded.selfId)
      return bad("Das eigene Konto kann sich nicht selbst aussperren.");
    const body = await bodyOf(c, offboarding);
    if (!body) return bad("Angaben unvollständig.");
    const heir = body.handoverTo ? userOf(loaded, body.handoverTo) : null;
    const forward = body.forwardTo ? userOf(loaded, body.forwardTo) : null;
    if ((body.handoverTo && !heir) || (body.forwardTo && !forward)) {
      return bad("Unbekannte Person.");
    }

    const locked = await management.updateAccounts({
      [user.id]: { permissions: permissionsValue(false, user.permissions) },
    });
    if (!locked.ok) return bad(locked.error);
    await endSessions(user.emailAddress ?? "");

    if (heir) {
      const folders = (await mailstore.listFolders([user.id]))[user.id] ?? [];
      const shared = await mailstore.updateFolders(
        user.id,
        sharePatches(folders, [heir.id], FULL_ACCESS, []),
      );
      if (!shared.ok) return bad(shared.error);
    }
    const script = offboardingScript({
      forwardTo: forward?.emailAddress ?? null,
      reply: body.reply,
    });
    if (script) {
      const sieve = await mailstore.setSieveScript(user.id, OFFBOARDING_SCRIPT, script);
      if (!sieve.ok) return bad(sieve.error);
    }
    return c.json({ ok: true });
  });

  return app;
};
