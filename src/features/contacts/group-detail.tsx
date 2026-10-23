/** A contact group: its members, a mail to all of them, editing. */
import { Link } from "@tanstack/react-router";
import { ChevronLeft, Mail, Pencil, Users } from "lucide-react";
import { useSession } from "@/components/shell/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CAPABILITIES } from "@/jmap/client";
import { formatAddressInput } from "@/lib/addresses";
import { groupAddresses, membersOf } from "@/lib/groups";
import { company, fullName, primaryEmail } from "@/lib/jscontact";
import { m } from "@/paraglide/messages";
import { type BookRef, bookOf, type Contact, useContactsAccountId } from "./queries";

type Props = { group: Contact; contacts: Contact[]; books: BookRef[] };

export const GroupDetail = ({ group, contacts, books }: Props) => {
  const { data: session } = useSession();
  const ownAccount = useContactsAccountId();
  const mailAccountId = session?.primaryAccounts[CAPABILITIES.mail];
  const sameAccount = contacts.filter((card) => card.accountId === group.accountId);
  const members = membersOf(group, sameAccount);
  const addresses = groupAddresses(group, sameAccount);
  const book = bookOf(books, group);

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-7 px-4 pt-3 pb-10 md:px-10 md:pt-9">
      <Link
        to="/contacts"
        search={(prev) => ({ book: prev.book })}
        className="flex items-center gap-1 text-[14px] text-muted no-underline md:hidden"
      >
        <ChevronLeft size={18} /> {m.contacts_title()}
      </Link>
      <header className="flex flex-wrap items-center gap-5">
        <span className="flex size-16 items-center justify-center rounded-full bg-primary text-onprimary">
          <Users size={26} />
        </span>
        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
          <h2 className="m-0 text-[26px] font-semibold tracking-tight">{fullName(group)}</h2>
          <span className="text-muted">{m.contacts_group_count({ count: members.length })}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {addresses.length > 0 && mailAccountId ? (
            <Button asChild variant="primary">
              <Link
                to="/mail/$accountId/$mailboxId"
                params={{ accountId: mailAccountId, mailboxId: "inbox" }}
                search={{ compose: "new", to: formatAddressInput(addresses) }}
              >
                <Mail size={15} /> {m.contacts_group_mail_all()}
              </Link>
            </Button>
          ) : null}
          {book?.mayWrite ? (
            <Button asChild variant="ghost">
              <Link to="/contacts" search={(prev) => ({ ...prev, edit: true })}>
                <Pencil size={15} /> {m.contacts_edit()}
              </Link>
            </Button>
          ) : null}
        </div>
      </header>
      <section className="flex flex-col gap-2">
        <h3 className="m-0 border-b border-border pb-2 text-[14px] font-semibold">
          {m.contacts_group_members()}
        </h3>
        {members.length === 0 ? (
          <p className="m-0 text-[14px] text-muted">{m.contacts_group_no_members()}</p>
        ) : (
          <ul aria-label={m.contacts_group_members()} className="m-0 flex list-none flex-col p-0">
            {members.map((member) => (
              <li key={member.id} className="border-b border-border last:border-0">
                <Link
                  to="/contacts"
                  search={(prev) => ({
                    book: prev.book,
                    id: member.id,
                    account: member.accountId === ownAccount ? undefined : member.accountId,
                  })}
                  className="flex items-center gap-3 py-2.5 text-fg no-underline"
                >
                  <Avatar name={fullName(member)} size={32} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{fullName(member)}</span>
                    <span className="truncate text-[13px] text-muted">
                      {[company(member), primaryEmail(member)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
