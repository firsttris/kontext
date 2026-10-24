/**
 * Messages of one person close together: on a desktop under one name with the avatar, on a phone
 * as bubbles (the own on the right). Each message shows its text, photos, files and cards, the
 * tasks made from it, and its actions.
 */
import { Ellipsis, ListChecks } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from "@/components/ui/menu";
import { ItemLink } from "@/features/links/item-link";
import { useTasks } from "@/features/tasks/queries";
import { firstName, type Message, type MessageRun, type Person } from "@/lib/chat";
import { tasksOfMessage } from "@/lib/chat-cards";
import { cn } from "@/lib/cn";
import { STATUS_LABELS } from "@/lib/tasks";
import { m } from "@/paraglide/messages";
import { MessageCard } from "./message-card";
import { MessageFiles } from "./message-files";
import { MessageText } from "./message-text";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

export const isPending = (message: Message) => message.id.startsWith("pending-");

type Props = {
  run: MessageRun;
  me: string;
  people: Person[];
  nameOf: (id: string) => string;
  /** The message to point at (opened from a task), marked for a moment. */
  highlight?: string;
  onMakeTask: (message: Message) => void;
};

const Actions = ({ message, onMakeTask }: { message: Message; onMakeTask: () => void }) =>
  isPending(message) ? null : (
    <MenuRoot>
      <MenuTrigger
        aria-label={m.chat_message_actions()}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted opacity-60 hover:bg-hover hover:text-fg focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100 md:data-[state=open]:opacity-100"
      >
        <Ellipsis size={15} />
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem onSelect={onMakeTask}>
          <ListChecks size={15} /> {m.chat_make_task()}
        </MenuItem>
      </MenuContent>
    </MenuRoot>
  );

const Item = ({
  message,
  own,
  me,
  people,
  highlight,
  onMakeTask,
}: { message: Message; own: boolean } & Omit<Props, "run" | "nameOf">) => {
  const { tasks } = useTasks();
  const made = tasksOfMessage(tasks, message.id);
  return (
    <div
      data-message={message.id}
      className={cn(
        "group flex max-w-full flex-col gap-1.5 rounded-xl transition-colors duration-700 md:-mx-2 md:px-2 md:py-0.5",
        own ? "items-end md:items-stretch" : "items-start md:items-stretch",
        highlight === message.id && "bg-accent/10",
        isPending(message) && "opacity-60",
      )}
    >
      <div
        className={cn("flex max-w-full items-start gap-1", own && "flex-row-reverse md:flex-row")}
      >
        {message.text ? (
          <div
            className={cn(
              "max-w-[85vw] rounded-2xl px-3 py-2 md:max-w-none md:flex-1 md:rounded-none md:bg-transparent md:p-0 md:text-fg",
              own ? "rounded-br-md bg-primary text-onprimary" : "rounded-bl-md bg-subtle",
            )}
          >
            <MessageText message={message} people={people} me={me} own={own} />
          </div>
        ) : (
          <span className="hidden flex-1 md:block" />
        )}
        <Actions message={message} onMakeTask={() => onMakeTask(message)} />
      </div>
      <MessageFiles files={message.files} />
      {message.cards.map((card) => (
        <MessageCard key={`${card.kind}-${card.ref}`} card={card} />
      ))}
      {made.map((task) => (
        <ItemLink
          key={task.id}
          item={{ kind: "task", accountId: task.accountId, ref: task.id }}
          className="flex items-center gap-1.5 text-[12px] text-muted no-underline hover:text-fg"
        >
          <ListChecks size={13} aria-hidden="true" />
          {m.chat_task_made({ title: task.title, status: STATUS_LABELS[task.status]() })}
        </ItemLink>
      ))}
    </div>
  );
};

export const Run = ({ run, nameOf, ...rest }: Props) => {
  const own = run.authorId === rest.me;
  const name = nameOf(run.authorId);
  return (
    <li className={cn("flex gap-3", own && "justify-end md:justify-start")}>
      <Avatar name={name} size={34} className="hidden md:inline-flex" />
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-1 md:items-stretch",
          own ? "items-end" : "items-start",
        )}
      >
        <span className="text-[12px] text-muted md:text-[14px]">
          <span className={cn("font-semibold text-fg", own && "hidden md:inline")}>
            {firstName(name)}
          </span>
          <span className={cn(own && "hidden md:inline")}> · </span>
          <time dateTime={run.createdAt} className="md:font-mono md:text-[12px]">
            {time(run.createdAt)}
          </time>
        </span>
        {run.messages.map((message) => (
          <Item key={message.id} message={message} own={own} {...rest} />
        ))}
      </div>
    </li>
  );
};
