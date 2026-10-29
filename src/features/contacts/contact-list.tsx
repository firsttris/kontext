/** The list of the contacts column: groups first, then the contacts by letter. */
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { byLetter } from "@/lib/contact-selection";
import { sortKey } from "@/lib/jscontact";
import { m } from "@/paraglide/messages";
import { ContactRow } from "./contact-row";
import { type Contact, contactKey } from "./queries";

type Props = {
  groups: Contact[];
  contacts: Contact[];
  selected: Contact | undefined;
  ownAccount: string | undefined;
  book: string | undefined;
  /** While searching, the group section only shows matches and no "Neue Gruppe". */
  searching: boolean;
  /** The picked people by `contactKey`; `picking`: every line shows its box. */
  picked: Set<string>;
  picking: boolean;
  onPick: (key: string, shift: boolean) => void;
};

export const ContactList = ({
  groups,
  contacts,
  selected,
  ownAccount,
  book,
  searching,
  picked,
  picking,
  onPick,
}: Props) => {
  const row = (card: Contact, group: boolean) => (
    <ContactRow
      key={contactKey(card)}
      card={card}
      active={card === selected}
      ownAccount={ownAccount}
      book={book}
      picking={
        group
          ? undefined
          : {
              on: picking,
              selected: picked.has(contactKey(card)),
              onPick: (shift) => onPick(contactKey(card), shift),
            }
      }
    />
  );

  return (
    <>
      {groups.length > 0 || !searching ? (
        <div>
          <div className="flex items-center px-3 pt-2 pb-1">
            <span className="flex-1 text-[12px] font-medium text-muted">{m.contacts_groups()}</span>
            {!searching ? (
              <Link
                to="/contacts"
                search={{ id: "new-group", edit: true, book }}
                aria-label={m.contacts_group_new()}
                title={m.contacts_group_new()}
                className="flex size-6 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg"
              >
                <Plus size={15} />
              </Link>
            ) : null}
          </div>
          <ul aria-label={m.contacts_groups()} className="m-0 flex list-none flex-col gap-0.5 p-0">
            {[...groups]
              .sort((a, b) => sortKey(a).localeCompare(sortKey(b), "de"))
              .map((group) => row(group, true))}
          </ul>
        </div>
      ) : null}
      {byLetter(contacts).map(([letter, cards]) => (
        <div key={letter}>
          <div className="px-3 pt-2 pb-1 text-[12px] font-medium text-muted">{letter}</div>
          <ul aria-label={letter} className="m-0 flex list-none flex-col gap-0.5 p-0">
            {cards.map((card) => row(card, false))}
          </ul>
        </div>
      ))}
    </>
  );
};
