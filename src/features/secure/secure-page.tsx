/**
 * The page a recipient without a key opens (/s/<id>#<key>): the code, then the message – decrypted
 * here in the browser with the key from the link, which never reaches the server – its
 * attachments, and an answer that goes back just as confidentially. Spoken to as "Sie": these are
 * the company's customers.
 */
import { useQuery } from "@tanstack/react-query";
import { LockKeyhole, Paperclip, Send } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import {
  bytesToBase64,
  fragmentToKey,
  type SecureContent,
  type SecureFile,
  type SecureReply,
  seal,
  unseal,
} from "@/lib/secure";
import { m } from "@/paraglide/messages";
import { send } from "./queries";
import { SecureContentView } from "./secure-view";

type Meta = { fromName: string; fromEmail: string; expiresAt: string; state: string };
type Opened = { content: SecureContent; replies: SecureReply[]; code: string };

const MAX_REPLY_BYTES = 20 * 1024 * 1024;

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-dvh bg-side px-4 py-8 md:py-14">
    <main className="mx-auto flex max-w-[720px] flex-col gap-5 rounded-2xl border border-border bg-bg p-5 shadow-sm md:p-8">
      {children}
    </main>
    <p className="mx-auto mt-4 max-w-[720px] text-center text-[12px] text-muted">
      {m.secure_page_footer()}
    </p>
  </div>
);

const Reply = ({
  id,
  opened,
  onSent,
}: {
  id: string;
  opened: Opened;
  onSent: (r: SecureReply) => void;
}) => {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const size = files.reduce((sum, file) => sum + file.size, 0);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim() && !files.length) return;
    if (size > MAX_REPLY_BYTES) return setProblem(m.secure_reply_too_large());
    setBusy(true);
    setProblem(null);
    try {
      const attachments: SecureFile[] = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          type: file.type || "application/octet-stream",
          data: bytesToBase64(new Uint8Array(await file.arrayBuffer())),
        })),
      );
      const reply: SecureReply = { text: text.trim(), attachments, at: new Date().toISOString() };
      const key = fragmentToKey(window.location.hash);
      await send("POST", `secure-public/${encodeURIComponent(id)}/reply`, {
        code: opened.code,
        ciphertext: await seal(key, reply),
      });
      onSent(reply);
      setText("");
      setFiles([]);
    } catch {
      setProblem(m.secure_reply_failed());
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-2 border-t border-border pt-4"
    >
      <Label>
        {m.secure_reply_label()}
        <Textarea rows={4} value={text} onChange={(event) => setText(event.target.value)} />
      </Label>
      {files.length ? (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0 text-[13px] text-muted">
          {files.map((file) => (
            <li key={file.name} className="rounded-md bg-subtle px-2 py-0.5">
              {file.name}
            </li>
          ))}
        </ul>
      ) : null}
      {problem ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {problem}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[14px] text-muted hover:bg-hover hover:text-fg">
          <Paperclip size={15} /> {m.secure_reply_attach()}
          <input
            type="file"
            multiple
            hidden
            onChange={(event) => setFiles([...files, ...Array.from(event.target.files ?? [])])}
          />
        </label>
        <div className="flex-1" />
        <Button type="submit" variant="primary" disabled={busy || (!text.trim() && !files.length)}>
          <Send size={15} /> {m.secure_reply_send()}
        </Button>
      </div>
    </form>
  );
};

export const SecurePage = ({ id }: { id: string }) => {
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [busy, setBusy] = useState(false);
  const hasKey = typeof window !== "undefined" && window.location.hash.length > 20;
  const { data: meta, isError } = useQuery({
    queryKey: ["secure-public", id],
    queryFn: () => send<Meta>("GET", `secure-public/${encodeURIComponent(id)}`),
    retry: false,
  });

  const open = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const result = await send<{
        ciphertext: string;
        replies: { ciphertext: string; createdAt: string }[];
      }>("POST", `secure-public/${encodeURIComponent(id)}/open`, { code });
      const key = fragmentToKey(window.location.hash);
      setOpened({
        content: await unseal<SecureContent>(key, result.ciphertext),
        replies: await Promise.all(
          result.replies.map((reply) => unseal<SecureReply>(key, reply.ciphertext)),
        ),
        code,
      });
    } catch (error) {
      const status = (error as { status?: number }).status;
      const left = (error as { result?: { left?: number } }).result?.left ?? 0;
      setProblem(
        status === 403
          ? left > 0
            ? m.secure_wrong_code({ left })
            : m.secure_locked()
          : status === 423
            ? m.secure_locked()
            : status === 410
              ? m.secure_expired()
              : m.secure_cannot_open(),
      );
    } finally {
      setBusy(false);
    }
  };

  if (isError) {
    return (
      <Frame>
        <h1 className="m-0 text-[20px] font-semibold">{m.secure_gone_title()}</h1>
        <p className="m-0 text-[14px] text-muted">{m.secure_gone()}</p>
      </Frame>
    );
  }
  if (!meta) return <Frame>{m.common_loading()}</Frame>;
  const sender = meta.fromName || meta.fromEmail;

  if (opened) {
    return (
      <Frame>
        <SecureContentView content={opened.content} replies={opened.replies} sender={sender} />
        <Reply
          id={id}
          opened={opened}
          onSent={(reply) => setOpened({ ...opened, replies: [...opened.replies, reply] })}
        />
      </Frame>
    );
  }

  return (
    <Frame>
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <LockKeyhole size={20} aria-hidden="true" />
        </span>
        <div className="flex flex-col">
          <h1 className="m-0 text-[20px] font-semibold">{m.secure_page_title()}</h1>
          <span className="text-[14px] text-muted">{m.secure_page_from({ sender })}</span>
        </div>
      </div>
      {!hasKey ? (
        <p role="alert" className="m-0 text-[14px] text-danger">
          {m.secure_link_broken()}
        </p>
      ) : meta.state !== "open" ? (
        <p role="alert" className="m-0 text-[14px] text-danger">
          {meta.state === "expired" ? m.secure_expired() : m.secure_locked()}
        </p>
      ) : (
        <form onSubmit={(event) => void open(event)} className="flex flex-col gap-3">
          <p className="m-0 text-[14px]">{m.secure_page_code_hint({ sender })}</p>
          <div className="flex max-w-[420px] gap-2">
            <Input
              aria-label={m.secure_code_label()}
              placeholder="XXXX-XXXX"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="font-mono uppercase tracking-wider"
            />
            <Button type="submit" variant="primary" disabled={busy || code.trim().length < 8}>
              {m.secure_open()}
            </Button>
          </div>
          {problem ? (
            <p role="alert" className="m-0 text-[13px] text-danger">
              {problem}
            </p>
          ) : null}
        </form>
      )}
    </Frame>
  );
};
