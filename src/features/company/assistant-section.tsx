/**
 * The assistant in the chat, set up in the Firmenverwaltung (server/company/assistant.ts): the
 * company's Claude API key and the model. The key is only typed in; afterwards the form shows its
 * last four characters. Without a key there is no assistant.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { m } from "@/paraglide/messages";
import { SettingsCard } from "../settings/settings-page";

type Saved = { model: string; keyEnd: string } | null;

const KEY = ["company", "assistant"];

/** Sonnet first: good answers at a moderate price; Haiku is cheaper, Opus more thorough. */
const MODELS = [
  { id: "claude-sonnet-5-5", label: () => m.company_assistant_sonnet() },
  { id: "claude-haiku-5-5", label: () => m.company_assistant_haiku() },
  { id: "claude-opus-5-5", label: () => m.company_assistant_opus() },
];

const call = async (method: "GET" | "PUT" | "DELETE", body?: unknown): Promise<Saved> => {
  const response = await fetch("/api/company/assistant", {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const answer = (await response.json().catch(() => ({}))) as { assistant?: Saved; error?: string };
  if (!response.ok) throw new Error(answer.error ?? String(response.status));
  return answer.assistant ?? null;
};

export const AssistantSection = () => {
  const { data } = useQuery({ queryKey: KEY, queryFn: () => call("GET") });
  return data === undefined ? null : <AssistantForm saved={data} />;
};

const AssistantForm = ({ saved }: { saved: Saved }) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(saved?.model ?? MODELS[0]!.id);
  const done = () => {
    setApiKey("");
    // The chat asks whether there is an assistant: it shows or hides it at once.
    void queryClient.invalidateQueries({ queryKey: ["assistant"] });
    void queryClient.invalidateQueries({ queryKey: KEY });
  };
  const fail = (error: Error) => toast.show(m.common_error({ message: error.message }), "error");
  const save = useMutation({
    mutationFn: () => call("PUT", { model, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) }),
    onSuccess: () => {
      toast.show(m.company_saved());
      done();
    },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: () => call("DELETE"),
    onSuccess: () => {
      toast.show(m.company_assistant_removed());
      done();
    },
    onError: fail,
  });
  const changed = apiKey.trim() !== "" || (saved !== null && model !== saved.model);

  return (
    <div className="mt-6 max-w-[640px]">
      <SettingsCard title={m.company_assistant()} description={m.company_assistant_hint()}>
        <Label>
          {m.company_assistant_key()}
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder={saved ? `…${saved.keyEnd}` : "sk-ant-…"}
          />
        </Label>
        <Label>
          {m.company_assistant_model()}
          <Select value={model} onChange={(event) => setModel(event.target.value)}>
            {MODELS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label()}
              </option>
            ))}
          </Select>
        </Label>
        <p className="m-0 text-[13px] text-muted">{m.company_assistant_privacy()}</p>
        <div className="flex gap-2">
          <Button
            variant="primary"
            disabled={save.isPending || !changed}
            onClick={() => save.mutate()}
          >
            {m.company_save()}
          </Button>
          {saved ? (
            <Button variant="danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
              {m.company_assistant_remove()}
            </Button>
          ) : null}
        </div>
      </SettingsCard>
    </div>
  );
};
