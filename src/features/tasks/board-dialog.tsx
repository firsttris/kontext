/**
 * A project board: made with a name in one of the mailboxes one may write to, renamed, deleted.
 * Deleting keeps its tasks; they go onto the mailbox's own board.
 */
import { Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { m } from "@/paraglide/messages";
import { type Board, useBoards, useTaskActions } from "./queries";

export const BoardDialog = ({
  board,
  accountId,
  onClose,
  onDone,
}: {
  /** The project to change; without it a new one is made. */
  board?: Board;
  /** Where a new one goes first: the open board's mailbox. */
  accountId?: string;
  onClose: () => void;
  /** The board to show afterwards: the new one, or after deleting the mailbox's own. */
  onDone?: (key: string) => void;
}) => {
  const toast = useToast();
  const actions = useTaskActions();
  const mailboxes = useBoards().filter((candidate) => !candidate.projectId);
  const [name, setName] = useState(board?.name ?? "");
  const [mailbox, setMailbox] = useState(
    board?.accountId ??
      mailboxes.find((candidate) => candidate.accountId === accountId)?.accountId ??
      mailboxes[0]?.accountId ??
      "",
  );
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<string | null>, done: string) => {
    setBusy(true);
    try {
      const key = await action();
      toast.show(done);
      onClose();
      if (key) onDone?.(key);
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    void (board?.projectId
      ? run(async () => {
          await actions.renameProject(board.projectId!, trimmed);
          return null;
        }, m.tasks_board_saved())
      : run(
          async () => (await actions.createProject(mailbox, trimmed)).id,
          m.tasks_board_created(),
        ));
  };

  const remove = () =>
    void run(async () => {
      await actions.removeProject(board!.projectId!);
      return board!.accountId;
    }, m.tasks_board_deleted());

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={board ? m.tasks_board_edit() : m.tasks_board_new()}
      description={board ? undefined : m.tasks_board_new_hint()}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Label>
          {m.tasks_board_name()}
          <Input
            autoFocus
            value={name}
            maxLength={60}
            placeholder={m.tasks_board_name_placeholder()}
            onChange={(e) => setName(e.target.value)}
          />
        </Label>
        {!board && mailboxes.length > 1 ? (
          <Label>
            {m.tasks_mailbox()}
            <Select value={mailbox} onChange={(e) => setMailbox(e.target.value)}>
              {mailboxes.map((candidate) => (
                <option key={candidate.id} value={candidate.accountId}>
                  {candidate.mailbox}
                </option>
              ))}
            </Select>
          </Label>
        ) : null}
        {board ? (
          <div className="flex flex-col gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="self-start text-danger"
              disabled={busy}
              onClick={() => (confirm ? remove() : setConfirm(true))}
            >
              <Trash2 size={14} />
              {confirm ? m.tasks_delete_really() : m.tasks_board_delete()}
            </Button>
            {confirm ? (
              <p className="m-0 text-[13px] text-muted">
                {m.tasks_board_delete_hint({ mailbox: board.mailbox })}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {m.tasks_cancel()}
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !name.trim() || !mailbox}>
            {board ? m.tasks_board_save() : m.tasks_board_create()}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
