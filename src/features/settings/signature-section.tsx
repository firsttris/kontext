/** Sender name, default „Antwort an“ and signature per address the user sends from (own address, info@, …). */
import { EditorContent, useEditor } from "@tiptap/react";
import { type FormEvent, useState } from "react";
import { useClient } from "@/auth/auth";
import { useSession } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { updateIdentity } from "@/jmap/settings";
import type { EmailAddress, Identity } from "@/jmap/types";
import { formatAddressInput, parseAddresses } from "@/lib/addresses";
import { htmlToText, textToHtml } from "@/lib/html";
import { m } from "@/paraglide/messages";
import { EditorToolbar } from "../mail/editor-toolbar";
import { richText } from "../mail/rich-text";
import { usePersonalAccountId, usePersonalIdentities, useSave } from "./queries";
import { SettingsCard } from "./settings-page";

export const SignatureSection = () => {
  const { data: identities = [], isPending } = usePersonalIdentities();
  const { data: session } = useSession();
  if (isPending) return <p className="text-[14px] text-muted">{m.common_loading()}</p>;
  // The own address first, then shared ones like info@.
  const own = (identity: Identity) =>
    identity.email.toLowerCase() === session?.username.toLowerCase();
  const sorted = [...identities].sort(
    (a, b) => Number(own(b)) - Number(own(a)) || a.email.localeCompare(b.email),
  );
  return (
    <>
      {sorted.map((identity) => (
        <IdentityCard key={identity.id} identity={identity} />
      ))}
    </>
  );
};

const IdentityCard = ({ identity }: { identity: Identity }) => {
  const client = useClient();
  const toast = useToast();
  const accountId = usePersonalAccountId();
  const [name, setName] = useState(identity.name);
  const [replyTo, setReplyTo] = useState(formatAddressInput(identity.replyTo ?? []));
  const editor = useEditor({
    extensions: richText(),
    content:
      identity.htmlSignature || (identity.textSignature ? textToHtml(identity.textSignature) : ""),
    editorProps: {
      attributes: {
        "aria-label": `${m.settings_signature()} ${identity.email}`,
        role: "textbox",
        "aria-multiline": "true",
      },
    },
  });

  const save = useSave(
    (patch: {
      name: string;
      htmlSignature: string;
      textSignature: string;
      replyTo: EmailAddress[] | null;
    }) => updateIdentity(client, accountId!, identity.id, patch),
    [[accountId, "identities"]],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const html = editor?.isEmpty ? "" : (editor?.getHTML() ?? "");
    const answers = parseAddresses(replyTo);
    if (answers.invalid.length) {
      toast.show(m.settings_reply_to_invalid({ addresses: answers.invalid.join(", ") }), "error");
      return;
    }
    try {
      await save.mutateAsync({
        name: name.trim(),
        htmlSignature: html,
        textSignature: htmlToText(html),
        replyTo: answers.addresses.length ? answers.addresses : null,
      });
      toast.show(m.settings_saved());
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  return (
    <SettingsCard title={identity.email}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Label>
          {m.settings_sender_name()}
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Label>
        <div className="flex flex-col gap-1">
          <Label>
            {m.settings_reply_to()}
            <Input
              type="text"
              inputMode="email"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder={identity.email}
            />
          </Label>
          <p className="m-0 text-[12px] text-muted">{m.settings_reply_to_hint()}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted">{m.settings_signature()}</span>
          <div className="overflow-hidden rounded-lg border border-border">
            {editor ? <EditorToolbar editor={editor} /> : null}
            <EditorContent editor={editor} className="editor-content min-h-[120px]" />
          </div>
        </div>
        <Button type="submit" variant="primary" className="self-start" disabled={save.isPending}>
          {m.contacts_save()}
        </Button>
      </form>
    </SettingsCard>
  );
};
