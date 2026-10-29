/**
 * "Textbaustein" in the composer's toolbar: the snippets of one's own mailbox and of the one the
 * mail is sent from (info@ for the team), put in where the cursor is with its placeholders filled
 * (src/lib/snippet-fill.ts); a snippet with own fields asks for them first.
 */
import { Link } from "@tanstack/react-router";
import type { Editor } from "@tiptap/react";
import { TextQuote } from "lucide-react";
import { Fragment, useRef, useState } from "react";
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
import { LOCALE } from "@/lib/locale";
import { fillSnippet, snippetFields } from "@/lib/snippet-fill";
import { m } from "@/paraglide/messages";
import { type Snippet, useSnippets } from "./queries";
import { SnippetFieldsDialog } from "./snippet-fields-dialog";

export const SnippetMenu = ({
  editor,
  accountId,
  recipient,
  sender,
}: {
  editor: Editor;
  /** The account the mail goes out from. */
  accountId: string;
  recipient: EmailAddress | undefined;
  /** One's own name, for {Absender}. */
  sender: string;
}) => {
  const accounts = useMailAccounts();
  const snippets = useSnippets();
  // The snippet whose own fields are being asked for.
  const [asking, setAsking] = useState<{ snippet: Snippet; fields: string[] } | null>(null);
  // The snippet picked in the menu, put in (or asked about) when the menu has closed.
  const chosen = useRef<Snippet | null>(null);
  const insert = (snippet: Snippet, answers: Record<string, string> = {}) => {
    const context = { recipient: recipient?.name ?? "", sender, today: new Date(), locale: LOCALE };
    editor
      .chain()
      .focus()
      .insertContent(fillSnippet(textToHtml(snippet.body), context, answers))
      .run();
  };
  const choose = (snippet: Snippet) => {
    const fields = snippetFields(snippet.body);
    if (fields.length) setAsking({ snippet, fields });
    else insert(snippet);
  };
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
    <>
      {asking ? (
        <SnippetFieldsDialog
          title={asking.snippet.title}
          fields={asking.fields}
          onClose={() => setAsking(null)}
          onInsert={(answers) => {
            setAsking(null);
            insert(asking.snippet, answers);
          }}
          // Back to the text, where the snippet went (or would have gone), not to the menu button.
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            editor.commands.focus();
          }}
        />
      ) : null}
      <MenuRoot>
        <MenuTrigger
          aria-label={m.snippets_insert()}
          title={m.snippets_insert()}
          onMouseDown={(event) => event.preventDefault()}
          className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg"
        >
          <TextQuote size={15} strokeWidth={1.9} />
        </MenuTrigger>
        <MenuContent
          align="start"
          className="max-h-80 max-w-xs overflow-y-auto"
          // Only once the menu is gone: its focus trap would pull the focus back out of a dialog
          // opened while it is still there, and its return to the button would leave the text.
          onCloseAutoFocus={(event) => {
            const snippet = chosen.current;
            if (!snippet) return;
            event.preventDefault();
            chosen.current = null;
            choose(snippet);
          }}
        >
          {groups.length === 0 ? <MenuLabel>{m.snippets_none()}</MenuLabel> : null}
          {groups.map((group, index) => (
            <Fragment key={group.id}>
              {index > 0 ? <MenuSeparator /> : null}
              {groups.length > 1 ? <MenuLabel>{group.label}</MenuLabel> : null}
              {group.snippets.map((snippet) => (
                <MenuItem key={snippet.id} onSelect={() => (chosen.current = snippet)}>
                  <span className="truncate">{snippet.title}</span>
                </MenuItem>
              ))}
            </Fragment>
          ))}
          <MenuSeparator />
          <MenuItem asChild>
            <Link
              to="/settings"
              search={{ section: "snippets" }}
              className="text-muted no-underline"
            >
              {m.snippets_manage()}
            </Link>
          </MenuItem>
        </MenuContent>
      </MenuRoot>
    </>
  );
};
