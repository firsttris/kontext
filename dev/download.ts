/**
 * Downloads a file with a progress line. The body is written chunk by chunk: Bun.write(path,
 * response) never finishes for the Stalwart release in Bun 1.3.5 (it spins at full CPU and nothing
 * reaches the disk), the same bug firsttris/stapel works around in engine/scripts/prepare.ts.
 */

const megabytes = (bytes: number): string => (bytes / 1e6).toFixed(0);

/** "12 / 42 MB (28 %), 31 MB/s"; without a known total only the received size and speed. */
export const describeTransfer = (received: number, total: number, elapsedMs: number): string => {
  const speed = `${megabytes((received / Math.max(elapsedMs, 1)) * 1000)} MB/s`;
  if (total <= 0) return `${megabytes(received)} MB, ${speed}`;
  const percent = Math.floor((received / total) * 100);
  return `${megabytes(received)} / ${megabytes(total)} MB (${percent} %), ${speed}`;
};

/** Redraws one line in a terminal; elsewhere (CI logs) prints only the final line. */
const progressLine = (label: string) => {
  const interactive = process.stdout.isTTY === true;
  let lastDraw = 0;
  return {
    update: (detail: string) => {
      const now = performance.now();
      if (!interactive || now - lastDraw < 200) return;
      lastDraw = now;
      process.stdout.write(`\r\x1b[2K${label} · ${detail}`);
    },
    done: (detail: string) => {
      process.stdout.write(`${interactive ? "\r\x1b[2K" : ""}${label} · ${detail}\n`);
    },
  };
};

export const download = async (url: string, path: string, label: string): Promise<void> => {
  const response = await fetch(url);
  if (!response.ok || !response.body)
    throw new Error(`Download failed (${response.status}): ${url}`);
  const total = Number(response.headers.get("content-length") ?? 0);
  const started = performance.now();
  const line = progressLine(label);
  const progress = (received: number) =>
    describeTransfer(received, total, performance.now() - started);

  const writer = Bun.file(path).writer();
  let received = 0;
  for await (const chunk of response.body) {
    writer.write(chunk);
    received += chunk.length;
    line.update(progress(received));
  }
  await writer.end();
  line.done(progress(received));
};
