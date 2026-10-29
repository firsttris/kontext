/**
 * /api/signature-details: what the signed-in person enters for the company signature (phone,
 * mobile, position, department). Saving writes the company signature anew into the own sender
 * addresses, so the new number is in the next mail.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { SessionAccount } from "../categories/routes";
import type { Mailstore } from "./mailstore";
import type { CompanySettings } from "./settings";
import type { SignatureDetailsStore } from "./signature-details";
import { applySignature } from "./signature-routes";

const field = z.string().trim().max(120);
const detailsSchema = z.object({ phone: field, mobile: field, position: field, department: field });

export const createSignatureDetailRoutes = ({
  store,
  settings,
  mailstore,
  accountsOf,
}: {
  store: SignatureDetailsStore;
  settings: Pick<CompanySettings, "signature">;
  mailstore: Mailstore;
  accountsOf: (request: Request) => Promise<SessionAccount[] | null>;
}) => {
  const app = new Hono<{ Variables: { me: string } }>();
  app.use(async (c, next) => {
    const me = (await accountsOf(c.req.raw))?.find((account) => account.isPersonal)?.id;
    if (!me) return c.json({ error: "Nicht angemeldet" }, 401);
    c.set("me", me);
    await next();
  });

  app.get("/", async (c) => c.json(await store.of(c.get("me"))));

  app.put("/", async (c) => {
    const parsed = detailsSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Angaben unvollständig." }, 400);
    await store.save(c.get("me"), parsed.data);
    const signature = await settings.signature();
    const applied = signature
      ? await applySignature(mailstore, c.get("me"), signature, parsed.data)
      : false;
    return c.json({ details: parsed.data, applied });
  });

  return app;
};
