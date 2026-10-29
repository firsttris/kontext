/**
 * One line of the contacts list: a group, or a person with the box to pick it. Picking works as
 * in the mail list: the box, Shift/Ctrl on the line and, on phones, a long press.
 */
import { Link } from "@tanstack/react-router";
import { Users } from "lucide-react";
import type { MouseEvent } from "react";
import { Avatar } from "@/components/ui/avatar";
import { useLongPress } from "@/components/use-long-press";
import { useMediaQuery } from "@/components/use-media-query";
import { cn } from "@/lib/cn";
import { memberUids } from "@/lib/groups";
import { company, contactPhoto, fullName } from "@/lib/jscontact";
import { rowClick } from "@/lib/selection";
import { m } from "@/paraglide/messages";
import type { Contact } from "./queries";

/** How a person's line takes part in picking; groups are not picked. */
export type Picking = {
  /** Some contact is picked (or the phone's "Auswählen" is on): every line shows its box. */
  on: boolean;
  selected: boolean;
  /** Picks or drops the contact; with Shift, the range up to the last one picked. */
  onPick: (shift: boolean) => void;
};

type Props = {
  card: Contact;
  active: boolean;
  ownAccount: string | undefined;
  book: string | undefined;
  group: boolean;
  /** Absent for groups and while an editor is open. */
  picking?: Picking;
};

export const ContactRow = ({ card, active, ownAccount, book, group, picking }: Props) => {
  const phone = !useMediaQuery("(min-width: 768px)");
  const press = useLongPress(() => picking?.onPick(false));
  const boxShown = Boolean(picking && (picking.on || picking.selected));
  const onClick = (event: MouseEvent) => {
    // Only a finger's click ends a press; Enter (detail 0) still opens the contact.
    if (press.consumeClick() && event.detail > 0) return event.preventDefault();
    if (!picking) return;
    const does = rowClick({
      shift: event.shiftKey,
      ctrl: event.ctrlKey || event.metaKey,
      picking: picking.on,
      phone,
    });
    if (does === "open") return;
    event.preventDefault();
    picking.onPick(does === "range");
  };
  return (
    <li
      className={cn(
        "group flex rounded-[10px] hover:bg-hover",
        active && "bg-bg shadow-[0_0_0_1px_var(--border)]",
        picking?.selected && "bg-accent/8",
      )}
    >
      {picking ? (
        // Its own column beside the link, as in the mail list: a click a bit off the box still
        // picks and never opens the contact.
        // biome-ignore lint/a11y/noStaticElementInteractions: the checkbox inside is the control
        // biome-ignore lint/a11y/useKeyWithClickEvents: Space on the checkbox clicks it, which bubbles here
        <div
          onClick={(event) => picking.onPick(event.shiftKey)}
          className={cn(
            "w-8 shrink-0 cursor-pointer items-center justify-end pl-1",
            boxShown ? "flex" : "hidden md:flex",
          )}
        >
          <input
            type="checkbox"
            checked={picking.selected}
            readOnly
            aria-label={m.contacts_select({ name: fullName(card) })}
            className={cn(
              "size-4 cursor-pointer accent-[var(--primary)]",
              !boxShown && "opacity-35 group-hover:opacity-100 focus-visible:opacity-100",
            )}
          />
        </div>
      ) : null}
      <Link
        to="/contacts"
        search={{
          id: card.id,
          account: card.accountId === ownAccount ? undefined : card.accountId,
          book,
        }}
        aria-current={active ? "true" : undefined}
        onClick={onClick}
        {...(picking ? press.handlers : {})}
        className={cn(
          "flex min-w-0 flex-1 touch-pan-y items-center gap-3 py-2.5 pr-3 text-fg no-underline [-webkit-touch-callout:none]",
          picking && boxShown ? "pl-2" : picking ? "pl-3 md:pl-2" : "pl-3",
        )}
      >
        {group ? (
          <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-subtle text-muted">
            <Users size={16} />
          </span>
        ) : (
          <Avatar name={fullName(card)} photo={contactPhoto(card)} size={34} />
        )}
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{fullName(card)}</span>
          <span className="truncate text-[13px] text-muted">
            {group ? m.contacts_group_count({ count: memberUids(card).length }) : company(card)}
          </span>
        </span>
      </Link>
    </li>
  );
};
