/**
 * Einstellungen → Textbausteine: the standard answers of one's own mailbox and of each shared one
 * one writes in (there for the whole team). {Vorname} and {Name} become the recipient's.
 */
import { Pencil, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useMailAccounts } from "@/features/mail/queries";
import { SettingsCard } from "@/features/settings/settings-page";
import { m } from "@/paraglide/messages";
import { type Snippet, useSnippetActions, useSnippets } from "./queries";

type Draft = { title: string; body: string };

/** The placeholders, shown as they are typed. */
const PLACEHOLDERS = { first: "{Vorname}", full: "{Name}" };

const SnippetForm = ({
  start,
  onSave,
  onCancel,
}: {
  start: Draft;
  onSave: (draft: Draft) => Promise<unknown>;
  onCancel: () => void;
}) => {
  const [draft, setDraft] = useState(start);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await onSave(draft);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
      <Label>
        {m.snippets_title()}
        <Input
          value={draft.title}
          placeholder={m.snippets_title_example()}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          autoFocus
        />
      </Label>
      <Label>
        {m.snippets_body()}
        <Textarea
          value={draft.body}
          rows={6}
          placeholder={m.snippets_body_example(PLACEHOLDERS)}
          onChange={(event) => setDraft({ ...draft, body: event.target.value })}
        />
      </Label>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {m.snippets_cancel()}
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={busy || !draft.title.trim() || !draft.body.trim()}
        >
          {m.snippets_save()}
        </Button>
      </div>
    </form>
  );
};

const Row = ({ snippet }: { snippet: Snippet }) => {
  const actions = useSnippetActions();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <li className="rounded-xl border border-border p-3">
        <SnippetForm
          start={snippet}
          onCancel={() => setEditing(false)}
          onSave={async (draft) => {
            await actions.update.mutateAsync({ id: snippet.id, ...draft });
            setEditing(false);
          }}
        />
      </li>
    );
  }
  return (
    <li className="flex items-start gap-3 rounded-xl border border-border px-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium">{snippet.title}</span>
        <span className="line-clamp-2 text-[13px] text-muted">
          {snippet.body.replace(/\s+/g, " ")}
        </span>
      </div>
      <Button
        variant="ghost"
        size="iconSm"
        aria-label={m.snippets_edit({ title: snippet.title })}
        onClick={() => setEditing(true)}
      >
        <Pencil size={15} />
      </Button>
      <Button
        variant="ghost"
        size="iconSm"
        aria-label={m.snippets_delete({ title: snippet.title })}
        onClick={() => {
          if (!window.confirm(m.snippets_delete_confirm({ title: snippet.title }))) return;
          actions.remove.mutate(snippet.id, {
            onError: (error) => toast.show(m.common_error({ message: error.message }), "error"),
          });
        }}
      >
        <Trash2 size={15} />
      </Button>
    </li>
  );
};

const Mailbox = ({
  accountId,
  title,
  hint,
}: {
  accountId: string;
  title: string;
  hint: string;
}) => {
  const snippets = useSnippets().filter((snippet) => snippet.accountId === accountId);
  const actions = useSnippetActions();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  return (
    <SettingsCard title={title} description={hint}>
      {snippets.length ? (
        <ul aria-label={title} className="m-0 flex list-none flex-col gap-2 p-0">
          {snippets.map((snippet) => (
            <Row key={snippet.id} snippet={snippet} />
          ))}
        </ul>
      ) : null}
      {adding ? (
        <div className="rounded-xl border border-border p-3">
          <SnippetForm
            start={{ title: "", body: "" }}
            onCancel={() => setAdding(false)}
            onSave={async (draft) => {
              try {
                await actions.create.mutateAsync({ accountId, ...draft });
                toast.show(m.snippets_saved());
                setAdding(false);
              } catch (error) {
                toast.show(m.common_error({ message: (error as Error).message }), "error");
              }
            }}
          />
        </div>
      ) : (
        <Button className="self-start" onClick={() => setAdding(true)}>
          <Plus size={15} /> {m.snippets_new()}
        </Button>
      )}
    </SettingsCard>
  );
};

export const SnippetsSection = () => {
  const accounts = useMailAccounts().filter((account) => !account.isReadOnly);
  return (
    <>
      {accounts.map((account) => (
        <Mailbox
          key={account.id}
          accountId={account.id}
          title={account.isPersonal ? m.snippets_mine() : account.name}
          hint={
            account.isPersonal
              ? m.snippets_mine_hint(PLACEHOLDERS)
              : m.snippets_shared_hint(PLACEHOLDERS)
          }
        />
      ))}
    </>
  );
};
