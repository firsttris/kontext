/**
 * A meeting by link (/meet/<id>), signed in or not: colleagues join as themselves at any time;
 * guests give their name and wait until someone of the company is there (the page asks every
 * few seconds).
 */
import { useQuery } from "@tanstack/react-query";
import { Video } from "lucide-react";
import { type FormEvent, lazy, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { m } from "@/paraglide/messages";

const MeetingRoom = lazy(async () => ({ default: (await import("./meeting-room")).MeetingRoom }));

const WAIT_POLL_MS = 4000;

type Status = { running: boolean; signedIn: boolean } | "unavailable";
type Ticket = { token: string; url: string };

const fetchStatus = async (id: string): Promise<Status> => {
  const response = await fetch(`/api/meet/${encodeURIComponent(id)}`, {
    credentials: "same-origin",
  });
  if (response.status === 404) return "unavailable";
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as Status;
};

const join = async (id: string, name: string): Promise<Ticket> => {
  const response = await fetch(`/api/meet/${encodeURIComponent(id)}/join`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const result = (await response.json().catch(() => ({}))) as {
    token?: string;
    url?: string | null;
    error?: string;
  };
  if (!response.ok || !result.token) throw new Error(result.error ?? String(response.status));
  const own = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
  return { token: result.token, url: result.url ?? own };
};

const Lobby = ({
  status,
  onJoin,
  busy,
  left,
}: {
  status: Exclude<Status, "unavailable">;
  onJoin: (name: string) => void;
  busy: boolean;
  left: boolean;
}) => {
  const [name, setName] = useState("");
  const guest = !status.signedIn;
  const canJoin = status.signedIn || (status.running && name.trim().length > 0);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (canJoin) onJoin(name.trim());
  };
  return (
    <form onSubmit={submit} className="m-auto flex w-full max-w-[380px] flex-col gap-4">
      <p className="m-0 text-[14px] text-muted" role="status">
        {left
          ? m.meeting_left()
          : guest && !status.running
            ? m.meeting_waiting()
            : status.running
              ? m.meeting_ready()
              : m.meeting_hint()}
      </p>
      {guest ? (
        <Label>
          {m.meeting_your_name()}
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            maxLength={60}
            autoFocus
          />
        </Label>
      ) : null}
      <Button type="submit" variant="primary" size="lg" disabled={!canJoin || busy}>
        <Video size={16} />
        {left ? m.meeting_rejoin() : m.meeting_join()}
      </Button>
    </form>
  );
};

export const MeetingPage = ({ id }: { id: string }) => {
  const toast = useToast();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [left, setLeft] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data: status } = useQuery({
    queryKey: ["meet", id],
    queryFn: () => fetchStatus(id),
    // Waiting guests learn when the meeting begins.
    refetchInterval: ticket ? false : WAIT_POLL_MS,
  });

  const enter = async (name: string) => {
    setBusy(true);
    try {
      setTicket(await join(id, name));
      setLeft(false);
    } catch {
      toast.show(m.call_failed(), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex h-dvh flex-col gap-3 bg-bg p-3 text-fg safe-top safe-bottom md:p-5">
      <header className="flex shrink-0 items-center gap-2.5">
        <div
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-[9px] bg-primary text-[13px] font-semibold text-onprimary"
        >
          K
        </div>
        <h1 className="m-0 text-[16px] font-semibold">{m.meeting_title()}</h1>
      </header>
      {status === "unavailable" ? (
        <p className="m-auto text-[14px] text-muted">{m.meeting_unavailable()}</p>
      ) : ticket ? (
        <Suspense fallback={null}>
          <MeetingRoom
            url={ticket.url}
            token={ticket.token}
            onLeave={() => {
              setTicket(null);
              setLeft(true);
            }}
          />
        </Suspense>
      ) : status ? (
        <Lobby status={status} onJoin={(name) => void enter(name)} busy={busy} left={left} />
      ) : null}
    </main>
  );
};
