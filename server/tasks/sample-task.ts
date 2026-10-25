/** Tests only: a task with everything filled, changed where a test needs it. */
import type { Task } from "./tasks";

export const sampleTask = (patch: Partial<Task> = {}): Task => ({
  id: "t1",
  accountId: "info",
  title: "Rückruf Hoffmann",
  notes: "",
  status: "open",
  position: 1,
  assigneeId: null,
  dueDate: null,
  dueTime: null,
  checklist: [],
  links: [],
  createdBy: "jonas",
  createdAt: "2026-10-25T08:00:00.000Z",
  updatedAt: "2026-10-25T08:00:00.000Z",
  completedAt: null,
  assignedBy: null,
  assignedAt: null,
  remindAt: null,
  ...patch,
});
