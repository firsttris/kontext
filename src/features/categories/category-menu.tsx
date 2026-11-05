/** "Kategorie" in the toolbar's "Weitere Aktionen": switch the mailbox's categories on the open mail. */
import { Tag } from "lucide-react";
import {
  MenuCheckboxItem,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
} from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import type { EmailSummary } from "@/jmap/types";
import { COLOR_STYLES } from "@/lib/categories";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";
import { useEmailActions } from "../mail/actions";
import { useCategories } from "./queries";

/**
 * A submenu of an open menu. Editing opens a dialog through `onEdit`: the dialog lives with the
 * caller, since the menu and all in it go away when it closes.
 */
export const CategorySubmenu = ({
  accountId,
  email,
  onEdit,
}: {
  accountId: string;
  email: EmailSummary;
  onEdit: () => void;
}) => {
  const categories = useCategories(accountId);
  const actions = useEmailActions(accountId);
  const toast = useToast();

  const toggle = async (keyword: string, on: boolean) => {
    try {
      await actions.setCategory([email.id], keyword, on);
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  return (
    <MenuSub>
      <MenuSubTrigger>
        <Tag size={16} /> {m.categories_menu()}
      </MenuSubTrigger>
      <MenuSubContent aria-label={m.categories_menu()}>
        {categories.map((category) => (
          <MenuCheckboxItem
            key={category.keyword}
            checked={Boolean(email.keywords[category.keyword])}
            onCheckedChange={(on) => void toggle(category.keyword, on)}
          >
            <span
              aria-hidden="true"
              className={cn("size-2.5 rounded-full", COLOR_STYLES[category.color].dot)}
            />
            {category.name}
          </MenuCheckboxItem>
        ))}
        {categories.length ? <MenuSeparator /> : null}
        <MenuItem onSelect={onEdit}>{m.categories_edit()}</MenuItem>
      </MenuSubContent>
    </MenuSub>
  );
};
