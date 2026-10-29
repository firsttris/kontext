/** The company signature: kept here, written into every sender address of every active person. */
import { Hono } from "hono";
import { z } from "zod";
import { bad, bodyOf, type CompanyDeps, type Env } from "./context";
import type { Mailstore } from "./mailstore";
import { type SignatureDetails, type SignatureTemplate, signaturePatches } from "./signature";

const template = z.object({
  html: z.string().max(50_000),
  text: z.string().max(20_000),
  /** Also write it into everybody's signature now. */
  apply: z.boolean().default(false),
});

/** Writes the template into all sender addresses of one account; false if Stalwart refused. */
export const applySignature = async (
  mailstore: Mailstore,
  accountId: string,
  signature: SignatureTemplate,
  details?: SignatureDetails,
): Promise<boolean> => {
  const identities = await mailstore.listIdentities(accountId);
  const patches = signaturePatches(signature, identities, details);
  return (await mailstore.updateIdentities(accountId, patches)).ok;
};

export const signatureRoutes = ({ mailstore, settings, signatureDetails }: CompanyDeps) => {
  const app = new Hono<Env>();

  app.get("/", async (c) => c.json((await settings.signature()) ?? { html: "", text: "" }));

  app.put("/", async (c) => {
    const body = await bodyOf(c, template);
    if (!body) return bad("Angaben unvollständig.");
    const signature = { html: body.html, text: body.text };
    await settings.saveSignature(signature);
    if (!body.apply) return c.json({ updated: 0 });
    const people = c.get("loaded").company.employees.filter((e) => e.active);
    const results = await Promise.all(
      people.map(async (person) =>
        applySignature(mailstore, person.id, signature, await signatureDetails.of(person.id)),
      ),
    );
    const failed = results.filter((ok) => !ok).length;
    if (failed) return bad(`Bei ${failed} Personen nicht übernommen.`);
    return c.json({ updated: people.length });
  });

  return app;
};
