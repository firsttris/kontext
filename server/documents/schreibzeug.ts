/**
 * Kontext's server talking to Schreibzeug's API on someone's behalf: with a token Kontext signs for
 * that person (oidc/provider.ts keys), valid for five minutes and only for Schreibzeug. Schreibzeug
 * checks it against Kontext's keys and acts with that person's rights (its src/auth/bearer.ts).
 */
import { z } from "zod";

const TOKEN_SECONDS = 5 * 60;

export type Person = { id: string; email: string; name: string };

/** Signs a JWT with Kontext's keys (Better Auth's jwt plugin, `auth.api.signJWT`). */
export type SignToken = (payload: Record<string, unknown>) => Promise<string>;

/** A file or folder as Schreibzeug lists it (its packages/files-api nodeSchema), as far as needed. */
const nodeSchema = z.object({
  id: z.string(),
  kind: z.enum(["folder", "file"]),
  name: z.string(),
  size: z.number().nullable().optional(),
});

export type DocumentNode = z.infer<typeof nodeSchema>;

const listingSchema = z.object({
  folder: nodeSchema.nullable(),
  path: z.array(nodeSchema),
  children: z.array(nodeSchema),
});

export type DocumentListing = z.infer<typeof listingSchema>;

/** Who a node is shared with, as its owner sees it (Schreibzeug's shareSchema). */
const shareSchema = z.object({
  userId: z.string(),
  email: z.string(),
  role: z.enum(["edit", "view"]),
});

export type DocumentShare = z.infer<typeof shareSchema>;

/** Schreibzeug's own message when it refuses, in German, or the status. */
const failure = async (response: Response): Promise<Error> => {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return new Error(body?.error?.message ?? `Schreibzeug: ${response.status}`);
};

export const createSchreibzeug = ({
  url,
  issuer,
  sign,
}: {
  /** Schreibzeug's address, also the audience of the tokens (its SCHREIBZEUG_URL). */
  url: string;
  /** Kontext's issuer, `<BETTER_AUTH_URL>/api/auth`. */
  issuer: string;
  sign: SignToken;
}) => {
  const tokenFor = (person: Person) =>
    sign({
      sub: person.id,
      email: person.email,
      name: person.name,
      iss: issuer,
      aud: url,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + TOKEN_SECONDS,
    });

  const call = async (person: Person, path: string, init: RequestInit = {}) => {
    const response = await fetch(`${url}/api${path}`, {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${await tokenFor(person)}` },
    });
    if (!response.ok) throw await failure(response);
    return response;
  };

  return {
    /** A folder's content; `null` is the person's own files. */
    list: async (person: Person, folderId: string | null): Promise<DocumentListing> =>
      listingSchema.parse(
        await (
          await call(person, `/nodes?parent=${encodeURIComponent(folderId ?? "root")}`)
        ).json(),
      ),
    /** Stores a file in a folder; a taken name is refused with Schreibzeug's message. */
    upload: async (person: Person, folderId: string | null, file: File): Promise<DocumentNode> => {
      const form = new FormData();
      form.set("file", file);
      if (folderId) form.set("parentId", folderId);
      return nodeSchema.parse(
        await (await call(person, "/files", { method: "POST", body: form })).json(),
      );
    },
    /** A file's newest version, with its name and type. */
    download: async (person: Person, fileId: string): Promise<File> => {
      const [node, content] = await Promise.all([
        call(person, `/nodes/${encodeURIComponent(fileId)}`).then(async (response) =>
          nodeSchema.parse(await response.json()),
        ),
        call(person, `/files/${encodeURIComponent(fileId)}/content`),
      ]);
      if (node.kind !== "file") throw new Error("Das ist ein Ordner, keine Datei.");
      const type = content.headers.get("content-type") ?? "application/octet-stream";
      return new File([await content.arrayBuffer()], node.name, { type });
    },
    /**
     * Lets someone open a file (or a folder) by their address, as the owner may; an address without
     * an account at Schreibzeug holds once the person first comes through Kontext.
     */
    share: async (person: Person, nodeId: string, email: string, role: "view" | "edit") => {
      await call(person, `/nodes/${encodeURIComponent(nodeId)}/shares`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
    },
    /** A new folder; `null` puts it into the person's own files. */
    createFolder: async (
      person: Person,
      parentId: string | null,
      name: string,
    ): Promise<DocumentNode> =>
      nodeSchema.parse(
        await (
          await call(person, "/folders", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ parentId, name }),
          })
        ).json(),
      ),
    /** Who a node of the person is shared with, also addresses still waiting for an account. */
    shares: async (person: Person, nodeId: string): Promise<DocumentShare[]> =>
      z
        .array(shareSchema)
        .parse(await (await call(person, `/nodes/${encodeURIComponent(nodeId)}/shares`)).json()),
    /** Takes a share back (`userId` as `shares` lists it). */
    unshare: async (person: Person, nodeId: string, userId: string) => {
      await call(
        person,
        `/nodes/${encodeURIComponent(nodeId)}/shares/${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      );
    },
    /** Signs the person out of Schreibzeug everywhere (someone left or was locked). */
    endSessions: async (person: Person) => {
      await call(person, "/sessions", { method: "DELETE" });
    },
    /** Whether Schreibzeug answers at all (checked once at start). */
    reachable: async (): Promise<boolean> =>
      fetch(`${url}/api/health`)
        .then((response) => response.ok)
        .catch(() => false),
  };
};

export type Schreibzeug = ReturnType<typeof createSchreibzeug>;
