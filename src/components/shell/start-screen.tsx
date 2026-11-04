/**
 * What the app shows while it starts (the session check, the JMAP session, the first route): the
 * shape of the logged-in page – rail, sidebar, list and pane on a desktop, the list and the tab
 * bar on a phone – with bars in the place of the content. It needs no router, sign-in or data, so
 * main.tsx can show it before any of them exists; the `_app` route shows it while it is pending.
 */
import { Bar, ListPlaceholder, PlaceholderNav } from "@/components/ui/placeholder";

/** Pages without the app's frame: the sign-in and what people outside open from a link. */
const PUBLIC_PAGES = new Set(["login", "rsvp", "s", "meet", "agent-consent"]);

/**
 * Whether the path leads into the logged-in app, so the start screen has its shape. The demo's
 * path comes from the "#" and may carry its query.
 */
export const opensApp = (path: string): boolean => !PUBLIC_PAGES.has(path.split(/[/?#]/)[1] ?? "");

const TabBarPlaceholder = () => (
  <div
    aria-hidden="true"
    className="flex shrink-0 justify-around border-t border-border bg-bg px-3 pt-2 pb-2 safe-bottom md:hidden"
  >
    {Array.from({ length: 5 }, (_, index) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: fixed tabs without identity
      <div key={index} className="flex w-16 flex-col items-center gap-1.5">
        <Bar className="size-[22px] rounded-md" />
        <Bar className="h-2 w-10" />
      </div>
    ))}
  </div>
);

const RailPlaceholder = () => (
  <div
    aria-hidden="true"
    className="hidden h-full w-[60px] shrink-0 flex-col items-center gap-1.5 border-r border-border bg-side py-3.5 md:flex"
  >
    <div className="mb-3.5 flex size-8 items-center justify-center rounded-[9px] bg-primary text-[13px] font-semibold text-onprimary">
      K
    </div>
    {Array.from({ length: 5 }, (_, index) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: fixed buttons without identity
      <div key={index} className="flex size-10 items-center justify-center">
        <Bar className="size-[18px] rounded-md" />
      </div>
    ))}
  </div>
);

const SidebarPlaceholder = () => (
  <div
    aria-hidden="true"
    className="hidden h-full w-sidebar shrink-0 flex-col gap-5 border-r border-border bg-side px-3 py-4 lg:flex"
  >
    <Bar className="h-[38px] w-full rounded-lg" />
    <PlaceholderNav count={8} />
  </div>
);

/** The whole page's shape, in the columns of `AppShell` and `MailLayout`. */
export const StartScreen = () => (
  <div className="flex h-[var(--app-height,100dvh)] overflow-hidden bg-bg text-fg safe-top md:pt-0">
    <RailPlaceholder />
    <SidebarPlaceholder />
    <div className="flex h-full w-full shrink-0 flex-col border-border md:w-[320px] md:border-r xl:w-[370px] 2xl:w-[400px]">
      <ListPlaceholder footer={<TabBarPlaceholder />} />
    </div>
    <div className="hidden h-full min-w-0 flex-1 md:flex" />
  </div>
);
