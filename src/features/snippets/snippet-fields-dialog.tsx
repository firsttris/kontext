/**
 * "Textbaustein ausfüllen": the snippet's own fields ({Auftragsnummer}, …), asked for in one
 * dialog before it goes into the mail. Only what was typed is handed on, so a field left empty
 * stays visible as {Feld} in the text and isn't forgotten.
 */
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { m } from "@/paraglide/messages";

/** The answers worth putting in: the fields that got more than blanks. */
const typedAnswers = (answers: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(answers).filter(([, value]) => value.trim()));

export const SnippetFieldsDialog = ({
  title,
  fields,
  onInsert,
  onClose,
  onCloseAutoFocus,
}: {
  /** The snippet's title, to say which one is asking. */
  title: string;
  fields: string[];
  onInsert: (answers: Record<string, string>) => void;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
}) => {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const submit = (event: FormEvent) => {
    event.preventDefault();
    // React passes the submit up through the portal to the composer's form, which would send.
    event.stopPropagation();
    onInsert(typedAnswers(answers));
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={m.snippets_fields_title()}
      description={m.snippets_fields_description({ title })}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        {fields.map((field, index) => (
          <Label key={field}>
            {field}
            <Input
              value={answers[field] ?? ""}
              autoFocus={index === 0}
              onChange={(event) => setAnswers({ ...answers, [field]: event.target.value })}
            />
          </Label>
        ))}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {m.snippets_cancel()}
          </Button>
          <Button type="submit" variant="primary">
            {m.snippets_fields_insert()}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
