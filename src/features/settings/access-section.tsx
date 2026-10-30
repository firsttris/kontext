/**
 * Einstellungen → Zugänge: everyone and everything with access to one's account in one place,
 * and where to end it: the browsers signed in to Kontext, other programs signed in at Stalwart
 * (OAuth), app passwords, AI agents and the other mailboxes Kontext fetches.
 */
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useToast } from "@/components/ui/toast";
import { AgentConnection } from "@/features/agents/agents-section";
import { useConnections } from "@/features/agents/api";
import { Badge, ConfirmButton } from "@/features/company/fields";
import { useExternalAccounts } from "@/features/external/queries";
import type { OAuthGrant } from "@/jmap/oauth-grants";
import { readingDate } from "@/lib/format";
import { m } from "@/paraglide/messages";
import type { settingsSections } from "@/routes/_app/settings";
import {
  type Device,
  useDevices,
  useEndProgram,
  usePrograms,
  useSignOutDevice,
  useSignOutOthers,
} from "./access-api";
import { useAppPasswords } from "./app-passwords-api";
import { AppPasswordRow } from "./app-passwords-card";
import { SettingsCard } from "./settings-page";

const deviceName = (device: Device) =>
  device.browser && device.system
    ? m.access_device_name({ browser: device.browser, system: device.system })
    : (device.browser ?? device.system ?? m.access_device_unknown());

const Rows = ({ label, children }: { label: string; children: ReactNode }) => (
  <ul aria-label={label} className="m-0 flex list-none flex-col gap-3 p-0">
    {children}
  </ul>
);

const Row = ({ children }: { children: ReactNode }) => (
  <li className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-0 last:pb-0">
    {children}
  </li>
);

const None = () => <p className="m-0 text-[13px] text-muted">{m.access_none()}</p>;

/** "Verwalten": the section where the entries are made and changed. */
const Manage = ({ section }: { section: (typeof settingsSections)[number] }) => (
  <Link
    to="/settings"
    search={{ section }}
    className="self-start text-[13px] font-medium text-accent-ink"
  >
    {m.access_manage()}
  </Link>
);

const useFailure = () => {
  const toast = useToast();
  return (error: Error) => toast.show(m.common_error({ message: error.message }), "error");
};

const DeviceRow = ({ device }: { device: Device }) => {
  const signOut = useSignOutDevice();
  const failed = useFailure();
  const name = deviceName(device);
  return (
    <Row>
      <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
          {name}
          {device.current ? <Badge>{m.access_this_device()}</Badge> : null}
        </span>
        <span className="text-[12px] text-muted">
          {m.access_since({ date: readingDate(device.since) })} ·{" "}
          {m.access_active({ date: readingDate(device.lastActive) })}
          {device.ip ? ` · ${m.access_ip({ ip: device.ip })}` : ""}
        </span>
      </div>
      {device.current ? null : (
        <ConfirmButton
          danger
          label={m.access_sign_out()}
          question={m.access_sign_out_question({ name })}
          disabled={signOut.isPending}
          onConfirm={() => signOut.mutate(device.id, { onError: failed })}
        />
      )}
    </Row>
  );
};

const DevicesCard = () => {
  const { data: devices = [] } = useDevices();
  const others = useSignOutOthers();
  const toast = useToast();
  const failed = useFailure();
  return (
    <SettingsCard title={m.access_devices_title()} description={m.access_devices_hint()}>
      <Rows label={m.access_devices_title()}>
        {devices.map((device) => (
          <DeviceRow key={device.id} device={device} />
        ))}
      </Rows>
      {devices.some((device) => !device.current) ? (
        <ConfirmButton
          label={m.access_sign_out_others()}
          question={m.access_sign_out_others_question()}
          disabled={others.isPending}
          onConfirm={() =>
            others.mutate(undefined, {
              onSuccess: ({ ended }) => toast.show(m.access_signed_out_others({ count: ended })),
              onError: failed,
            })
          }
        />
      ) : null}
    </SettingsCard>
  );
};

const ProgramRow = ({ program }: { program: OAuthGrant }) => {
  const end = useEndProgram();
  const failed = useFailure();
  const name = program.clientName || program.clientId;
  return (
    <Row>
      <div className="flex min-w-0 flex-1 basis-60 flex-col gap-1">
        <span className="text-[14px] font-medium">{name}</span>
        <span className="text-[12px] text-muted">
          {m.access_since({ date: readingDate(program.createdAt) })} ·{" "}
          {m.access_active({ date: readingDate(program.lastUsedAt) })}
          {program.remoteIp ? ` · ${m.access_ip({ ip: program.remoteIp })}` : ""}
        </span>
      </div>
      <ConfirmButton
        danger
        label={m.access_revoke()}
        question={m.access_revoke_question({ name })}
        disabled={end.isPending}
        onConfirm={() => end.mutate(program.id, { onError: failed })}
      />
    </Row>
  );
};

const ProgramsCard = () => {
  const { data: programs = [] } = usePrograms();
  return (
    <SettingsCard title={m.access_programs_title()} description={m.access_programs_hint()}>
      {programs.length ? (
        <Rows label={m.access_programs_title()}>
          {programs.map((program) => (
            <ProgramRow key={program.id} program={program} />
          ))}
        </Rows>
      ) : (
        <None />
      )}
    </SettingsCard>
  );
};

const AppPasswordsList = () => {
  const { data: list = [] } = useAppPasswords();
  return (
    <SettingsCard title={m.app_passwords_title()} description={m.access_app_passwords_hint()}>
      {list.length ? (
        <Rows label={m.app_passwords_list()}>
          {list.map((entry) => (
            <AppPasswordRow key={entry.id} entry={entry} />
          ))}
        </Rows>
      ) : (
        <None />
      )}
      <Manage section="sync" />
    </SettingsCard>
  );
};

const AgentsList = () => {
  const { data: connections = [] } = useConnections();
  return (
    <SettingsCard title={m.settings_agents()}>
      {connections.length ? (
        <Rows label={m.agents_keys()}>
          {connections.map((connection) => (
            <AgentConnection key={connection.id} connection={connection} />
          ))}
        </Rows>
      ) : (
        <None />
      )}
      <Manage section="agents" />
    </SettingsCard>
  );
};

/** Only where the server fetches other mailboxes at all. */
const ExternalList = () => {
  const { data: accounts } = useExternalAccounts();
  if (!accounts) return null;
  return (
    <SettingsCard title={m.settings_external()} description={m.access_external_hint()}>
      {accounts.length ? (
        <Rows label={m.settings_external()}>
          {accounts.map((account) => (
            <Row key={account.id}>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-[14px] font-medium">{account.name || account.email}</span>
                <span className="text-[12px] text-muted">{account.email}</span>
              </span>
            </Row>
          ))}
        </Rows>
      ) : (
        <None />
      )}
      <Manage section="accounts" />
    </SettingsCard>
  );
};

export const AccessSection = () => (
  <>
    <p className="m-0 text-[13px] text-muted">{m.access_hint()}</p>
    <DevicesCard />
    <ProgramsCard />
    <AppPasswordsList />
    <AgentsList />
    <ExternalList />
  </>
);
