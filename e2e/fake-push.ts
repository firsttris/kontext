/** A stand-in for a browser's push service, for tests of what the server pushes. */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

type Received = {
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
};

/** A stand-in for a browser's push service: keeps what the server posts. */
export const fakePushService = async () => {
  const received: Received[] = [];
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push({
        path: request.url ?? "",
        headers: request.headers,
        body: Buffer.concat(chunks),
      });
      response.writeHead(201).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { received, url: `http://127.0.0.1:${port}`, close: () => server.close() };
};
