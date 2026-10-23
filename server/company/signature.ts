/**
 * The company signature: one template for everybody, with [Name] and [E-Mail] filled in per
 * sender address (Identity, RFC 8621 §6). Pure functions.
 */
import type { Identity } from "./mailstore";

export type SignatureTemplate = { html: string; text: string };

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const fill = (template: string, values: { name: string; email: string }) =>
  template.replaceAll("[Name]", values.name).replaceAll("[E-Mail]", values.email);

/** The signature patches for all of one account's sender addresses. */
export const signaturePatches = (
  template: SignatureTemplate,
  identities: Identity[],
): Record<string, Partial<Identity>> =>
  Object.fromEntries(
    identities.map((identity) => [
      identity.id,
      {
        htmlSignature: fill(template.html, {
          name: escapeHtml(identity.name),
          email: escapeHtml(identity.email),
        }),
        textSignature: fill(template.text, identity),
      },
    ]),
  );
