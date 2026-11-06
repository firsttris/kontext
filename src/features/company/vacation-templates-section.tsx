/**
 * Abwesenheitsvorlagen in the Firmenverwaltung: a few texts for the out-of-office reply, picked
 * in everyone's form (src/features/settings/vacation-form.tsx) and filled there. Saved as a whole.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  VACATION_PLACEHOLDERS,
  VACATION_TEMPLATES_MAX,
  VACATION_TEXT_MAX,
  VACATION_TITLE_MAX,
  type VacationTemplate,
} from "@/lib/vacation-template";
import { m } from "@/paraglide/messages";
import {
  getVacationTemplates,
  saveVacationTemplates,
  VACATION_TEMPLATES_KEY,
} from "./vacation-templates";

export const VacationTemplatesSection = () => {
  const { data } = useQuery({ queryKey: VACATION_TEMPLATES_KEY, queryFn: getVacationTemplates });
  return data === undefined ? null : <TemplatesForm saved={data} />;
};

const TemplatesForm = ({ saved }: { saved: VacationTemplate[] }) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [templates, setTemplates] = useState(saved);
  const save = useMutation({
    mutationFn: saveVacationTemplates,
    onSuccess: (stored) => {
      setTemplates(stored);
      toast.show(m.company_saved());
    },
    onError: (error) => toast.show(m.common_error({ message: error.message }), "error"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: VACATION_TEMPLATES_KEY }),
  });
  const change = (index: number, patch: Partial<VacationTemplate>) =>
    setTemplates(templates.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  const complete = templates.every((t) => t.title.trim() && t.text.trim());

  return (
    <div className="flex max-w-[520px] flex-col gap-4">
      <p className="m-0 text-[13px] text-muted">
        {m.company_vacation_templates_hint(VACATION_PLACEHOLDERS)}
      </p>
      {templates.map((template, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the list has no ids, only this form changes it
        <div key={index} className="flex flex-col gap-3 rounded-xl border border-border p-3">
          <div className="flex items-end gap-2">
            <Label className="flex-1">
              {m.company_vacation_template_title()}
              <Input
                value={template.title}
                maxLength={VACATION_TITLE_MAX}
                placeholder={m.company_vacation_template_title_placeholder()}
                onChange={(event) => change(index, { title: event.target.value })}
              />
            </Label>
            <Button
              variant="ghost"
              size="icon"
              aria-label={m.company_vacation_template_remove({ title: template.title })}
              onClick={() => setTemplates(templates.filter((_, i) => i !== index))}
            >
              <Trash2 size={16} />
            </Button>
          </div>
          <Label>
            {m.company_vacation_template_text()}
            <Textarea
              value={template.text}
              maxLength={VACATION_TEXT_MAX}
              rows={6}
              placeholder={m.company_vacation_template_text_placeholder(VACATION_PLACEHOLDERS)}
              onChange={(event) => change(index, { text: event.target.value })}
            />
          </Label>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        {templates.length < VACATION_TEMPLATES_MAX ? (
          <Button onClick={() => setTemplates([...templates, { title: "", text: "" }])}>
            <Plus size={16} /> {m.company_vacation_template_add()}
          </Button>
        ) : null}
        <Button
          variant="primary"
          disabled={save.isPending || !complete}
          onClick={() => save.mutate(templates)}
        >
          {m.company_save()}
        </Button>
      </div>
    </div>
  );
};
