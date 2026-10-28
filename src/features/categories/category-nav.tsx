/**
 * The sidebar's categories of the open mailbox: each one opens the search for its mails in that
 * mailbox, across folders ("in:info@ kategorie:…"); the pencil edits them.
 */
import { Link } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { type Category, COLOR_STYLES, categorySearch } from "@/lib/categories";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";
import { CategoryDialog } from "./category-dialog";
import { useCategories } from "./queries";

export const CategoryNav = ({
  accountId,
  mailbox,
  activeQuery,
  navClass,
}: {
  accountId: string;
  /** The mailbox's address. */
  mailbox: string;
  /** The search that is open, to mark its category. */
  activeQuery: string | undefined;
  navClass: (active: boolean) => string;
}) => {
  const categories = useCategories(accountId);
  const [editing, setEditing] = useState(false);
  const query = (category: Category) => categorySearch(category, mailbox);
  return (
    <nav aria-label={m.categories_title()} className="flex flex-col gap-px">
      <div className="flex items-center pr-1 pb-1.5 pl-2.5">
        <span className="flex-1 text-[12px] font-medium text-muted">{m.categories_title()}</span>
        <button
          type="button"
          aria-label={m.categories_edit()}
          title={m.categories_edit()}
          onClick={() => setEditing(true)}
          className="flex size-6 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg"
        >
          <Pencil size={13} />
        </button>
      </div>
      {categories.map((category) => (
        <Link
          key={category.keyword}
          to="/mail/$accountId/$mailboxId"
          params={{ accountId: "all", mailboxId: "search" }}
          search={{ q: query(category) }}
          aria-label={m.categories_show({ name: category.name })}
          aria-current={activeQuery === query(category) ? "page" : undefined}
          className={cn(navClass(activeQuery === query(category)), "h-8")}
        >
          <span
            aria-hidden="true"
            className={cn("ml-[3px] size-2.5 rounded-full", COLOR_STYLES[category.color].dot)}
          />
          <span className="truncate">{category.name}</span>
        </Link>
      ))}
      {editing ? (
        <CategoryDialog accountId={accountId} mailbox={mailbox} onClose={() => setEditing(false)} />
      ) : null}
    </nav>
  );
};
