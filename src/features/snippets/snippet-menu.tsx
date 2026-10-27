/**
 * "Textbaustein" in the composer's toolbar: the snippets of one's own mailbox and of the one the
 * mail is sent from (info@ for the team), put in where the cursor is, with the recipient's name.
 */
import { Link } from "@tanstack/react-router";
import type { Editor } from "@tiptap/react";
import { TextQuote } from "lucide-react";
import { Fragment } from "react";
import {
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { useMailAccounts } from "@/features/mail/queries";
import type { EmailAddress } from "@/jmap/types";
import { textToHtml } from "@/lib/html";
import { m } from "@/paraglide/messages";
import { fillSnippet } from "../../../server/snippets/snippets";
import { useSnippets } from "./queries";

export const SnippetMenu = ({
  editor,
  accountId,
  recipient,
}: {
  editor: Editor;
  /** The account the mail goes out from. */
  accountId: string;
  recipient: EmailAddress | undefined;
}) => {
  const accounts = useMailAccounts();
  const snippets = useSnippets();
  const own = accounts.find((account) => account.isPersonal)?.id;
  const groups = [...new Set([own, accountId])]
    .filter((id): id is string => Boolean(id))
    .map((id) => ({
      id,
      label:
        id === own
          ? m.snippets_mine()
          : (accounts.find((account) => account.id === id)?.name ?? ""),
      snippets: snippets.filter((snippet) => snippet.accountId === id),
    }))
    .filter((group) => group.snippets.length);
  return (
    <MenuRoot>
      <MenuTrigger
        aria-label={m.snippets_insert()}
        title={m.snippets_insert()}
        onMouseDown={(event) => event.preventDefault()}
        className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg"
      >
        <TextQuote size={15} strokeWidth={1.9} />
      </MenuTrigger>
      <MenuContent align="start" className="max-h-80 max-w-xs overflow-y-auto">
        {groups.length === 0 ? <MenuLabel>{m.snippets_none()}</MenuLabel> : null}
        {groups.map((group, index) => (
          <Fragment key={group.id}>
            {index > 0 ? <MenuSeparator /> : null}
            {groups.length > 1 ? <MenuLabel>{group.label}</MenuLabel> : null}
            {group.snippets.map((snippet) => (
              <MenuItem
                key={snippet.id}
                onSelect={() =>
                  editor
                    .chain()
                    .focus()
                    .insertContent(textToHtml(fillSnippet(snippet.body, recipient)))
                    .run()
                }
              >
                <span className="truncate">{snippet.title}</span>
              </MenuItem>
            ))}
          </Fragment>
        ))}
        <MenuSeparator />
        <MenuItem asChild>
          <Link to="/settings" search={{ section: "snippets" }} className="text-muted no-underline">
            {m.snippets_manage()}
          </Link>
        </MenuItem>
      </MenuContent>
    </MenuRoot>
  );
};
