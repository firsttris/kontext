/**
 * Small pieces of JMAP both the app and the server need: filling Stalwart's URL templates and
 * reading its event stream (RFC 8620 §7.3). Pure.
 */

export const fillTemplate = (template: string, values: Record<string, string>): string =>
  template.replace(/\{([a-zA-Z]+)\}/g, (_, key: string) => encodeURIComponent(values[key] ?? ""));

/** Splits a server-sent-events buffer into complete events and the unfinished rest. */
export const parseEvents = (
  buffer: string,
): { events: { type: string; data: string }[]; rest: string } => {
  const blocks = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = blocks.pop() ?? "";
  const events = blocks
    .map((block) => {
      let type = "message";
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) type = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      return { type, data: data.join("\n") };
    })
    .filter((event) => event.data);
  return { events, rest };
};
