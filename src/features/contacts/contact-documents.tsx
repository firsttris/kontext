/**
 * A contact's documents: files of Dokumente linked to the card (an offer, a contract), kept in
 * the card's JSContact links so other programs see the address too. Whoever may change the card
 * links and takes them off; in a shared mailbox's address book its people may open them.
 */
import { FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { LinkDocument } from "@/features/documents/document-actions";
import { useDocumentsConnected } from "@/features/documents/queries";
import { useShareWith } from "@/features/documents/use-share-with";
import { ItemLink } from "@/features/links/item-link";
import {
  DOCUMENTS_ACCOUNT,
  documentHref,
  documentsOfContact,
  type LinkedDocument,
  withContactDocuments,
} from "@/lib/document-links";
import { m } from "@/paraglide/messages";
import { type Contact, useContactMutations } from "./queries";

export const ContactDocuments = ({ card, mayWrite }: { card: Contact; mayWrite: boolean }) => {
  const connected = useDocumentsConnected();
  const { update } = useContactMutations();
  const shareWith = useShareWith();
  const toast = useToast();
  const documents = documentsOfContact(card.links);
  if (!connected && documents.length === 0) return null;

  const save = (next: LinkedDocument[]) =>
    update.mutateAsync({ contact: card, card: { links: withContactDocuments(card.links, next) } });

  const add = async (file: { id: string; name: string }) => {
    if (documents.some((document) => document.id === file.id)) return;
    const href = documentHref(window.location.origin, file.id);
    try {
      await save([...documents, { id: file.id, name: file.name, href }]);
      shareWith.contact(card.accountId, file.id);
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  const remove = (id: string) =>
    void save(documents.filter((document) => document.id !== id)).catch((error: Error) =>
      toast.show(m.common_error({ message: error.message }), "error"),
    );

  return (
    <section aria-label={m.documents_linked()} className="flex flex-col gap-2">
      <div className="flex items-center gap-2 border-b border-border pb-1.5">
        <h3 className="m-0 flex-1 text-[14px] font-semibold">{m.documents_linked()}</h3>
        {mayWrite ? <LinkDocument onPick={(file) => void add(file)} /> : null}
      </div>
      {documents.length === 0 ? (
        <p className="m-0 text-[14px] text-muted">{m.contacts_no_documents()}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {documents.map((document) => (
            <li key={document.id} className="flex items-center gap-1">
              <ItemLink
                item={{ kind: "document", accountId: DOCUMENTS_ACCOUNT, ref: document.id }}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-[14px] text-fg no-underline hover:bg-hover"
              >
                <FileText size={14} className="shrink-0 text-muted" aria-hidden="true" />
                <span className="truncate">{document.name}</span>
              </ItemLink>
              {mayWrite ? (
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label={m.documents_remove({ name: document.name })}
                  onClick={() => remove(document.id)}
                >
                  <X size={14} />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
