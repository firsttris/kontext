/**
 * Documents from Kontext's server (/api/documents): whether there is Schreibzeug and where, what a
 * folder holds, and moving files between mail and documents (server/documents/routes.ts).
 */
import { useQuery } from "@tanstack/react-query";
import type { OutgoingAttachment } from "@/jmap/mail";

type DocumentsConfig = { url: string | null; connected: boolean };

export type DocumentNode = { id: string; kind: "folder" | "file"; name: string };
export type DocumentListing = {
  folder: DocumentNode | null;
  path: DocumentNode[];
  children: DocumentNode[];
};

const send = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const response = await fetch(`/api/documents${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? String(response.status));
  return result;
};

const useConfig = () =>
  useQuery({
    queryKey: ["documents", "config"],
    queryFn: () => send<DocumentsConfig>("GET", "").catch(() => ({ url: null, connected: false })),
    staleTime: Number.POSITIVE_INFINITY,
  }).data;

/** Schreibzeug's address, when Kontext has it: the module "Dokumente" shows only then. */
export const useDocumentsUrl = (): string | null => useConfig()?.url ?? null;

/** Whether files can go between mail and documents (Kontext signs people in to Schreibzeug). */
export const useDocumentsConnected = (): boolean => useConfig()?.connected ?? false;

/** What a folder holds; null is the person's own files. Read afresh: the frame may have changed it. */
export const useFolder = (folderId: string | null) =>
  useQuery({
    queryKey: ["documents", "folder", folderId],
    queryFn: () =>
      send<DocumentListing>(
        "GET",
        `/folders${folderId ? `?parent=${encodeURIComponent(folderId)}` : ""}`,
      ),
    staleTime: 0,
  });

/** A mail's attachment into a folder of Dokumente; the stored file's id and name. */
export const saveAttachment = (input: {
  accountId: string;
  blobId: string;
  name: string;
  type: string;
  folderId: string | null;
}) => send<{ id: string; name: string }>("POST", "/save", input);

/** A file of Dokumente as an attachment of a mail written from this account. */
export const attachDocument = (input: { accountId: string; fileId: string }) =>
  send<OutgoingAttachment>("POST", "/attach", input);
