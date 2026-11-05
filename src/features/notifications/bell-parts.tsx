/** What the bell's sections share: the section, the row's look and the day of an appointment. */
import type { ReactNode } from "react";
import { LOCALE } from "@/lib/locale";

export const dayFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: "Europe/Berlin",
  weekday: "short",
  day: "numeric",
  month: "short",
});

export const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section aria-label={title} className="flex flex-col gap-0.5">
    <h3 className="m-0 px-2 pt-1 pb-1 text-[11px] font-medium tracking-wide text-muted uppercase">
      {title}
    </h3>
    {children}
  </section>
);

export const row =
  "flex items-start gap-3 rounded-lg px-2 py-2 text-[13px] text-fg no-underline hover:bg-hover";
