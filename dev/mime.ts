/** Builds plain RFC 5322 messages for the seed. Only what the test data needs. */

type Address = [name: string, email: string];

const encodeWord = (text: string): string =>
  /^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text).toString("base64")}?=`;

const formatAddress = ([name, email]: Address): string => `${encodeWord(name)} <${email}>`;

const base64Lines = (data: string): string =>
  Buffer.from(data)
    .toString("base64")
    .replace(/.{1,76}/g, "$&\r\n");

export type MessageInput = {
  messageId: string;
  inReplyTo?: string;
  from: Address;
  to: Address[];
  cc?: Address[];
  subject: string;
  date: Date;
  text: string;
  attachment?: { name: string; type: string; content: string };
};

export const buildMessage = (input: MessageInput): string => {
  const headers = [
    `Message-ID: <${input.messageId}>`,
    input.inReplyTo ? `In-Reply-To: <${input.inReplyTo}>` : "",
    `Date: ${input.date.toUTCString().replace("GMT", "+0000")}`,
    `From: ${formatAddress(input.from)}`,
    `To: ${input.to.map(formatAddress).join(", ")}`,
    input.cc?.length ? `Cc: ${input.cc.map(formatAddress).join(", ")}` : "",
    `Subject: ${encodeWord(input.subject)}`,
    "MIME-Version: 1.0",
  ].filter(Boolean);

  const textPart = [
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(input.text),
  ].join("\r\n");

  if (!input.attachment) return `${headers.join("\r\n")}\r\n${textPart}`;

  const boundary = `sekretaer-${input.messageId.replace(/[^a-z0-9]/gi, "")}`;
  const { name, type, content } = input.attachment;
  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    textPart,
    `--${boundary}`,
    `Content-Type: ${type}; name="${name}"`,
    `Content-Disposition: attachment; filename="${name}"`,
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(content),
    `--${boundary}--`,
    "",
  ].join("\r\n");
};
