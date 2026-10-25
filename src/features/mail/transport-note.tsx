/** Whether a mail came to the own server encrypted, beside "Details anzeigen" (src/lib/transport.ts). */
import { Lock, LockOpen } from "lucide-react";
import { transportOf } from "@/lib/transport";
import { m } from "@/paraglide/messages";

export const TransportNote = ({ received }: { received: string[] | null }) => {
  const transport = transportOf(received);
  if (!transport) return null;
  return transport === "encrypted" ? (
    <span
      className="flex items-center gap-1 text-[12px] text-muted"
      title={m.mail_transport_tls_hint()}
    >
      <Lock size={12} aria-hidden="true" />
      {m.mail_transport_tls()}
    </span>
  ) : (
    <span
      className="flex items-center gap-1 text-[12px] text-warn"
      title={m.mail_transport_plain_hint()}
    >
      <LockOpen size={12} aria-hidden="true" />
      {m.mail_transport_plain()}
    </span>
  );
};
