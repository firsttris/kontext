/**
 * "Als Anhang weiterleiten": the picked mails as the composer attaches them, each by the blob of
 * its raw message. An encrypted mail keeps the real subject it was opened with here as its name.
 */
import { useQuery } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import { getEmlOriginals } from "@/jmap/mail";
import type { EmlOriginal } from "@/lib/compose";
import { shownSubject } from "./opened-mails";

export const useEmlForward = (accountId: string, ids: string[]) => {
  const client = useClient();
  return useQuery({
    queryKey: [accountId, "eml-forward", ids],
    queryFn: async (): Promise<EmlOriginal[]> =>
      (await getEmlOriginals(client, accountId, ids)).map((email) => ({
        blobId: email.blobId,
        subject: shownSubject(email),
        size: email.size,
      })),
    enabled: ids.length > 0,
  });
};
