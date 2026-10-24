/** The categories of a mail as small coloured chips; in the list only the first few. */
import { type Category, COLOR_STYLES } from "@/lib/categories";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";

export const CategoryChip = ({
  category,
  className,
}: {
  category: Category;
  className?: string;
}) => (
  <span
    className={cn(
      "inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full px-1.5 text-[11px] font-medium",
      COLOR_STYLES[category.color].chip,
      className,
    )}
  >
    <span
      aria-hidden="true"
      className={cn("size-1.5 rounded-full", COLOR_STYLES[category.color].dot)}
    />
    {category.name}
  </span>
);

export const CategoryChips = ({ categories, max }: { categories: Category[]; max?: number }) => {
  if (!categories.length) return null;
  const shown = max ? categories.slice(0, max) : categories;
  const hidden = categories.length - shown.length;
  return (
    <span className="flex min-w-0 shrink-0 items-center gap-1">
      {shown.map((category) => (
        <CategoryChip key={category.keyword} category={category} />
      ))}
      {hidden > 0 ? (
        <span
          title={categories
            .slice(shown.length)
            .map((category) => category.name)
            .join(", ")}
          className="text-[11px] text-muted"
        >
          {m.categories_more({ count: hidden })}
        </span>
      ) : null}
    </span>
  );
};
