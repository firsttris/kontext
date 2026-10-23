/** Creating and editing a contact. */
import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { type ContactForm, emptyContactForm, formToCard, fullName, toForm } from "@/lib/jscontact";
import { m } from "@/paraglide/messages";
import { type BookRef, bookLabel, type Contact, startBook, useContactMutations } from "./queries";

type Props = {
  card?: Contact;
  books: BookRef[];
  /** The address book shown in the list; a new contact goes there when the user may write. */
  preferredBook?: string;
};

export const ContactEditor = ({ card, books, preferredBook }: Props) => {
  const [form, setForm] = useState<ContactForm>(card ? toForm(card) : emptyContactForm);
  const writable = books.filter((book) => book.mayWrite);
  const [bookKey, setBookKey] = useState(() => startBook(writable, preferredBook));
  const { create, update, remove } = useContactMutations();
  const navigate = useNavigate();
  const toast = useToast();
  const set = (key: keyof ContactForm) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.given.trim() && !form.surname.trim() && !form.company.trim()) {
      toast.show(m.contacts_name_missing(), "error");
      return;
    }
    try {
      if (card) {
        await update.mutateAsync({ contact: card, card: formToCard(form, card) });
        await navigate({ to: "/contacts", search: (prev) => ({ ...prev, edit: undefined }) });
      } else {
        const book = writable.find((b) => b.key === (bookKey || startBook(writable)));
        if (!book) throw new Error(m.contacts_book());
        const id = await create.mutateAsync({ card: formToCard(form), book });
        await navigate({
          to: "/contacts",
          search: (prev) => ({
            book: prev.book,
            id,
            account: book.isPersonal ? undefined : book.accountId,
          }),
        });
      }
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  const destroy = async () => {
    if (!card || !window.confirm(m.contacts_delete_confirm({ name: fullName(card) }))) return;
    try {
      await remove.mutateAsync(card);
      await navigate({ to: "/contacts", search: (prev) => ({ book: prev.book }) });
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  const cancel = () =>
    navigate({
      to: "/contacts",
      search: (prev) => (card ? { ...prev, edit: undefined } : { book: prev.book }),
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
        {card ? fullName(card) : m.contacts_new()}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {!card && writable.length > 1 ? (
          <Label className="sm:col-span-2">
            {m.contacts_book()}
            <Select
              aria-label={m.contacts_book()}
              value={bookKey}
              onChange={(e) => setBookKey(e.target.value)}
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
          {m.contacts_given()}
          <Input value={form.given} onChange={set("given")} autoFocus={!card} autoComplete="off" />
        </Label>
        <Label>
          {m.contacts_surname()}
          <Input value={form.surname} onChange={set("surname")} autoComplete="off" />
        </Label>
        <Label className="sm:col-span-2">
          {m.contacts_company()}
          <Input value={form.company} onChange={set("company")} autoComplete="off" />
        </Label>
        <Label>
          {m.contacts_email()}
          <Input type="email" value={form.email} onChange={set("email")} autoComplete="off" />
        </Label>
        <Label>
          {m.contacts_phone()}
          <Input type="tel" value={form.phone} onChange={set("phone")} autoComplete="off" />
        </Label>
        <Label>
          {m.contacts_street()}
          <Input value={form.street} onChange={set("street")} autoComplete="off" />
        </Label>
        <Label>
          {m.contacts_city()}
          <Input value={form.city} onChange={set("city")} autoComplete="off" />
        </Label>
        <Label className="sm:col-span-2">
          {m.contacts_note()}
          <Textarea value={form.note} onChange={set("note")} />
        </Label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={create.isPending || update.isPending}>
          {m.contacts_save()}
        </Button>
        <Button variant="ghost" onClick={() => cancel()}>
          {m.contacts_cancel()}
        </Button>
        <div className="flex-1" />
        {card ? (
          <Button variant="danger" onClick={() => void destroy()}>
            {m.contacts_delete()}
          </Button>
        ) : null}
      </div>
    </form>
  );
};
