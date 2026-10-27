/** The list of the contacts column: groups first, then the contacts by letter. */
import { Link } from "@tanstack/react-router";
import { Plus, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { memberUids } from "@/lib/groups";
import { company, contactPhoto, fullName, indexLetter, sortKey } from "@/lib/jscontact";
import { m } from "@/paraglide/messages";
import { type Contact, contactKey } from "./queries";

type Props = {
  groups: Contact[];
  contacts: Contact[];
  selected: Contact | undefined;
  ownAccount: string | undefined;
  book: string | undefined;
  /** While searching, the group section only shows matches and no "Neue Gruppe". */
  searching: boolean;
};

const byLetter = (contacts: Contact[]): [string, Contact[]][] => {
  const sorted = [...contacts].sort((a, b) => sortKey(a).localeCompare(sortKey(b), "de"));
  const letters = new Map<string, Contact[]>();
  for (const card of sorted) {
    const letter = indexLetter(card);
    letters.set(letter, [...(letters.get(letter) ?? []), card]);
  }
  return [...letters.entries()];
};

export const ContactList = ({ groups, contacts, selected, ownAccount, book, searching }: Props) => {
  const row = (card: Contact, group: boolean) => (
    <li key={contactKey(card)}>
      <Link
        to="/contacts"
        search={{
          id: card.id,
          account: card.accountId === ownAccount ? undefined : card.accountId,
          book,
        }}
        aria-current={card === selected ? "true" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-fg no-underline hover:bg-hover",
          card === selected && "bg-bg shadow-[0_0_0_1px_var(--border)]",
        )}
      >
        {group ? (
          <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-subtle text-muted">
            <Users size={16} />
          </span>
        ) : (
          <Avatar name={fullName(card)} photo={contactPhoto(card)} size={34} />
        )}
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{fullName(card)}</span>
          <span className="truncate text-[13px] text-muted">
            {group ? m.contacts_group_count({ count: memberUids(card).length }) : company(card)}
          </span>
        </span>
      </Link>
    </li>
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
