/**
 * A mailto: link (RFC 6068) and a share from another app as the start of a new mail. Pure.
 */

export type MailStart = { to: string; cc: string; subject: string; body: string };

const decode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/** "mailto:a@b.de?subject=Hallo&body=…": recipients, copy, subject and text. */
export const parseMailto = (link: string): MailStart => {
  const value = link.replace(/^mailto:/i, "");
  const [path = "", query = ""] = value.split(/\?(.*)/s);
  const params = new Map<string, string>();
  for (const pair of query.split("&").filter(Boolean)) {
    const [key = "", raw = ""] = pair.split(/=(.*)/s);
    // In mailto: a "+" is a plus (RFC 6068 §5), not a space as in form data.
    params.set(key.toLowerCase(), decode(raw));
  }
  const join = (...parts: (string | undefined)[]) =>
    parts
      .flatMap((part) => (part ? part.split(",") : []))
      .map((address) => address.trim())
      .filter(Boolean)
      .join(", ");
  return {
    to: join(decode(path), params.get("to")),
    cc: join(params.get("cc")),
    subject: params.get("subject") ?? "",
    body: params.get("body") ?? "",
  };
};

/** Shared from another app: its title as subject, text and link as the mail's text. */
export const shareStart = (share: { title: string; text: string; url: string }): MailStart => {
  const text = share.text.trim();
  const url = share.url.trim();
  // Many apps put the link into the text already.
  const body = [text, url && !text.includes(url) ? url : ""].filter(Boolean).join("\n\n");
  return { to: "", cc: "", subject: share.title.trim(), body };
};
