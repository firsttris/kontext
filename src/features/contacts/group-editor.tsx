/** Create or change a contact group: its name and which contacts of the book belong to it. */
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Search } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { groupToCard, isGroup, memberUids } from "@/lib/groups";
import { company, fullName, matchesSearch, sortKey } from "@/lib/jscontact";
import { m } from "@/paraglide/messages";
import {
  type BookRef,
  bookLabel,
  type Contact,
  startBook,
  useContactMutations,
  useContactsAccountId,
} from "./queries";

type Props = {
  group?: Contact;
  contacts: Contact[];
  books: BookRef[];
  preferredBook?: string;
};

export const GroupEditor = ({ group, contacts, books, preferredBook }: Props) => {
  const writable = books.filter((book) => book.mayWrite);
  const [bookKey, setBookKey] = useState(() => startBook(writable, preferredBook));
  const [name, setName] = useState(group ? fullName(group) : "");
  const [members, setMembers] = useState(() => new Set(group ? memberUids(group) : []));
  const [filter, setFilter] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const { create, update, remove } = useContactMutations();
  const navigate = useNavigate();
  const toast = useToast();
  const ownAccount = useContactsAccountId();
  const target = writable.find((book) => book.key === bookKey);
  // Members are referenced by uid, which is only unique within one account.
  const accountId = group?.accountId ?? target?.accountId;
  const candidates = contacts
    .filter((card) => card.accountId === accountId && !isGroup(card) && card.uid)
    .filter((card) => members.has(card.uid!) || matchesSearch(card, filter))
    .sort((a, b) => sortKey(a).localeCompare(sortKey(b), "de"));

  const toggle = (uid: string) =>
    setMembers((current) => {
      const next = new Set(current);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });

  const show = (card: { id: string; accountId: string }) =>
    navigate({
      to: "/contacts",
      search: (prev) => ({
        book: prev.book,
        id: card.id,
        account: card.accountId === ownAccount ? undefined : card.accountId,
      }),
    });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setProblem(m.contacts_group_name_missing());
      return;
    }
    const card = groupToCard(name, [...members]);
    try {
      if (group) {
        await update.mutateAsync({ contact: group, card });
        await show(group);
      } else {
        if (!target) throw new Error(m.contacts_book());
        const id = await create.mutateAsync({ card, book: target });
        await show({ id, accountId: target.accountId });
      }
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  const destroy = async () => {
    if (!group || !window.confirm(m.contacts_delete_confirm({ name: fullName(group) }))) return;
    try {
      await remove.mutateAsync(group);
      await navigate({ to: "/contacts", search: (prev) => ({ book: prev.book }) });
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  const cancel = () =>
    navigate({
      to: "/contacts",
      search: (prev) => (group ? { ...prev, edit: undefined } : { book: prev.book }),
    });

  return (
    <form
      onSubmit={submit}
      className="mx-auto flex max-w-[640px] flex-col gap-5 px-4 pt-3 pb-10 md:px-10 md:pt-9"
    >
      <button
        type="button"
        onClick={() => cancel()}
        className="flex items-center gap-1 self-start border-0 bg-transparent p-0 text-[14px] text-muted md:hidden"
      >
        <ChevronLeft size={18} /> {m.contacts_cancel()}
      </button>
      <h2 className="m-0 text-[24px] font-semibold tracking-tight">
        {group ? fullName(group) : m.contacts_group_new()}
      </h2>
      {!group && writable.length > 1 ? (
        <Label>
          {m.contacts_book()}
          <Select
            aria-label={m.contacts_book()}
            value={bookKey}
            onChange={(e) => {
              setBookKey(e.target.value);
              setMembers(new Set());
            }}
          >
            {writable.map((book) => (
              <option key={book.key} value={book.key}>
                {bookLabel(book)}
              </option>
            ))}
          </Select>
        </Label>
      ) : null}
      <Label>
        {m.contacts_group_name()}
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus={!group} />
      </Label>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1.5 p-0 text-[13px] text-muted">
          {m.contacts_group_members()} ({members.size})
        </legend>
        <label className="flex h-9 items-center gap-2 rounded-[9px] border border-border px-3 text-muted">
          <Search size={15} />
          <input
            type="search"
            aria-label={m.contacts_group_pick()}
            placeholder={m.contacts_group_pick()}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-fg outline-none"
          />
        </label>
        <ul className="m-0 flex max-h-[360px] list-none flex-col overflow-y-auto rounded-lg border border-border p-1">
          {candidates.map((card) => (
            <li key={card.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-hover">
                <input
                  type="checkbox"
                  checked={members.has(card.uid!)}
                  onChange={() => toggle(card.uid!)}
                  className="size-4 accent-[var(--accent)]"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{fullName(card)}</span>
                  {company(card) ? (
                    <span className="truncate text-[12px] text-muted">{company(card)}</span>
                  ) : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      {problem ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {problem}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={create.isPending || update.isPending}>
          {m.contacts_save()}
        </Button>
        <Button variant="ghost" onClick={() => cancel()}>
          {m.contacts_cancel()}
        </Button>
        <div className="flex-1" />
        {group ? (
          <Button variant="danger" onClick={() => void destroy()}>
            {m.contacts_group_delete()}
          </Button>
        ) : null}
      </div>
    </form>
  );
};
