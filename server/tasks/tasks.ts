/**
 * Tasks: what they are, as the app and the server exchange them. A task belongs to one account
 * (own mailbox or a shared one like info@); its status is its column on the board. Pure.
 */
import { z } from "zod";

export const TASK_STATUSES = ["open", "doing", "waiting", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}$/);

export const checkItemSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().trim().min(1).max(300),
  done: z.boolean(),
});
export type CheckItem = z.infer<typeof checkItemSchema>;

export const taskLinkSchema = z.object({
  /** chat: a message (`ref`) in a channel (`accountId`). */
  kind: z.enum(["mail", "contact", "event", "chat"]),
  accountId: z.string().min(1).max(64),
  ref: z.string().min(1).max(200),
  threadId: z.string().max(200).nullable().default(null),
  label: z.string().max(300),
  detail: z.string().max(300).default(""),
});
export type TaskLink = z.infer<typeof taskLinkSchema>;

const fields = {
  title: z.string().trim().min(1).max(300),
  notes: z.string().max(10_000),
  status: z.enum(TASK_STATUSES),
  position: z.number().finite(),
  assigneeId: z.string().min(1).max(64).nullable(),
  dueDate: day.nullable(),
  dueTime: time.nullable(),
  checklist: z.array(checkItemSchema).max(50),
  links: z.array(taskLinkSchema).max(10),
};

export const newTaskSchema = z.object({
  accountId: z.string().min(1).max(64),
  title: fields.title,
  notes: fields.notes.default(""),
  status: fields.status.default("open"),
  position: fields.position.optional(),
  assigneeId: fields.assigneeId.default(null),
  dueDate: fields.dueDate.default(null),
  dueTime: fields.dueTime.default(null),
  checklist: fields.checklist.default([]),
  links: fields.links.default([]),
});
/** As the app sends it (defaults may be left out) and as the server has it after checking. */
export type NewTask = z.input<typeof newTaskSchema>;
export type NewTaskData = z.infer<typeof newTaskSchema>;

/** A change; `accountId` moves the task to another board. */
export const taskPatchSchema = z
  .object({ accountId: z.string().min(1).max(64), ...fields })
  .partial();
export type TaskPatch = z.infer<typeof taskPatchSchema>;

export type Task = {
  id: string;
  accountId: string;
  title: string;
  notes: string;
  status: TaskStatus;
  position: number;
  assigneeId: string | null;
  dueDate: string | null;
  dueTime: string | null;
  checklist: CheckItem[];
  links: TaskLink[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};
