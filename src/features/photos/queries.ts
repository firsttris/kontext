/**
 * Photos of people: the colleagues' profile photos (Kontext's server, /api/photos) and the photos
 * in one's contacts. `usePhotoOf` finds the one for a person; `useOwnPhoto` changes one's own.
 */
import {
  type UseQueryResult,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { useClient } from "@/auth/auth";
import { contactsQuery, useBooks } from "@/features/contacts/queries";
import { usePrincipals } from "@/features/sharing/queries";
import { useMe } from "@/features/tasks/queries";
import { type ContactCard, contactPhoto } from "@/lib/jscontact";
import { addressKey, colleaguePhotoUrl, type PhotoKey, photoFinder } from "@/lib/photo";
import { squarePhoto } from "./make-photo";

const KEY = ["photos"];

type Versions = Record<string, number>;

const request = async (method: string, body?: Blob): Promise<Versions> => {
  const response = await fetch("/api/photos", {
    method,
    credentials: "same-origin",
    headers: body ? { "content-type": "image/jpeg" } : undefined,
    body,
  });
  const result = (await response.json().catch(() => ({}))) as {
    photos?: Versions;
    error?: string;
  };
  if (!response.ok) throw new Error(result.error ?? String(response.status));
  return result.photos ?? {};
};

const useVersions = (): Versions =>
  useQuery({ queryKey: KEY, queryFn: () => request("GET"), staleTime: 5 * 60_000 }).data ?? {};

/** Address → photo of every contact that carries one. Outside the component, so it stays memoized. */
const contactPhotos = (results: UseQueryResult<ContactCard[]>[]): Map<string, string> => {
  const photos = new Map<string, string>();
  for (const card of results.flatMap((result) => result.data ?? [])) {
    const photo = contactPhoto(card);
    if (!photo) continue;
    for (const { address } of Object.values(card.emails ?? {})) {
      if (!photos.has(addressKey(address))) photos.set(addressKey(address), photo);
    }
  }
  return photos;
};

const NO_CONTACTS: ReadonlyMap<string, string> = new Map();

const useFinder = (contacts: ReadonlyMap<string, string>) => {
  const versions = useVersions();
  const { data: principals } = usePrincipals();
  return useMemo(
    () => photoFinder({ versions, colleagues: principals ?? [], contacts }),
    [versions, principals, contacts],
  );
};

/**
 * `photoOf({ id, email })` for colleagues only (chat, calls, tasks): their profile photos,
 * without loading the address books.
 */
export const useColleaguePhotoOf = (): ((person: PhotoKey) => string | undefined) =>
  useFinder(NO_CONTACTS);

/** `photoOf({ id, email })` for anyone (mail, contacts, phone): colleagues, then contacts. */
export const usePhotoOf = (): ((person: PhotoKey) => string | undefined) => {
  const client = useClient();
  const { books } = useBooks();
  const contacts = useQueries({
    queries: books.map((book) => contactsQuery(client, book)),
    combine: contactPhotos,
  });
  return useFinder(contacts);
};

/** One's own profile photo, to show and change in the settings. */
export const useOwnPhoto = () => {
  const queryClient = useQueryClient();
  const me = useMe();
  const versions = useVersions();
  const settle = (photos: Versions) => queryClient.setQueryData(KEY, photos);
  const set = useMutation({
    mutationFn: async (file: File) => request("PUT", await squarePhoto(file)),
    onSuccess: settle,
  });
  const remove = useMutation({ mutationFn: () => request("DELETE"), onSuccess: settle });
  const version = versions[me];
  return {
    url: me && version !== undefined ? colleaguePhotoUrl(me, version) : undefined,
    set: set.mutateAsync,
    remove: remove.mutateAsync,
    busy: set.isPending || remove.isPending,
  };
};
