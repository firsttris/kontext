/** Contacts: the list on the left, the selected contact with mails and appointments on the right. */
import { Link, useNavigate } from "@tanstack/react-router";
import { BookUser, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { TabBar } from "@/components/shell/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { company, fullName, indexLetter, matchesSearch, sortKey } from "@/lib/jscontact";
import { m } from "@/paraglide/messages";
import { BooksDialog } from "./books-dialog";
import { ContactDetail } from "./contact-detail";
import { ContactEditor } from "./contact-editor";
import {
  type BookRef,
  bookLabel,
  type Contact,
  contactKey,
  useContacts,
  useContactsAccountId,
} from "./queries";

type ContactsSearch = {
  id?: string;
  account?: string;
  book?: string;
  edit?: boolean;
  q?: string;
};

export const ContactsPage = ({ search }: { search: ContactsSearch }) => {
  const { data: contacts, books, isPending } = useContacts(search.book);
  const ownAccount = useContactsAccountId();
  const [text, setText] = useState(search.q ?? "");
  const [managing, setManaging] = useState(false);
  const selected = contacts.find(
    (card) => card.id === search.id && card.accountId === (search.account ?? ownAccount),
  );
  const showDetail = Boolean(search.id);

  const groups = useMemo(() => {
    const sorted = contacts
      .filter((card) => matchesSearch(card, text))
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b), "de"));
    const byLetter = new Map<string, Contact[]>();
    for (const card of sorted) {
      const letter = indexLetter(card);
      byLetter.set(letter, [...(byLetter.get(letter) ?? []), card]);
    }
    return [...byLetter.entries()];
  }, [contacts, text]);

  return (
    <>
      <section
        aria-label={m.contacts_title()}
        className={cn(
          "h-full w-full shrink-0 flex-col border-border bg-bg md:w-[320px] md:border-r md:bg-side",
          showDetail ? "hidden md:flex" : "flex",
        )}
      >
        <header className="flex flex-col gap-3 px-4 pt-3 pb-3 md:pt-4">
          <div className="flex items-center justify-between">
            <h1 className="m-0 text-[30px] leading-tight font-semibold tracking-tight md:text-[18px]">
              {m.contacts_title()}
            </h1>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="iconSm"
                aria-label={m.contacts_books()}
                title={m.contacts_books()}
                onClick={() => setManaging(true)}
              >
                <BookUser size={16} />
              </Button>
              <Button
                asChild
                variant="outline"
                size="iconSm"
                aria-label={m.contacts_new()}
                title={m.contacts_new()}
              >
                <Link to="/contacts" search={{ id: "new", edit: true, book: search.book }}>
                  <Plus size={16} />
                </Link>
              </Button>
            </div>
          </div>
          <label className="flex h-[42px] items-center gap-2 rounded-xl bg-subtle px-3 text-muted md:h-9 md:rounded-[9px] md:border md:border-border md:bg-bg">
            <Search size={15} />
            <input
              type="search"
              aria-label={m.contacts_search()}
              placeholder={m.contacts_search()}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-fg outline-none md:text-[14px]"
            />
          </label>
          {books.length > 1 ? <BookPicker books={books} value={search.book} /> : null}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {isPending ? (
            <p className="px-3 py-4 text-[14px] text-muted">{m.common_loading()}</p>
          ) : groups.length === 0 ? (
            <p className="px-3 py-4 text-[14px] text-muted">{m.contacts_empty()}</p>
          ) : (
            groups.map(([letter, cards]) => (
              <div key={letter}>
                <div className="px-3 pt-2 pb-1 text-[12px] font-medium text-muted">{letter}</div>
                <ul aria-label={letter} className="m-0 flex list-none flex-col gap-0.5 p-0">
                  {cards.map((card) => (
                    <li key={contactKey(card)}>
                      <Link
                        to="/contacts"
                        search={{
                          id: card.id,
                          account: card.accountId === ownAccount ? undefined : card.accountId,
                          book: search.book,
                        }}
                        aria-current={card === selected ? "true" : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-fg no-underline hover:bg-hover",
                          card === selected && "bg-bg shadow-[0_0_0_1px_var(--border)]",
                        )}
                      >
                        <Avatar name={fullName(card)} size={34} />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">{fullName(card)}</span>
                          <span className="truncate text-[13px] text-muted">{company(card)}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
        <TabBar />
      </section>
      <main
        className={cn(
          "h-full min-w-0 flex-1 overflow-y-auto",
          showDetail ? "block" : "hidden md:block",
        )}
      >
        {search.id === "new" ? (
          <ContactEditor books={books} preferredBook={search.book} />
        ) : selected && search.edit ? (
          <ContactEditor key={contactKey(selected)} card={selected} books={books} />
        ) : selected ? (
          <ContactDetail card={selected} books={books} />
        ) : (
          <div className="flex h-full items-center justify-center text-[14px] text-muted">
            {search.id && !isPending ? m.contacts_empty() : m.contacts_pick()}
          </div>
        )}
      </main>
      <BooksDialog open={managing} onOpenChange={setManaging} />
    </>
  );
};

/** All contacts, or one address book: own ones first, then what colleagues shared. */
const BookPicker = ({ books, value }: { books: BookRef[]; value: string | undefined }) => {
  const navigate = useNavigate();
  const own = books.filter((book) => book.isPersonal);
  const shared = books.filter((book) => !book.isPersonal);
  return (
    <Select
      aria-label={m.contacts_book()}
      value={value ?? ""}
      onChange={(e) => navigate({ to: "/contacts", search: { book: e.target.value || undefined } })}
      className="h-9 rounded-[9px] text-[14px]"
    >
      <option value="">{m.contacts_all()}</option>
      <optgroup label={m.contacts_books_mine()}>
        {own.map((book) => (
          <option key={book.key} value={book.key}>
            {book.name}
          </option>
        ))}
      </optgroup>
      {shared.length > 0 ? (
        <optgroup label={m.contacts_books_shared()}>
          {shared.map((book) => (
            <option key={book.key} value={book.key}>
              {bookLabel(book)}
            </option>
          ))}
        </optgroup>
      ) : null}
    </Select>
  );
};
