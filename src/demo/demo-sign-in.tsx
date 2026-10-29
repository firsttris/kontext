/**
 * The demo's sign-in: one button per person of "Weber Haustechnik" instead of address and
 * password. The demo server lets anyone of them in (src/demo/api.ts).
 */
import { Avatar } from "@/components/ui/avatar";
import { m } from "@/paraglide/messages";
import { DEV_DOMAIN } from "../../dev/config";
import { users } from "../../dev/seed-data";

export const DemoSignIn = ({
  busy,
  onSignIn,
}: {
  busy: boolean;
  onSignIn: (email: string) => void;
}) => (
  <div className="flex flex-col gap-3">
    <p className="m-0 text-[14px] text-muted">{m.demo_intro()}</p>
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
      {users.map((user) => {
        const email = `${user.name}@${DEV_DOMAIN}`;
        return (
          <li key={user.name}>
            <button
              type="button"
              disabled={busy}
              onClick={() => onSignIn(email)}
              aria-label={m.demo_sign_in_as({ name: user.fullName })}
              className="flex w-full items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-left hover:bg-hover disabled:opacity-60"
            >
              <Avatar name={user.fullName} size={34} />
              <span className="flex min-w-0 flex-col">
                <span className="text-[14px] font-medium">{user.fullName}</span>
                <span className="truncate text-[12px] text-muted">{email}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
    <p className="m-0 text-[12px] text-muted">{m.demo_reset()}</p>
  </div>
);
