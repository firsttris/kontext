import { createFileRoute } from "@tanstack/react-router";
import { TasksPage } from "@/features/tasks/tasks-page";
import { z } from "@/lib/zod";

export const tasksSearchSchema = z.object({
  /** One of the own views; ignored while a board is open. */
  show: z.enum(["mine", "today", "upcoming", "done"]).optional(),
  /** The account whose board (or list) is open: the own mailbox or a shared one. */
  board: z.string().optional(),
  mode: z.enum(["list", "board"]).optional(),
  /** The open task. */
  task: z.string().optional(),
});

export type TasksSearch = z.infer<typeof tasksSearchSchema>;

export const Route = createFileRoute("/_app/tasks")({
  validateSearch: tasksSearchSchema,
  component: TasksRoute,
});

function TasksRoute() {
  return <TasksPage search={Route.useSearch()} />;
}
