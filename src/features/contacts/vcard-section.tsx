/**
 * vCard import and export for one address book, in the address books dialog. Import reads the
 * file with Stalwart's parser, skips cards that are already in the book and shows what it will
 * add before it does.
 */
import { useQueryClient } from "@tanstack/react-query";
import { Download, Upload } from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";
import { useClient } from "@/auth/auth";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { createContacts, listContacts, parseVCards } from "@/jmap/contacts";
import { downloadText } from "@/lib/download";
import type { ContactCard } from "@/lib/jscontact";
import { isDuplicate, normalizeMembers, splitVCards, toVCardFile } from "@/lib/vcard";
import { m } from "@/paraglide/messages";
import { type BookRef, bookLabel, startBook } from "./queries";

type Preview = { cards: ContactCard[]; duplicates: number; failed: number };

const fileName = (name: string) => `${name.replace(/[\\/:*?"<>|]+/g, "_") || "Kontakte"}.vcf`;

/** The card as it is created: the server's id and books are set anew. */
const forCreate = ({ id: _id, addressBookIds: _books, ...card }: ContactCard) => card;

export const VCardSection = ({ books }: { books: BookRef[] }) => {
  const client = useClient();
  const queryClient = useQueryClient();
  const toast = useToast();
  const writable = books.filter((book) => book.mayWrite);
  const [bookKey, setBookKey] = useState(() => startBook(writable));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const book = books.find((b) => b.key === bookKey);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    } finally {
      setBusy(false);
    }
  };

  const read = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !book) return;
    void run(async () => {
      const vcards = splitVCards(await file.text());
      const [parsed, existing] = await Promise.all([
        parseVCards(client, book.accountId, vcards),
        listContacts(client, book.accountId, book.book.id),
      ]);
      const cards = parsed.filter((card): card is ContactCard => card !== null);
      const known = new Set(
        [...existing, ...cards].map((card) => card.uid).filter((uid): uid is string => !!uid),
      );
      const fresh: ContactCard[] = [];
      for (const card of cards) {
        if (!isDuplicate(card, [...existing, ...fresh])) fresh.push(normalizeMembers(card, known));
      }
      setPreview({
        cards: fresh,
        duplicates: cards.length - fresh.length,
        failed: vcards.length - cards.length,
      });
    });
  };

  const importNow = () =>
    preview &&
    book &&
    run(async () => {
      const count = await createContacts(
        client,
        book.accountId,
        book.book.id,
        preview.cards.map(forCreate),
      );
      await queryClient.invalidateQueries({ queryKey: [book.accountId, "contacts"] });
      setPreview(null);
      toast.show(m.contacts_import_done({ count }));
    });

  const exportNow = () =>
    book &&
    run(async () => {
      const cards = await listContacts(client, book.accountId, book.book.id);
      downloadText(toVCardFile(cards), fileName(book.name), "text/vcard");
    });

  return (
    <section className="flex flex-col gap-2">
      <h3 className="m-0 text-[12px] font-medium text-muted">{m.contacts_vcard()}</h3>
      <div className="flex flex-wrap gap-2">
        <Select
          aria-label={m.contacts_vcard_book()}
          value={bookKey}
          onChange={(e) => {
            setBookKey(e.target.value);
            setPreview(null);
          }}
          className="min-w-0 flex-1 basis-48"
        >
          {books.map((b) => (
            <option key={b.key} value={b.key}>
              {bookLabel(b)}
            </option>
          ))}
        </Select>
        <input
          ref={input}
          type="file"
          accept=".vcf,text/vcard,text/x-vcard"
          aria-label={m.contacts_import_file()}
          className="hidden"
          onChange={read}
        />
        <Button
          variant="outline"
          disabled={busy || !book?.mayWrite}
          onClick={() => input.current?.click()}
        >
          <Upload size={14} /> {m.contacts_import()}
        </Button>
        <Button variant="outline" disabled={busy || !book} onClick={() => void exportNow()}>
          <Download size={14} /> {m.contacts_export()}
        </Button>
      </div>
      {preview ? (
        <div
          aria-live="polite"
          className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3 text-[14px]"
        >
          <span className="flex-1">
            {m.contacts_import_preview({ count: preview.cards.length })}
            {preview.duplicates
              ? ` ${m.contacts_import_duplicates({ count: preview.duplicates })}`
              : ""}
            {preview.failed ? ` ${m.contacts_import_failed({ count: preview.failed })}` : ""}
          </span>
          <Button variant="ghost" onClick={() => setPreview(null)}>
            {m.contacts_cancel()}
          </Button>
          <Button
            variant="primary"
            disabled={busy || preview.cards.length === 0}
            onClick={() => void importNow()}
          >
            {m.contacts_import_confirm({ count: preview.cards.length })}
          </Button>
        </div>
      ) : null}
    </section>
  );
};
