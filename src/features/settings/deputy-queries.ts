/** Data for "Vertretung": the own shared objects, and giving or taking back a deputy's access. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import { applyDeputyPatches, loadDeputyObjects } from "@/jmap/deputy";
import type { DeputyObjects, DeputyPatches } from "@/lib/deputy";
import { usePersonalAccountId } from "./queries";

const deputyKey = (accountId: string | undefined) => [accountId, "deputies"] as const;

export const useDeputyObjects = () => {
  const client = useClient();
  const accountId = usePersonalAccountId();
  return useQuery({
    queryKey: deputyKey(accountId),
    queryFn: () => loadDeputyObjects(client, accountId!),
    enabled: Boolean(accountId),
  });
};

/**
 * Writes patches made from freshly loaded objects, not the shown ones: a folder created since the
 * page opened is included, and a share changed elsewhere is not overwritten with an old state.
 * Afterwards the calendar and address book lists reload too; their share dialogs show the same
 * `shareWith`.
 */
export const useApplyDeputy = () => {
  const client = useClient();
  const accountId = usePersonalAccountId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (makePatches: (objects: DeputyObjects) => DeputyPatches) =>
      loadDeputyObjects(client, accountId!).then((objects) =>
        applyDeputyPatches(client, accountId!, makePatches(objects)),
      ),
    onSettled: () =>
      Promise.all(
        [deputyKey(accountId), [accountId, "calendars"], [accountId, "addressBooks"]].map(
          (queryKey) => queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
};
