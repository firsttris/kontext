/**
 * Calls across the whole app: the ring of an incoming call and the panel of the call one is in.
 * LiveKit's code loads only once a call begins.
 */
import { lazy, Suspense } from "react";
import { useChannels } from "@/features/chat/queries";
import { useChatNames } from "@/features/chat/use-chat-names";
import { useCallStore } from "./call-store";
import { IncomingCall } from "./incoming-call";

const CallPanel = lazy(async () => ({ default: (await import("./call-panel")).CallPanel }));

export const CallHost = () => {
  const { active } = useCallStore();
  const { channels } = useChannels();
  const { titleOf } = useChatNames();
  const channel = active && channels.find((candidate) => candidate.id === active.channelId);
  const title = channel ? `${channel.kind === "channel" ? "# " : ""}${titleOf(channel)}` : "";
  return (
    <>
      <IncomingCall />
      {active ? (
        <Suspense fallback={null}>
          {/* A new call is a new room: start fresh rather than reuse the last one's state. */}
          <CallPanel key={`${active.channelId}-${active.joinedAt}`} active={active} title={title} />
        </Suspense>
      ) : null}
    </>
  );
};
