import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { MailSearch } from "@/routes/_app/mail.$accountId.$mailboxId";

/** The three columns, and on a phone the one screen the URL asks for. */
export const MailLayout = ({
  search,
  sidebar,
  list,
  main,
}: {
  search: MailSearch;
  sidebar: ReactNode;
  list: ReactNode;
  main: ReactNode;
}) => {
  const screen = search.folders
    ? "folders"
    : search.compose
      ? "compose"
      : search.email
        ? "reader"
        : "list";
  return (
    <>
      <div
        className={cn(
          "h-full shrink-0 flex-col border-r border-border bg-side",
          screen === "folders" ? "flex w-full md:w-sidebar" : "hidden lg:flex lg:w-sidebar",
        )}
      >
        {sidebar}
      </div>
      <section
        aria-label="Nachrichtenliste"
        className={cn(
          "h-full w-full shrink-0 flex-col border-border md:w-[320px] md:border-r xl:w-[370px] 2xl:w-[400px]",
          screen === "list" ? "flex" : "hidden md:flex",
          screen === "folders" && "md:hidden lg:flex",
        )}
      >
        {list}
      </section>
      <main
        className={cn(
          "h-full min-w-0 flex-1 flex-col",
          screen === "reader" || screen === "compose" ? "flex" : "hidden md:flex",
        )}
      >
        {main}
      </main>
    </>
  );
};
