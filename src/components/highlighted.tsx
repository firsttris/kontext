import { splitHighlight } from "@/lib/highlight";

/** Text with the search words marked. */
export const Highlighted = ({ text, terms }: { text: string; terms?: string[] }) => (
  <>
    {splitHighlight(text, terms).map((part, index) =>
      part.hit ? (
        // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string
        <mark key={index} className="rounded-sm bg-warn/25 px-px text-inherit">
          {part.text}
        </mark>
      ) : (
        part.text
      ),
    )}
  </>
);
