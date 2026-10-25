/**
 * Telefon: dial a number, and the calls through the telephone box – who, when, how it went, a
 * note – with "Zurückrufen" and the way to the contact. Missed ones can be shown alone.
 */
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PhoneIncoming, PhoneMissed, PhoneOutgoing } from "lucide-react";
import { type FormEvent, useState } from "react";
import { TabBar } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useChatNames } from "@/features/chat/use-chat-names";
import { useMe } from "@/features/tasks/queries";
import { cn } from "@/lib/cn";
import { listDate } from "@/lib/format";
import { outcomeText, type PhoneCall, readableNumber } from "@/lib/phone";
import { m } from "@/paraglide/messages";
import { soundLength } from "../../../server/phone/sounds";
import { PhoneStats } from "./phone-stats";
import { PhoneStatus } from "./phone-status";
import { usePhoneStore } from "./phone-store";
import { blockNumber, dialPhone, savePhoneNote, usePhone } from "./queries";
import { useCallerName } from "./use-caller";

const useDial = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { active } = usePhoneStore();
  const [busy, setBusy] = useState(false);
  const dial = async (number: string) => {
    if (active) return;
    setBusy(true);
    try {
      await dialPhone(queryClient, number);
    } catch (error) {
      toast.show(m.phone_failed({ message: (error as Error).message }), "error");
    } finally {
      setBusy(false);
    }
  };
  return { dial, busy: busy || Boolean(active) };
};

const iconOf = (call: PhoneCall) =>
  call.outcome === "missed" ? PhoneMissed : call.direction === "in" ? PhoneIncoming : PhoneOutgoing;

const Note = ({ call }: { call: PhoneCall }) => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState(call.note);
  const save = async () => {
    if (note === call.note) return;
    await savePhoneNote(queryClient, call.id, note);
    toast.show(m.phone_note_saved());
  };
  return (
    <input
      aria-label={m.phone_note()}
      placeholder={m.phone_note_placeholder()}
      value={note}
      onChange={(event) => setNote(event.target.value)}
      onBlur={() => void save()}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[13px] text-muted outline-none hover:border-border focus:border-muted focus:text-fg"
    />
  );
};

/** "Sperren": the box turns the number away from now on (Firmenverwaltung lists and lifts it). */
const BlockButton = ({ number }: { number: string }) => {
  const toast = useToast();
  const [blocked, setBlocked] = useState(false);
  if (blocked) return <span className="text-[12px] text-muted">{m.phone_blocked()}</span>;
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-muted"
      onClick={async () => {
        try {
          await blockNumber(number);
          setBlocked(true);
          toast.show(m.phone_block_done({ number: readableNumber(number) }));
        } catch (error) {
          toast.show(m.common_error({ message: (error as Error).message }), "error");
        }
      }}
    >
      {m.phone_block()}
    </Button>
  );
};

const Row = ({
  call,
  onDial,
  canDial,
}: {
  call: PhoneCall;
  onDial: (number: string) => void;
  canDial: boolean;
}) => {
  const me = useMe();
  const { nameOf } = useChatNames();
  const caller = useCallerName(call.remote);
  const Icon = iconOf(call);
  const missed = call.outcome === "missed";
  return (
    <li className="flex items-start gap-3 border-b border-border px-1 py-3">
      <Icon
        size={16}
        aria-label={call.direction === "in" ? m.phone_incoming_label() : m.phone_outgoing_label()}
        className={cn("mt-1 shrink-0", missed ? "text-danger" : "text-muted")}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          {caller.contact ? (
            <Link
              to="/contacts"
              search={{ id: caller.contact.id, account: caller.contact.accountId }}
              className={cn(
                "truncate font-medium no-underline",
                missed ? "text-danger" : "text-fg",
              )}
            >
              {caller.name}
            </Link>
          ) : (
            <span className={cn("truncate font-medium", missed && "text-danger")}>
              {caller.name}
            </span>
          )}
          <time dateTime={call.startedAt} className="shrink-0 font-mono text-[12px] text-muted">
            {listDate(call.startedAt, new Date())}
          </time>
        </div>
        <span className="text-[13px] text-muted">
          {[
            caller.contact ? readableNumber(call.remote) : "",
            outcomeText(call, nameOf, me),
            call.line ?? "",
            call.topic ?? "",
            call.desk && call.direction === "out" ? m.phone_from_desk({ name: call.desk }) : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        {call.voicemailSeconds ? (
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="font-medium">
              {m.phone_voicemail({ length: soundLength(call.voicemailSeconds) })}
            </span>
            {/* biome-ignore lint/a11y/useMediaCaption: a caller's spoken message, no captions exist */}
            <audio
              controls
              preload="none"
              src={`/api/phone/calls/${encodeURIComponent(call.id)}/voicemail`}
              aria-label={m.phone_voicemail({ length: soundLength(call.voicemailSeconds) })}
              className="h-8 max-w-full"
            />
          </div>
        ) : null}
        {call.fax === "received" ? (
          <a
            href={`/api/phone/calls/${encodeURIComponent(call.id)}/fax`}
            target="_blank"
            rel="noreferrer"
            className="self-start text-[13px] text-accent no-underline hover:underline"
          >
            {m.phone_fax_open()}
          </a>
        ) : null}
        {call.callbackTaskId ? (
          <Link
            to="/tasks"
            search={{ task: call.callbackTaskId }}
            className="self-start text-[13px] text-accent no-underline hover:underline"
          >
            {m.phone_callback_task()}
          </Link>
        ) : null}
        {call.state === "ended" ? <Note call={call} /> : null}
      </div>
      <div className="flex flex-col items-end gap-1">
        {canDial && call.remote ? (
          <Button size="sm" variant="ghost" onClick={() => onDial(call.remote)}>
            {missed ? m.phone_call_back() : m.phone_dial()}
          </Button>
        ) : null}
        {call.direction === "in" && call.remote && call.outcome !== "blocked" ? (
          <BlockButton number={call.remote} />
        ) : null}
      </div>
    </li>
  );
};

export const PhonePage = () => {
  const { enabled, allowed, online, calls } = usePhone();
  const { dial, busy } = useDial();
  const [number, setNumber] = useState("");
  const [view, setView] = useState<"all" | "missed" | "stats">("all");
  const shown = view === "missed" ? calls.filter((call) => call.outcome === "missed") : calls;
  const canDial = allowed && online && !busy;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (number.trim()) void dial(number.trim());
  };
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[720px] flex-col gap-5 px-4 pt-4 pb-10 md:px-8 md:pt-9">
          <h1 className="m-0 text-[30px] leading-tight font-semibold tracking-tight md:text-[24px]">
            {m.phone_title()}
          </h1>
          {!enabled || !allowed ? (
            <p className="m-0 text-[14px] text-muted">{m.phone_not_allowed()}</p>
          ) : (
            <>
              <PhoneStatus />
              {online ? null : (
                <p role="status" className="m-0 rounded-lg bg-subtle px-3 py-2 text-[13px]">
                  {m.phone_offline()}
                </p>
              )}
              <form onSubmit={submit} className="flex gap-2">
                <Input
                  aria-label={m.phone_number()}
                  placeholder={m.phone_number()}
                  value={number}
                  onChange={(event) => setNumber(event.target.value)}
                  inputMode="tel"
                  autoComplete="tel"
                  className="flex-1"
                />
                <Button type="submit" variant="primary" disabled={!canDial || !number.trim()}>
                  {m.phone_dial()}
                </Button>
              </form>
              <div className="flex items-center gap-2">
                <h2 className="m-0 flex-1 text-[15px] font-semibold">
                  {view === "stats" ? m.phone_stats() : m.phone_recent()}
                </h2>
                {(
                  [
                    ["all", m.phone_all()],
                    ["missed", m.phone_missed_filter()],
                    ["stats", m.phone_stats()],
                  ] as const
                ).map(([id, label]) => (
                  <Button
                    key={id}
                    size="sm"
                    variant={view === id ? "subtle" : "ghost"}
                    aria-pressed={view === id}
                    onClick={() => setView(id)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              {view === "stats" ? (
                <PhoneStats />
              ) : shown.length ? (
                <ul aria-label={m.phone_recent()} className="m-0 list-none p-0">
                  {shown.map((call) => (
                    <Row key={call.id} call={call} onDial={(n) => void dial(n)} canDial={canDial} />
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-[14px] text-muted">{m.phone_empty()}</p>
              )}
            </>
          )}
        </div>
      </main>
      <TabBar />
    </div>
  );
};

/** "Anrufen" wherever a number stands (a contact): through Kontext when the box is there. */
export const usePhoneDial = () => {
  const { enabled, allowed, online } = usePhone();
  const { dial, busy } = useDial();
  return { available: enabled && allowed && online, dial, busy };
};
