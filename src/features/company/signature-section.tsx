/** One signature for the whole company, written into every sender address on request. */
import { useQuery } from "@tanstack/react-query";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { htmlToText } from "@/lib/html";
import { m } from "@/paraglide/messages";
import { EditorToolbar } from "../mail/editor-toolbar";
import { getSignature, type SignatureTemplate, saveSignature } from "./api";
import { ConfirmButton } from "./fields";
import { useCompanyChange } from "./queries";

export const CompanySignatureSection = () => {
  const { data: template } = useQuery({
    queryKey: ["company", "signature"],
    queryFn: getSignature,
  });
  return (
    <>
      <p className="m-0 text-[13px] text-muted">{m.company_signature_hint()}</p>
      {template ? <SignatureEditor template={template} /> : null}
    </>
  );
};

const SignatureEditor = ({ template }: { template: SignatureTemplate }) => {
  const toast = useToast();
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false } })],
    content: template.html,
    editorProps: {
      attributes: {
        "aria-label": m.company_signature_label(),
        role: "textbox",
        "aria-multiline": "true",
      },
    },
  });
  const save = useCompanyChange(saveSignature);

  const submit = async (apply: boolean) => {
    const html = editor?.isEmpty ? "" : (editor?.getHTML() ?? "");
    try {
      const { updated } = await save.mutateAsync({ html, text: htmlToText(html), apply });
      toast.show(apply ? m.company_signature_applied({ count: updated }) : m.company_saved());
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-lg border border-border">
        {editor ? <EditorToolbar editor={editor} /> : null}
        <EditorContent editor={editor} className="editor-content min-h-[140px]" />
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <Button variant="primary" disabled={save.isPending} onClick={() => void submit(false)}>
          {m.company_save()}
        </Button>
        <ConfirmButton
          label={m.company_signature_apply()}
          question={m.company_signature_apply_confirm()}
          disabled={save.isPending}
          onConfirm={() => void submit(true)}
        />
      </div>
    </div>
  );
};
