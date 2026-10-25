/**
 * Schreibzeug in Kontext's content area, as the module "Dokumente". There is one frame, made on the
 * first visit and kept while the person is in Mail or elsewhere, so an open document stays open.
 * The address bar follows the frame's page (`/documents/edit/…`); Kontext's own navigation to such
 * an address (back button, a link from the chat) opens that page in the frame.
 */
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { TabBar } from "@/components/shell/app-shell";
import { useTheme } from "@/components/theme/use-theme";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";
import { connectFrame, frameSignedOut, updateFrame, useFrameState } from "./frame-store";
import {
  DOCUMENTS_PATH,
  type FrameCommand,
  framePathOf,
  frameSrcOf,
  kontextPathOf,
  readFrameMessage,
  splatOf,
} from "./messages";
import { useDocumentsUrl, useMailboxFolders } from "./queries";

const isDocumentsPath = (pathname: string) =>
  pathname === DOCUMENTS_PATH || pathname.startsWith(`${DOCUMENTS_PATH}/`);

/** The keys Schreibzeug passed on, as if pressed here (components/use-shortcuts.ts). */
const pressShortcut = (key: string) =>
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));

const Frame = ({ url, active }: { url: string; active: boolean }) => {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const { theme } = useTheme();
  const { title } = useFrameState();
  const frame = useRef<HTMLIFrameElement>(null);
  const origin = new URL(url).origin;
  // The first page is the one asked for; later ones are reported by the frame.
  const [src] = useState(() => frameSrcOf(url, framePathOf(pathname)));
  const [ready, setReady] = useState(false);
  /** The page the frame shows, as it last said. */
  const shown = useRef<string | null>(null);
  const currentTheme = useRef(theme);
  currentTheme.current = theme;

  useEffect(() => {
    const send = (command: FrameCommand) =>
      frame.current?.contentWindow?.postMessage(command, origin);
    connectFrame(send);
    const receive = (event: MessageEvent) => {
      const message = readFrameMessage(event, { origin, frame: frame.current?.contentWindow });
      if (!message) return;
      if (message.type === "ready") {
        // Again after every load of the frame (its sign-in comes back with one): the theme too.
        setReady(true);
        send({ source: "kontext", type: "theme", theme: currentTheme.current });
      } else if (message.type === "route") {
        shown.current = kontextPathOf(message.path);
        // Mirror the frame's page without a history entry of its own: the frame has one.
        if (isDocumentsPath(window.location.pathname) && window.location.pathname !== shown.current)
          void navigate({
            to: "/documents/$",
            params: { _splat: splatOf(message.path) },
            replace: true,
          });
      } else if (message.type === "title") updateFrame({ title: message.title });
      else if (message.type === "unsaved") updateFrame({ unsaved: message.unsaved });
      else if (message.type === "shortcut") pressShortcut(message.key);
      else frameSignedOut();
    };
    window.addEventListener("message", receive);
    return () => {
      window.removeEventListener("message", receive);
      connectFrame(null);
    };
  }, [origin, navigate]);

  // Light or dark as Kontext is, whenever it changes.
  useEffect(() => {
    if (ready)
      frame.current?.contentWindow?.postMessage(
        { source: "kontext", type: "theme", theme },
        origin,
      );
  }, [ready, theme, origin]);

  // Kontext went to a page of the module the frame does not show: open it there. The module itself
  // (the rail, "6") brings back what was open, as the frame keeps it.
  useEffect(() => {
    if (!ready || !active || shown.current === null || pathname === shown.current) return;
    if (pathname === DOCUMENTS_PATH) {
      void navigate({
        to: "/documents/$",
        params: { _splat: shown.current.slice(DOCUMENTS_PATH.length + 1) },
        replace: true,
      });
      return;
    }
    const command: FrameCommand = {
      source: "kontext",
      type: "navigate",
      path: framePathOf(pathname),
    };
    frame.current?.contentWindow?.postMessage(command, origin);
  }, [ready, active, pathname, origin, navigate]);

  return (
    <div className={cn("min-w-0 flex-1 flex-col", active ? "flex" : "hidden")}>
      <iframe
        ref={frame}
        src={src}
        title={title ?? m.nav_documents()}
        allow="clipboard-read; clipboard-write; fullscreen"
        className="min-h-0 w-full flex-1 border-0 bg-bg"
      />
      <TabBar />
    </div>
  );
};

/** Mounted beside the pages (routes/_app.tsx); shows the frame while a documents page is open. */
export const DocumentsHost = () => {
  const url = useDocumentsUrl();
  // Asked on start: it also opens the shared mailboxes' folders to who works in them now.
  useMailboxFolders();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const active = isDocumentsPath(pathname);
  const [visited, setVisited] = useState(active);
  useEffect(() => {
    if (active) setVisited(true);
  }, [active]);
  if (!url || !visited) return null;
  return <Frame url={url} active={active} />;
};
