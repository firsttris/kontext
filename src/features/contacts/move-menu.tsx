/**
 * "Verschieben nach …": one contact (its pane) or the picked ones (the selection bar) into another
 * address book of the same account. Not shown where there is nowhere to move to or the user may
 * not take them out (lib/contact-selection.ts `moveTargets`).
 */
import { FolderInput } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { moveTargets } from "@/lib/contact-selection";
import { m } from "@/paraglide/messages";
import { type BookRef, bookLabel, type Contact, useContactMutations } from "./queries";

type Props = {
  cards: Contact[];
  books: BookRef[];
  /** In the selection bar: the icon alone, as its other buttons. */
  compact?: boolean;
  onMoved?: () => void;
};

export const MoveMenu = ({ cards, books, compact = false, onMoved }: Props) => {
  const { moveMany } = useContactMutations();
  const toast = useToast();
  const targets = moveTargets(cards, books);
  if (!targets.length) return null;

  const move = async (book: BookRef) => {
    try {
      await moveMany.mutateAsync({ cards, book });
      toast.show(m.contacts_moved({ book: bookLabel(book) }));
      onMoved?.();
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  return (
    <MenuRoot>
      <MenuTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? "iconSm" : undefined}
          aria-label={m.contacts_move()}
          title={m.contacts_move()}
          disabled={moveMany.isPending}
        >
          <FolderInput size={15} strokeWidth={1.75} />
          {compact ? null : m.contacts_move()}
        </Button>
      </MenuTrigger>
      <MenuContent>
        {targets.map((book) => (
          <MenuItem key={book.key} onSelect={() => void move(book)}>
            {bookLabel(book)}
          </MenuItem>
        ))}
      </MenuContent>
    </MenuRoot>
  );
};
