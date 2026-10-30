/**
 * Whether a header property (`header:{name}[:as{Form}][:all]`) asks for a form RFC 8621 §4.1.2
 * allows for that header. Stalwart 1.0 refuses the whole Email/get otherwise ("Invalid property",
 * `is_allowed_form` in crates/jmap-proto/src/object/email.rs); 0.16 answered anyway. Raw is
 * always allowed; Received and Return-Path only raw. Pure.
 */
type Form = "Raw" | "Text" | "Addresses" | "GroupedAddresses" | "MessageIds" | "Date" | "URLs";

const ADDRESSES: Form[] = ["Addresses", "GroupedAddresses"];

const ALLOWED: Record<string, Form[]> = {
  subject: ["Text"],
  comments: ["Text"],
  keywords: ["Text"],
  ...Object.fromEntries(
    [
      "from",
      "sender",
      "reply-to",
      "to",
      "cc",
      "bcc",
      "resent-from",
      "resent-sender",
      "resent-to",
      "resent-cc",
      "resent-bcc",
    ].map((name) => [name, ADDRESSES]),
  ),
  ...Object.fromEntries(
    ["message-id", "in-reply-to", "references", "resent-message-id"].map((name) => [
      name,
      ["MessageIds"] as Form[],
    ]),
  ),
  date: ["Date"],
  "resent-date": ["Date"],
  ...Object.fromEntries(
    [
      "list-help",
      "list-unsubscribe",
      "list-subscribe",
      "list-post",
      "list-owner",
      "list-archive",
    ].map((name) => [name, ["URLs"] as Form[]]),
  ),
  "return-path": [],
  received: [],
};

export const isAllowedHeaderForm = (property: string): boolean => {
  const [prefix, name, ...rest] = property.split(":");
  if (prefix !== "header" || !name) return false;
  const form = rest.find((part) => part.startsWith("as"))?.slice(2) ?? "Raw";
  if (form === "Raw") return true;
  const allowed = ALLOWED[name.toLowerCase()];
  return allowed ? allowed.includes(form as Form) : true;
};
