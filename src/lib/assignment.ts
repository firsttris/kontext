/**
 * Who takes care of a mail in a shared mailbox, and whether it is done: kept on the mail itself as
 * shared JMAP Object Metadata (draft-ietf-jmap-metadata), which every member of the mailbox sees
 * and Email/query filters on (Stalwart 1.0, crates/jmap/src/email/query.rs). Pure.
 *
 * The values live in Kontext's own namespace, a domain name as vendor namespaces need
 * (crates/types/src/metadata/registry.rs). Stalwart patches inside a namespace only once it
 * exists, so the whole namespace is written each time.
 */
import type { EmailSummary } from "@/jmap/types";

export const ASSIGNMENT_NAMESPACE = "kontext.firsttris.github.io";

/** The person (principal id, in Stalwart also the account id) and whether it is done. */
export type Assignment = { assignee: string | null; done: boolean };

type Stored = { assignee?: unknown; state?: unknown };

export const assignmentOf = (email: Pick<EmailSummary, "metadata">): Assignment => {
  const stored = (email.metadata?.[ASSIGNMENT_NAMESPACE] ?? {}) as Stored;
  return {
    assignee: typeof stored.assignee === "string" && stored.assignee ? stored.assignee : null,
    done: stored.state === "done",
  };
};

/** The Email/set patch that stores `next`; nothing left removes the namespace. */
export const assignmentPatch = (next: Assignment): Record<string, unknown> => {
  const value = {
    ...(next.assignee ? { assignee: next.assignee } : {}),
    ...(next.done ? { state: "done" } : {}),
  };
  return { [`metadata/${ASSIGNMENT_NAMESPACE}`]: Object.keys(value).length ? value : null };
};

/** The mail with `next` in its metadata, for the cached lists before the server answers. */
export const withAssignment = <T extends Pick<EmailSummary, "metadata">>(
  email: T,
  next: Assignment,
): T => {
  const value = assignmentPatch(next)[`metadata/${ASSIGNMENT_NAMESPACE}`];
  const { [ASSIGNMENT_NAMESPACE]: _, ...others } = email.metadata ?? {};
  return {
    ...email,
    metadata: value
      ? { ...others, [ASSIGNMENT_NAMESPACE]: value as Record<string, unknown> }
      : others,
  };
};

/** "Mir zugewiesen": the open ones of `me`; "Offen": everything not done. */
export type AssignmentView = "mine" | "open";

const done = { metadataTextEquals: { path: `${ASSIGNMENT_NAMESPACE}/state`, value: "done" } };

/** The Email/query conditions of a view (RFC 8620 FilterCondition, joined with AND). */
export const assignmentConditions = (
  view: AssignmentView,
  me: string,
): Record<string, unknown>[] => {
  const notDone = { operator: "NOT", conditions: [done] };
  return view === "mine"
    ? [{ metadataTextEquals: { path: `${ASSIGNMENT_NAMESPACE}/assignee`, value: me } }, notDone]
    : [notDone];
};
