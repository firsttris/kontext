/** The toolbar's "Kategorie" menu: switch the mailbox's categories on the open mail. */
import { Tag } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import type { EmailSummary } from "@/jmap/types";
import { COLOR_STYLES } from "@/lib/categories";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";
import { useEmailActions } from "../mail/queries";
import { CategoryDialog } from "./category-dialog";
import { useCategories } from "./queries";

export const CategoryMenu = ({
  accountId,
  mailbox,
  email,
}: {
  accountId: string;
  /** "info@" or the own address, for the editing dialog. */
  mailbox: string;
  email: EmailSummary;
}) => {
  const categories = useCategories(accountId);
  const actions = useEmailActions(accountId);
  const toast = useToast();
  const [editing, setEditing] = useState(false);

  const toggle = async (keyword: string, on: boolean) => {
    try {
      await actions.setCategory([email.id], keyword, on);
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  return (
    <>
      <MenuRoot>
        <MenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={m.categories_menu()}
            title={m.categories_menu()}
          >
            <Tag size={16} />
          </Button>
        </MenuTrigger>
        <MenuContent align="start">
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
          <MenuItem onSelect={() => setEditing(true)}>{m.categories_edit()}</MenuItem>
        </MenuContent>
      </MenuRoot>
      {editing ? (
        <CategoryDialog accountId={accountId} mailbox={mailbox} onClose={() => setEditing(false)} />
      ) : null}
    </>
  );
};
