/**
 * The composer, loaded when a mail is written: its editor (Tiptap and ProseMirror, about 1 MB)
 * is not needed to read mail, and on a phone that is most of the time.
 */
import { type ComponentProps, lazy, Suspense } from "react";
import { m } from "@/paraglide/messages";

const Loaded = lazy(() => import("./composer").then((module) => ({ default: module.Composer })));

export const Composer = (props: ComponentProps<typeof Loaded>) => (
  <Suspense fallback={<p className="m-0 p-6 text-[14px] text-muted">{m.common_loading()}</p>}>
    <Loaded {...props} />
  </Suspense>
);
