/**
 * The mail rules of a company account, kept by the admin: a shared mailbox (info@ & co.) or an
 * employee's own mailbox. Both are the account's Sieve script (server/rules/filters.ts), written
 * with the server's key; an employee sees and changes what the admin set as their own rules.
 * Only accounts `known` here: the routes sit behind the Firmenverwaltung's admin check.
 */
import type { Hono } from "hono";
import { z } from "zod";
import { ruleSchema } from "../rules/script";
import { bad, bodyOf, type CompanyDeps, type Env, type Loaded, notFound } from "./context";

const rulesBody = z.object({ rules: z.array(ruleSchema).max(100) });
const applyBody = z.object({ rule: ruleSchema });

/** Adds `/:id/rules` (GET, PUT) and `/:id/rules/apply` (POST) to `app`. */
export const addRulesRoutes = (
  app: Hono<Env>,
  { mailstore, categories }: Pick<CompanyDeps, "mailstore" | "categories">,
  known: (loaded: Loaded, id: string) => boolean,
) => {
  /** The account's rules, its folders to file into and its categories to set. */
  app.get("/:id/rules", async (c) => {
    const id = c.req.param("id");
    if (!known(c.get("loaded"), id)) return notFound();
    const [rules, own] = await Promise.all([mailstore.getRules(id), categories.list([id])]);
    return c.json({ ...rules, categories: own[id] ?? [] });
  });

  app.put("/:id/rules", async (c) => {
    const id = c.req.param("id");
    if (!known(c.get("loaded"), id)) return notFound();
    const body = await bodyOf(c, rulesBody);
    if (!body) return bad("Angaben unvollständig.");
    const result = await mailstore.setRules(id, body.rules);
    return result.ok ? c.json({ ok: true }) : bad(result.error);
  });

  /** One rule over the mails already in the inbox; how many it changed. */
  app.post("/:id/rules/apply", async (c) => {
    const id = c.req.param("id");
    if (!known(c.get("loaded"), id)) return notFound();
    const body = await bodyOf(c, applyBody);
    if (!body) return bad("Angaben unvollständig.");
    return c.json({ changed: await mailstore.applyRules(id, [body.rule]) });
  });
};
