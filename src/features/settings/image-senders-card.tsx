/** Settings: whose pictures from the internet load at once – contacts, addresses, domains. */
import { X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useImageSenders } from "@/features/mail/image-senders";
import { m } from "@/paraglide/messages";
import { CONTACTS } from "../../../server/images/senders";
import { SettingsCard } from "./settings-page";

export const ImageSendersCard = () => {
  const { senders, trust } = useImageSenders();
  const toast = useToast();
  const [entry, setEntry] = useState("");
  const contacts = senders.includes(CONTACTS);
  const run = (action: Promise<unknown>) =>
    void action.catch((error: Error) =>
      toast.show(m.common_error({ message: error.message }), "error"),
    );
  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!entry.trim()) return;
    run(trust(entry.trim()).then(() => setEntry("")));
  };
  const listed = senders.filter((sender) => sender !== CONTACTS);

  return (
    <SettingsCard title={m.images_title()} description={m.images_hint()}>
      <label className="flex items-center gap-2.5 text-[14px]">
        <input
          type="checkbox"
          checked={contacts}
          onChange={(event) => run(trust(CONTACTS, event.target.checked))}
          className="size-4 accent-[var(--primary)]"
        />
        {m.images_contacts()}
      </label>
      {listed.length ? (
        <ul aria-label={m.images_list()} className="m-0 flex list-none flex-col gap-1 p-0">
          {listed.map((sender) => (
            <li key={sender} className="flex items-center gap-2 text-[14px]">
              <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{sender}</span>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label={m.images_remove({ sender })}
                onClick={() => run(trust(sender, false))}
              >
                <X size={14} />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[13px] text-muted">{m.images_none()}</p>
      )}
      <form onSubmit={add} className="flex gap-2">
        <Input
          aria-label={m.images_add_label()}
          placeholder={m.images_add_placeholder()}
          value={entry}
          onChange={(event) => setEntry(event.target.value)}
        />
        <Button type="submit" variant="outline" disabled={!entry.trim()}>
          {m.images_add()}
        </Button>
      </form>
    </SettingsCard>
  );
};
