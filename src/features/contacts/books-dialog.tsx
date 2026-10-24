/** Own address books: create, share with colleagues, delete. Shared ones are listed for reference. */
import { Share2, Trash2, Users } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { principalName } from "@/jmap/principals";
import { sharedWith } from "@/lib/sharing";
import { m } from "@/paraglide/messages";
import { usePrincipals } from "../sharing/queries";
import { ShareDialog } from "../sharing/share-dialog";
import { type BookRef, useBookMutations, useBooks } from "./queries";
import { VCardSection } from "./vcard-section";

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

export const BooksDialog = ({ open, onOpenChange }: Props) => {
  const { books } = useBooks();
  const { createBook } = useBookMutations();
  const toast = useToast();
  const [name, setName] = useState("");
  const [sharing, setSharing] = useState<BookRef | null>(null);
  const own = books.filter((book) => book.isPersonal);
  const shared = books.filter((book) => !book.isPersonal);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      await createBook.mutateAsync(name.trim());
      setName("");
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  return (
    <>
      <Dialog open={open && !sharing} onOpenChange={onOpenChange} title={m.contacts_books()}>
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-[12px] font-medium text-muted">{m.contacts_books_mine()}</h3>
          <ul aria-label={m.contacts_books_mine()} className="m-0 flex list-none flex-col p-0">
            {own.map((book) => (
              <OwnBook key={book.key} book={book} onShare={() => setSharing(book)} />
            ))}
          </ul>
          <form onSubmit={create} className="flex gap-2 pt-1">
            <Input
              aria-label={m.contacts_book_name()}
              placeholder={m.contacts_book_new()}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" variant="outline" disabled={createBook.isPending || !name.trim()}>
              {m.contacts_book_create()}
            </Button>
          </form>
        </section>
        {shared.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h3 className="m-0 text-[12px] font-medium text-muted">{m.contacts_books_shared()}</h3>
            <ul aria-label={m.contacts_books_shared()} className="m-0 flex list-none flex-col p-0">
              {shared.map((book) => (
                <li key={book.key} className="flex items-center gap-3 py-2">
                  <Users size={16} className="shrink-0 text-muted" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{book.name}</span>
                    <span className="truncate text-[12px] text-muted">
                      {book.name === book.owner ? "" : `${book.owner} · `}
                      {book.mayWrite ? m.sharing_may_edit() : m.sharing_read_only()}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <VCardSection books={books} />
      </Dialog>
      {sharing ? (
        <ShareBook
          book={books.find((book) => book.key === sharing.key) ?? sharing}
          onClose={() => setSharing(null)}
        />
      ) : null}
    </>
  );
};

const OwnBook = ({ book, onShare }: { book: BookRef; onShare: () => void }) => {
  const { data: principals = [] } = usePrincipals();
  const { deleteBook } = useBookMutations();
  const toast = useToast();
  const names = sharedWith(book.book.shareWith).map((id) => {
    const principal = principals.find((p) => p.id === id);
    return principal ? principalName(principal) : id;
  });

  const destroy = async () => {
    if (!window.confirm(m.contacts_book_delete_confirm({ name: book.name }))) return;
    try {
      await deleteBook.mutateAsync(book);
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  return (
    <li className="flex items-center gap-2 py-2">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{book.name}</span>
        <span className="truncate text-[12px] text-muted">
          {names.length
            ? m.contacts_book_shared_with({ names: names.join(", ") })
            : m.contacts_book_private()}
        </span>
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={onShare}
        aria-label={`${m.contacts_book_share()}: ${book.name}`}
      >
        <Share2 size={14} /> {m.contacts_book_share()}
      </Button>
      {!book.book.isDefault ? (
        <Button
          variant="ghost"
          size="iconSm"
          onClick={() => void destroy()}
          aria-label={`${m.contacts_book_delete()}: ${book.name}`}
          title={m.contacts_book_delete()}
        >
          <Trash2 size={15} />
        </Button>
      ) : null}
    </li>
  );
};

const ShareBook = ({ book, onClose }: { book: BookRef; onClose: () => void }) => {
  const { shareBook } = useBookMutations();
  const toast = useToast();
  return (
    <ShareDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={book.name}
      kind="addressBook"
      hint={m.sharing_hint()}
      shareWith={book.book.shareWith}
      onSave={async (shareWith) => {
        await shareBook.mutateAsync({ book, shareWith });
        toast.show(m.sharing_saved());
      }}
    />
  );
};
