/**
 * "Neue Nachricht": a direct conversation with one or a few colleagues, or a named channel with
 * chosen members, either of them confidential (end-to-end encrypted). Also changes the name and
 * the members of a channel.
 */
import { Check, Search } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ColleagueAvatar } from "@/features/photos/colleague-avatar";
import { type Channel, channelName, type Person } from "@/lib/chat";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";

type Mode = "direct" | "channel";

type Props = {
  people: Person[];
  me: string;
  /** The channel to change; a new conversation or channel when left out. */
  channel?: Channel;
  onClose: () => void;
  onDirect: (members: string[], confidential: boolean) => Promise<Channel>;
  onCreate: (name: string, members: string[], confidential: boolean) => Promise<Channel>;
  onUpdate: (id: string, name: string, members: string[]) => Promise<Channel>;
  onOpen: (channel: Channel) => void;
};

const PersonPicker = ({
  people,
  chosen,
  onToggle,
}: {
  people: Person[];
  chosen: string[];
  onToggle: (id: string) => void;
}) => {
  const [filter, setFilter] = useState("");
  const shown = people.filter((person) =>
    person.name.toLocaleLowerCase("de-DE").includes(filter.toLocaleLowerCase("de-DE")),
  );
  return (
    <div className="flex flex-col gap-2">
      <label className="flex h-10 items-center gap-2 rounded-[9px] border border-border px-3 text-muted focus-within:border-muted">
        <Search size={15} aria-hidden="true" />
        <span className="sr-only">{m.chat_find_people()}</span>
        <input
          value={filter}
          placeholder={m.chat_find_people()}
          onChange={(event) => setFilter(event.target.value)}
          className="flex-1 bg-transparent text-[14px] text-fg outline-none"
        />
      </label>
      <fieldset className="m-0 flex max-h-64 flex-col gap-px overflow-y-auto border-0 p-0">
        <legend className="sr-only">{m.chat_people()}</legend>
        {shown.map((person) => {
          const on = chosen.includes(person.id);
          return (
            <label
              key={person.id}
              className={cn(
                "flex h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-[14px] md:h-10",
                on ? "bg-subtle" : "hover:bg-hover",
              )}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={on}
                onChange={() => onToggle(person.id)}
              />
              <ColleagueAvatar id={person.id} name={person.name} size={26} />
              <span className="flex-1">{person.name}</span>
              {on ? <Check size={16} className="text-accent" aria-hidden="true" /> : null}
            </label>
          );
        })}
      </fieldset>
    </div>
  );
};

export const ChatDialog = ({
  people,
  me,
  channel,
  onClose,
  onDirect,
  onCreate,
  onUpdate,
  onOpen,
}: Props) => {
  const toast = useToast();
  const nameId = useId();
  const editing = Boolean(channel);
  const [mode, setMode] = useState<Mode>(editing ? "channel" : "direct");
  const [name, setName] = useState(channel?.name ?? "");
  const [chosen, setChosen] = useState<string[]>(
    channel?.members.filter((member) => member !== me) ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [confidential, setConfidential] = useState(false);
  const others = people.filter((person) => person.id !== me);
  const toggle = (id: string) =>
    setChosen((current) =>
      current.includes(id) ? current.filter((other) => other !== id) : [...current, id],
    );

  const ready = mode === "direct" ? chosen.length > 0 : channelName(name).length > 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setBusy(true);
    try {
      const result = channel
        ? await onUpdate(channel.id, name, [me, ...chosen])
        : mode === "direct"
          ? await onDirect(chosen, confidential)
          : await onCreate(name, chosen, confidential);
      onOpen(result);
      onClose();
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={editing ? m.chat_edit() : m.chat_new()}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        {editing ? null : (
          <div role="tablist" className="flex gap-0.5 rounded-[9px] bg-subtle p-[3px]">
            {(
              [
                ["direct", m.chat_new_direct()],
                ["channel", m.chat_new_channel()],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => setMode(value)}
                className={cn(
                  "h-8 flex-1 rounded-[7px] text-[13px]",
                  mode === value ? "bg-bg font-medium text-fg shadow-sm" : "text-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {mode === "channel" ? (
          <div className="flex flex-col gap-1.5 text-[12px] text-muted">
            <label htmlFor={nameId}>{m.chat_channel_name()}</label>
            <Input
              id={nameId}
              value={name}
              placeholder={m.chat_channel_name_example()}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
            {name && channelName(name) !== name ? (
              <span>{m.chat_channel_name_becomes({ name: channelName(name) })}</span>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] text-muted">
            {mode === "direct" ? m.chat_direct_with() : m.chat_members()}
          </span>
          <PersonPicker people={others} chosen={chosen} onToggle={toggle} />
        </div>
        {editing ? null : (
          <label className="flex items-start gap-2.5 text-[14px]">
            <input
              type="checkbox"
              checked={confidential}
              onChange={(event) => setConfidential(event.target.checked)}
              className="mt-0.5 size-4 accent-[var(--primary)]"
            />
            <span className="flex flex-col gap-0.5">
              {m.chat_confidential_toggle()}
              <span className="text-[12px] text-muted">{m.chat_confidential_toggle_hint()}</span>
            </span>
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {m.chat_cancel()}
          </Button>
          <Button type="submit" variant="primary" disabled={!ready || busy}>
            {editing ? m.chat_save() : mode === "direct" ? m.chat_start() : m.chat_create()}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
