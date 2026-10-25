/**
 * A stand-in for a provider's submission server (RFC 5321, AUTH PLAIN/LOGIN per RFC 4954), just
 * enough for nodemailer: it accepts one login and keeps what was sent, envelope and raw mail.
 */
import { createServer, type Socket } from "node:net";

export type Received = { from: string; to: string[]; raw: string };

/** `refuse`: recipients turned down at RCPT TO (550), as a provider does for unknown ones. */
export const startFakeSmtp = async (
  login: { user: string; password: string },
  refuse: string[] = [],
) => {
  const received: Received[] = [];
  const plain = Buffer.from(`\0${login.user}\0${login.password}`).toString("base64");

  const serve = (socket: Socket) => {
    let buffer = "";
    let data: string[] | null = null;
    let from = "";
    let to: string[] = [];
    let step: "user" | "pass" | null = null;
    let user = "";
    const say = (line: string) => socket.write(`${line}\r\n`);
    say("220 fake ESMTP");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("binary");
      for (let end = buffer.indexOf("\r\n"); end !== -1; end = buffer.indexOf("\r\n")) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data) {
          if (line === ".") {
            received.push({ from, to, raw: data.join("\r\n") });
            data = null;
            say("250 queued");
          } else data.push(line.startsWith("..") ? line.slice(1) : line);
          continue;
        }
        if (step === "user") {
          user = Buffer.from(line, "base64").toString();
          step = "pass";
          say("334 UGFzc3dvcmQ6");
          continue;
        }
        if (step === "pass") {
          step = null;
          const ok =
            user === login.user && Buffer.from(line, "base64").toString() === login.password;
          say(ok ? "235 ok" : "535 nope");
          continue;
        }
        const [verb = "", ...rest] = line.split(" ");
        const argument = rest.join(" ");
        switch (verb.toUpperCase()) {
          case "EHLO":
            say("250-fake");
            say("250 AUTH PLAIN LOGIN");
            break;
          case "AUTH":
            if (/^PLAIN /i.test(argument)) say(argument.slice(6) === plain ? "235 ok" : "535 nope");
            else if (/^LOGIN/i.test(argument)) {
              step = "user";
              say("334 VXNlcm5hbWU6");
            } else say("504 unknown");
            break;
          case "MAIL":
            from = argument.replace(/^FROM:\s*<?([^>\s]*)>?.*$/i, "$1");
            to = [];
            say("250 ok");
            break;
          case "RCPT": {
            const recipient = argument.replace(/^TO:\s*<?([^>\s]*)>?.*$/i, "$1");
            if (refuse.includes(recipient)) {
              say("550 5.1.1 no such user");
              break;
            }
            to.push(recipient);
            say("250 ok");
            break;
          }
          case "DATA":
            data = [];
            say("354 go");
            break;
          case "QUIT":
            say("221 bye");
            socket.end();
            break;
          default:
            say("250 ok");
        }
      }
    });
    socket.on("error", () => undefined);
  };

  const server = createServer(serve);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  return { port, received, close: () => new Promise((resolve) => server.close(resolve)) };
};
