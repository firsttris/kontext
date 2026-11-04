/**
 * Quiet stand-ins for what is still on its way: grey bars in the place of rows and folders, so a
 * page shows its shape instead of a blank or a lone "Lädt …". One `role="status"` per region
 * speaks the short text; the bars themselves are hidden from screen readers. The pulse is
 * `motion-safe` (and styles.css stops every animation under "reduce motion").
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";

export const Bar = ({ className }: { className?: string }) => (
  <span className={cn("block h-2.5 rounded-full bg-subtle motion-safe:animate-pulse", className)} />
);

/** Written out in full: Tailwind finds its classes in the source, not in built strings. */
const ROW_WIDTHS = [
  ["w-2/5", "w-3/4", "w-11/12"],
  ["w-1/3", "w-2/3", "w-4/5"],
  ["w-1/2", "w-3/5", "w-5/6"],
] as const;

/** Widths of a row's lines, varied by its place so the list doesn't look like a grid. */
export const rowWidths = (index: number, lines: number): string[] =>
  ROW_WIDTHS[index % ROW_WIDTHS.length]!.slice(0, lines);

/** Rows like the mail list's (sender and date, subject, preview); `lines` 2 for shorter ones. */
export const PlaceholderRows = ({ count = 8, lines = 3 }: { count?: number; lines?: number }) => (
  <ul aria-hidden="true" className="m-0 flex list-none flex-col p-0">
    {Array.from({ length: count }, (_, index) => {
      const [first = "", ...rest] = rowWidths(index, lines);
      return (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed rows without identity
        <li key={index} className="flex flex-col gap-2.5 rounded-[10px] px-3 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <Bar className={first} />
            <Bar className="w-10 shrink-0" />
          </div>
          {rest.map((width) => (
            <Bar key={width} className={width} />
          ))}
        </li>
      );
    })}
  </ul>
);

/** Folder lines of a sidebar. */
export const PlaceholderNav = ({ count = 6 }: { count?: number }) => (
  <div aria-hidden="true" className="flex flex-col gap-px">
    {Array.from({ length: count }, (_, index) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: fixed lines without identity
      <div key={index} className="flex h-[34px] items-center gap-2.5 px-2.5">
        <Bar className="size-4 rounded-[5px]" />
        <Bar className={index % 2 ? "w-20" : "w-28"} />
      </div>
    ))}
  </div>
);

/** A region that is loading: says so once to screen readers, shows the bars to the eye. */
export const Loading = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div role="status" className={className}>
    <span className="sr-only">{m.common_loading()}</span>
    {children}
  </div>
);

/**
 * The mail list's column before its folder is known: the header's shape and rows; `footer` is
 * the tab bar on a phone (the real one in the app, bars on the start screen).
 */
export const ListPlaceholder = ({ footer }: { footer?: ReactNode }) => (
  <div className="flex h-full min-h-0 w-full flex-col">
    <Loading className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div aria-hidden="true" className="flex flex-col gap-3 px-4 pt-3 pb-3 md:pt-4">
        <div className="flex h-8 items-center justify-between md:hidden">
          <Bar className="h-8 w-32" />
          <Bar className="size-8 rounded-[9px]" />
        </div>
        <Bar className="h-6 w-36 rounded-md md:h-4 md:w-28" />
        <Bar className="h-[42px] w-full rounded-xl md:h-9 md:rounded-[9px]" />
        <Bar className="h-[34px] w-40 rounded-[9px]" />
      </div>
      <div className="px-2">
        <PlaceholderRows />
      </div>
    </Loading>
    {footer}
  </div>
);
