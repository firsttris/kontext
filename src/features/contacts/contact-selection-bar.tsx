/**
 * Above the contacts list while contacts are picked: delete them (one question with the count),
 * add them to a group, or save them as one vCard file. Groups are offered only within the one
 * account all picked contacts are in, as members are named by uid there.
 */
import { Download, Trash2, UserPlus, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { groupTargets, withMembers } from "@/lib/contact-selection";
import { downloadText } from "@/lib/download";
import { fullName } from "@/lib/jscontact";
import { toVCardFile } from "@/lib/vcard";
import { m } from "@/paraglide/messages";
import { type BookRef, bookOf, type Contact, contactKey, useContactMutations } from "./queries";

const IconButton = ({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) => (
  <Button
    variant="ghost"
    size="iconSm"
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onClick}
  >
    {children}
  </Button>
);

type Props = {
  picked: Contact[];
  allPicked: boolean;
  onPickAll: () => void;
  onClear: () => void;
  /** All cards of the shown books, to find the groups. */
  cards: Contact[];
  books: BookRef[];
  /** After deleting, with the keys of the deleted cards (the open one may be among them). */
  onDeleted: (keys: Set<string>) => void;
};

export const ContactSelectionBar = ({
  picked,
  allPicked,
  onPickAll,
  onClear,
  cards,
  books,
  onDeleted,
}: Props) => {
  const { update, removeMany } = useContactMutations();
  const toast = useToast();
  const none = picked.length === 0;
  const targets = groupTargets(picked, cards, (group) => Boolean(bookOf(books, group)?.mayWrite));
  const failed = (error: unknown) =>
    toast.show(m.common_error({ message: (error as Error).message }), "error");

  const remove = async () => {
    const one = picked.length === 1;
    const question = one
      ? m.contacts_bulk_delete_confirm_one()
      : m.contacts_bulk_delete_confirm({ count: picked.length });
    if (!window.confirm(question)) return;
    try {
      await removeMany.mutateAsync(picked);
      onClear();
      onDeleted(new Set(picked.map(contactKey)));
      toast.show(
        one ? m.contacts_bulk_deleted_one() : m.contacts_bulk_deleted({ count: picked.length }),
      );
    } catch (error) {
      failed(error);
    }
  };

  const addTo = async (group: Contact) => {
    const { members, added } = withMembers(group, picked);
    const name = fullName(group);
    if (added === 0) return toast.show(m.contacts_bulk_grouped_none({ group: name }));
    try {
      await update.mutateAsync({ contact: group, card: { members } });
      toast.show(m.contacts_bulk_grouped({ count: added, group: name }));
    } catch (error) {
      failed(error);
    }
  };

  const exportAll = () =>
    downloadText(toVCardFile(picked), `${m.contacts_bulk_file()}.vcf`, "text/vcard");

  return (
    <div className="flex items-center gap-1">
      <label className="flex size-8 cursor-pointer items-center justify-center rounded-lg hover:bg-hover">
        <input
          type="checkbox"
          ref={(box) => {
            if (box) box.indeterminate = !allPicked && !none;
          }}
          checked={allPicked}
          aria-label={m.mail_select_all()}
          onChange={allPicked ? onClear : onPickAll}
          className="size-4 cursor-pointer accent-[var(--primary)]"
        />
      </label>
      <span className="min-w-0 flex-1 truncate text-[14px] font-medium" aria-live="polite">
        {picked.length === 1 ? m.mail_selected_one() : m.mail_selected({ count: picked.length })}
      </span>
      <MenuRoot>
        <MenuTrigger asChild>
          <Button
            variant="ghost"
            size="iconSm"
            aria-label={m.contacts_bulk_group()}
            title={m.contacts_bulk_group()}
            disabled={none}
          >
            <UserPlus size={15} strokeWidth={1.75} />
          </Button>
        </MenuTrigger>
        <MenuContent>
          {targets.length ? (
            targets.map((group) => (
              <MenuItem key={contactKey(group)} onSelect={() => void addTo(group)}>
                {fullName(group)}
              </MenuItem>
            ))
          ) : (
            <MenuItem disabled>{m.contacts_bulk_group_none()}</MenuItem>
          )}
        </MenuContent>
      </MenuRoot>
      <IconButton label={m.contacts_bulk_export()} disabled={none} onClick={exportAll}>
        <Download size={15} strokeWidth={1.75} />
      </IconButton>
      <IconButton
        label={m.contacts_bulk_delete()}
        disabled={none || removeMany.isPending}
        onClick={() => void remove()}
      >
        <Trash2 size={15} strokeWidth={1.75} />
      </IconButton>
      <IconButton label={m.mail_selection_clear()} onClick={onClear}>
        <X size={15} />
      </IconButton>
    </div>
  );
};
