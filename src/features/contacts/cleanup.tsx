/**
 * "Zusammenführen und korrigieren", as in Google Contacts: duplicate contacts to merge and names
 * to spell properly. What the user ignores stays ignored on this device.
 */
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronLeft } from "lucide-react";
import { storedSet } from "@/components/stored-set";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  type DuplicateReason,
  type DuplicateSet,
  duplicateSetKey,
  findDuplicates,
  mergeCards,
} from "@/lib/contact-duplicates";
import { type NameFix, nameFixes } from "@/lib/contact-fixes";
import { isGroup } from "@/lib/groups";
import { company, contactPhoto, fullName, primaryEmail, primaryPhone } from "@/lib/jscontact";
import { m } from "@/paraglide/messages";
import {
  type BookRef,
  bookLabel,
  bookOf,
  type Contact,
  contactKey,
  useContactMutations,
  useContacts,
} from "./queries";

const ignored = storedSet("kontext.contactsIgnored");

const fixKey = (fix: NameFix<Contact>) => `fix:${contactKey(fix.card)}:${fix.after}`;

/** The suggestions for cards the user may change, without the ignored ones. */
export const useCleanup = () => {
  const { data: contacts, books, isPending } = useContacts();
  const skip = ignored.useSet();
  const writable = (card: Contact) => Boolean(bookOf(books, card)?.mayWrite);
  const duplicates = findDuplicates(contacts).filter(
    (set) => set.cards.every(writable) && !skip.has(duplicateSetKey(set.cards)),
  );
  const fixes = nameFixes(contacts.filter(writable)).filter((fix) => !skip.has(fixKey(fix)));
  return { contacts, books, duplicates, fixes, isPending };
};

const REASONS: Record<DuplicateReason, () => string> = {
  email: m.contacts_duplicate_email,
  phone: m.contacts_duplicate_phone,
  name: m.contacts_duplicate_name,
};

const sectionTitle = "m-0 border-b border-border pb-2 text-[14px] font-semibold";

export const Cleanup = () => {
  const { contacts, books, duplicates, fixes, isPending } = useCleanup();
  const { merge, update } = useContactMutations();
  const toast = useToast();
  const busy = merge.isPending || update.isPending;
  const groupsOf = (accountId: string) =>
    contacts.filter((card) => isGroup(card) && card.accountId === accountId);

  const run = async (work: () => Promise<string>) => {
    try {
      toast.show(await work());
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };
  const mergeSets = (sets: DuplicateSet<Contact>[]) => {
    const accounts = [...new Set(sets.map((set) => set.cards[0]!.accountId))];
    // One call per account: the sets of an account share its groups.
    return Promise.all(
      accounts.map((accountId) =>
        merge.mutateAsync({
          sets: sets.filter((set) => set.cards[0]!.accountId === accountId).map((s) => s.cards),
          groups: groupsOf(accountId),
        }),
      ),
    );
  };
  const mergeOne = async (set: DuplicateSet<Contact>) => {
    await mergeSets([set]);
    return m.contacts_merged({ name: fullName(mergeCards(set.cards).keep) });
  };
  const mergeAll = async () => {
    await mergeSets(duplicates);
    return m.contacts_merged_all({ count: duplicates.length });
  };
  const fix = async (item: NameFix<Contact>) => {
    await update.mutateAsync({ contact: item.card, card: { name: item.name } });
    return m.contacts_fixed({ name: item.after });
  };

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-7 px-4 pt-3 pb-10 md:px-10 md:pt-9">
      <Link
        to="/contacts"
        search={{}}
        className="flex items-center gap-1 text-[14px] text-muted no-underline md:hidden"
      >
        <ChevronLeft size={18} /> {m.contacts_title()}
      </Link>
      <h2 className="m-0 text-[24px] font-semibold tracking-tight">{m.contacts_cleanup()}</h2>
      {isPending ? (
        <p className="m-0 text-[14px] text-muted">{m.common_loading()}</p>
      ) : duplicates.length === 0 && fixes.length === 0 ? (
        <p className="m-0 text-[14px] text-muted">{m.contacts_cleanup_none()}</p>
      ) : null}
      {duplicates.length > 0 ? (
        <section aria-label={m.contacts_duplicates()} className="flex flex-col gap-3">
          <div className="flex items-center gap-3 border-b border-border pb-2">
            <h3 className="m-0 flex-1 text-[14px] font-semibold">{m.contacts_duplicates()}</h3>
            {duplicates.length > 1 ? (
              <Button size="sm" disabled={busy} onClick={() => void run(mergeAll)}>
                {m.contacts_merge_all()}
              </Button>
            ) : null}
          </div>
          <p className="m-0 text-[13px] text-muted">{m.contacts_duplicates_info()}</p>
          {duplicates.map((set) => (
            <DuplicateCard
              key={duplicateSetKey(set.cards)}
              set={set}
              books={books}
              busy={busy}
              onMerge={() => void run(() => mergeOne(set))}
              onIgnore={() => ignored.set(duplicateSetKey(set.cards), true)}
            />
          ))}
        </section>
      ) : null}
      {fixes.length > 0 ? (
        <section aria-label={m.contacts_fixes()} className="flex flex-col gap-2">
          <h3 className={sectionTitle}>{m.contacts_fixes()}</h3>
          <ul className="m-0 flex list-none flex-col p-0">
            {fixes.map((item) => (
              <li
                key={fixKey(item)}
                aria-label={item.before}
                className="flex flex-wrap items-center gap-3 border-b border-border py-2.5 last:border-0"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate text-muted">{item.before}</span>
                  <ArrowRight size={14} className="shrink-0 text-muted" />
                  <span className="truncate font-medium">{item.after}</span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => ignored.set(fixKey(item), true)}>
                  {m.contacts_ignore()}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy}
                  onClick={() => void run(() => fix(item))}
                >
                  {m.contacts_fix()}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
};

type DuplicateCardProps = {
  set: DuplicateSet<Contact>;
  books: BookRef[];
  busy: boolean;
  onMerge: () => void;
  onIgnore: () => void;
};

const DuplicateCard = ({ set, books, busy, onMerge, onIgnore }: DuplicateCardProps) => {
  const title = fullName(mergeCards(set.cards).keep);
  return (
    <article aria-label={title} className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <header className="flex flex-col gap-0.5">
        <span className="font-semibold">{title}</span>
        <span className="text-[13px] text-muted">
          {m.contacts_duplicate_title({ count: set.cards.length })} ·{" "}
          {set.reasons.map((reason) => REASONS[reason]()).join(", ")}
        </span>
      </header>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {set.cards.map((card) => {
          const book = bookOf(books, card);
          const facts = [company(card), primaryEmail(card), primaryPhone(card)]
            .filter((fact) => fact && fact !== fullName(card))
            .join(" · ");
          return (
            <li key={contactKey(card)} className="flex items-center gap-3">
              <Avatar name={fullName(card)} photo={contactPhoto(card)} size={30} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[14px]">{fullName(card)}</span>
                <span className="truncate text-[12px] text-muted">
                  {[facts, book ? bookLabel(book) : ""].filter(Boolean).join(" · ")}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onIgnore}>
          {m.contacts_ignore()}
        </Button>
        <Button size="sm" variant="primary" disabled={busy} onClick={onMerge}>
          {m.contacts_merge()}
        </Button>
      </div>
    </article>
  );
};
