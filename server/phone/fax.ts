/**
 * A fax on the fax line: the box receives it and uploads it as PDF when the call ends. Kontext
 * keeps it at the call (open it from the list) and puts it as a mail into the chosen mailbox.
 */
import type { ImportResult } from "../jmap-server";
import type { PhoneFiles } from "./files";
import { faxMessage } from "./phone-mail";
import type { PhoneStore } from "./store";

/** A PDF begins so; anything else is not a fax we could show. */
export const isPdf = (bytes: Uint8Array) =>
  bytes.length > 8 && new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";

export type FaxDeps = {
  store: Pick<PhoneStore, "callOfBox" | "setFax" | "settings">;
  files: Pick<PhoneFiles, "saveFax">;
  refresh: (callId: string) => Promise<void>;
  importMessage: (accountId: string, message: Uint8Array) => Promise<ImportResult>;
};

export const createFaxes = (deps: FaxDeps) => ({
  receive: async (
    boxId: string,
    boxCallId: string,
    pdf: Uint8Array,
  ): Promise<"ok" | "not-found" | "bad-file"> => {
    const call = await deps.store.callOfBox(boxId, boxCallId);
    if (!call?.fax) return "not-found";
    if (!isPdf(pdf)) return "bad-file";
    await deps.files.saveFax(call.id, pdf);
    await deps.store.setFax(call.id, "received");
    await deps.refresh(call.id);
    const { deliverTo } = (await deps.store.settings()).fax;
    if (deliverTo) {
      const message = faxMessage({
        remote: call.remote,
        to: deliverTo.email,
        at: new Date(call.startedAt),
        pdf,
      });
      const result = await deps.importMessage(deliverTo.accountId, message);
      if (!result.ok) console.warn(`Fax als Mail: ${result.error}`);
    }
    return "ok";
  },
});
