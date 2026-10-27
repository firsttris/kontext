/**
 * Firmenverwaltung → Telefonie: couple the telephone box, its login at the Fritzbox, and who
 * hears calls ring in Kontext. The box itself has nothing to set; it gets all of this from here.
 */
import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { SettingsCard } from "@/features/settings/settings-page";
import { m } from "@/paraglide/messages";
import { ADMIN_KEY, type Admin, send, useAdminChange } from "./settings/api";
import { BlockedForm } from "./settings/blocked";
import { CallbacksForm } from "./settings/callbacks";
import { DesksForm } from "./settings/desks";
import { DoorForm } from "./settings/door";
import { FaxForm } from "./settings/fax";
import { HoursForm } from "./settings/hours";
import { LinesForm } from "./settings/lines";
import { MailboxForm } from "./settings/mailbox";
import { MenuForm } from "./settings/menu";
import { RecordingForm } from "./settings/recording";
import { RingForm } from "./settings/ring";
import { SoundsCard } from "./settings/sounds";

const boxState = (box: Admin["boxes"][number]) =>
  !box.paired
    ? m.phone_box_waiting()
    : [
        box.online ? m.phone_box_online() : m.phone_box_offline(),
        box.status?.registered ? m.phone_box_registered() : m.phone_box_unregistered(),
      ].join(" · ");

/**
 * While a box waits for its code, connects or signs in at the Fritzbox, the page asks again
 * every few seconds, so "verbunden" shows without reloading; once all is well it stops.
 */
const settling = (admin: Admin) =>
  admin.boxes.some((box) => !box.paired || !box.online || !box.status?.registered);

const Boxes = ({ boxes }: { boxes: Admin["boxes"] }) => {
  const [name, setName] = useState<string>(m.phone_box_name_default());
  const [code, setCode] = useState<string | null>(null);
  const pairBox = useAdminChange(async (boxName: string) => {
    const result = await send<{ code: string }>("POST", "/boxes", { name: boxName });
    setCode(result.code);
  });
  const remove = useAdminChange((id: string) => send("DELETE", `/boxes/${encodeURIComponent(id)}`));
  const origin = location.origin;
  return (
    <SettingsCard title={m.phone_box()}>
      {boxes.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {boxes.map((box) => (
            <li key={box.id} className="flex items-center gap-2 text-[14px]">
              <span className="flex-1">
                <span className="font-medium">{box.name}</span>
                <span className="text-muted"> · {boxState(box)}</span>
              </span>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  if (window.confirm(m.phone_box_remove_confirm({ name: box.name }))) {
                    remove.mutate(box.id);
                  }
                }}
              >
                {m.phone_box_remove()}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[13px] text-muted">{m.phone_box_none()}</p>
      )}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          pairBox.mutate(name.trim());
        }}
      >
        <Label className="min-w-0 flex-1">
          {m.phone_box_name()}
          <Input value={name} onChange={(event) => setName(event.target.value)} required />
        </Label>
        <Button type="submit" disabled={pairBox.isPending || !name.trim()}>
          {m.phone_box_pair()}
        </Button>
      </form>
      {/* The code is only of use until the box has paired with it. */}
      {code && boxes.some((box) => !box.paired) ? (
        <div role="status" className="flex flex-col gap-1.5 rounded-lg bg-subtle p-3 text-[13px]">
          <strong className="font-mono text-[15px]">{m.phone_box_code({ code })}</strong>
          <span className="text-muted">{m.phone_box_code_hint()}</span>
          <code className="overflow-x-auto font-mono text-[12px] whitespace-pre">
            {`docker run -d --name kontext-box --network host --restart unless-stopped \\\n  -v kontext-box:/data -e KONTEXT_URL=${origin} -e PAIRING_CODE=${code} \\\n  docker.io/tristanteu/kontext-box`}
          </code>
        </div>
      ) : null}
    </SettingsCard>
  );
};

const LineForm = ({ line }: { line: Admin["line"] }) => {
  const toast = useToast();
  const [registrar, setRegistrar] = useState(line?.registrar ?? "192.168.178.1");
  const [username, setUsername] = useState(line?.username ?? "");
  const [password, setPassword] = useState("");
  const save = useAdminChange(() => send("PUT", "/line", { registrar, username, password }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await save.mutateAsync(undefined);
    setPassword("");
    toast.show(m.company_saved());
  };
  return (
    <SettingsCard title={m.phone_line()} description={m.phone_line_hint()}>
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
        <Label>
          {m.phone_line_registrar()}
          <Input
            value={registrar}
            onChange={(event) => setRegistrar(event.target.value)}
            required
          />
        </Label>
        <Label>
          {m.phone_line_username()}
          <Input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="off"
            required
          />
        </Label>
        <Label>
          {m.phone_line_password()}
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            placeholder={line?.hasPassword ? m.phone_line_password_keep() : ""}
            required={!line?.hasPassword}
          />
        </Label>
        <Button type="submit" variant="primary" className="self-start" disabled={save.isPending}>
          {m.company_save()}
        </Button>
      </form>
    </SettingsCard>
  );
};

export const PhoneSettingsSection = () => {
  const { data } = useQuery({
    queryKey: ADMIN_KEY,
    queryFn: () => send<Admin>("GET", ""),
    refetchInterval: (query) => (query.state.data && settling(query.state.data) ? 3000 : false),
  });
  return (
    <>
      <p className="m-0 text-[13px] text-muted">{m.phone_settings_hint()}</p>
      {data ? (
        <>
          <p
            role="status"
            className={data.sip.ok ? "m-0 text-[13px] text-ok" : "m-0 text-[13px] text-danger"}
          >
            {data.sip.ok ? m.phone_sip_ok() : m.phone_sip_error({ error: data.sip.error })}
          </p>
          <Boxes boxes={data.boxes} />
          <LineForm line={data.line} />
          <RingForm admin={data} />
          {/* Saved, the lists come back with their ids: the forms start again from them. */}
          <LinesForm key={`lines-${JSON.stringify(data.extraLines)}`} lines={data.extraLines} />
          <DesksForm key={`desks-${JSON.stringify(data.deskPhones)}`} desks={data.deskPhones} />
          <CallbacksForm board={data.callbackBoard} />
          <SoundsCard sounds={data.sounds} />
          <MailboxForm mailbox={data.mailbox} sounds={data.sounds} />
          <HoursForm hours={data.hours} sounds={data.sounds} />
          <MenuForm menu={data.menu} sounds={data.sounds} />
          <BlockedForm key={`blocked-${JSON.stringify(data.blocked)}`} blocked={data.blocked} />
          <DoorForm door={data.door} />
          <FaxForm admin={data} />
          <RecordingForm recording={data.recording} sounds={data.sounds} />
        </>
      ) : null}
    </>
  );
};
