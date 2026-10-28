/**
 * Renders the film from the takes (bun run video:record makes them):
 *
 *   bun video/render.ts                      # docs/assets/kontext-film.mp4, its poster, the teaser
 *   bun video/render.ts --stills 3,12.5,40   # single frames as PNG into .dev/video/stills
 *   bun video/render.ts --from 20 --to 35 --out .dev/video/part.mp4   # a part, to look at
 *
 * The stage (video/stage/) is bundled, served, opened in Chromium and stepped frame by frame;
 * ffmpeg takes the pictures from a pipe.
 */
import { spawn } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";
import { schedule } from "./stage/timeline";
import { scenes, teaser } from "./storyboard";
import { TAKES_DIR } from "./take";
import type { Take } from "./types";

const { values: args } = parseArgs({
  options: {
    fps: { type: "string", default: "30" },
    from: { type: "string" },
    to: { type: "string" },
    out: { type: "string" },
    stills: { type: "string" },
  },
});

const root = resolve(import.meta.dir, "..");
const build = join(root, ".dev", "video", "stage");
const fonts = join(root, "node_modules", "@fontsource-variable");

const readTakes = async (): Promise<Take[]> => {
  const dir = join(root, TAKES_DIR);
  const names = await readdir(dir).catch(() => [] as string[]);
  return Promise.all(
    names.map(async (name) => JSON.parse(await readFile(join(dir, name, "take.json"), "utf8"))),
  );
};

const bundleStage = async () => {
  await rm(build, { recursive: true, force: true });
  await mkdir(join(build, "fonts"), { recursive: true });
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "stage", "main.ts")],
    outdir: build,
    target: "browser",
  });
  if (!result.success) throw new AggregateError(result.logs, "The stage does not build");
  for (const file of ["index.html", "stage.css"]) {
    await cp(join(import.meta.dir, "stage", file), join(build, file));
  }
  await cp(
    join(fonts, "geist", "files", "geist-latin-wght-normal.woff2"),
    join(build, "fonts", "geist.woff2"),
  );
  await cp(
    join(fonts, "geist-mono", "files", "geist-mono-latin-wght-normal.woff2"),
    join(build, "fonts", "geist-mono.woff2"),
  );
  const takes = await readTakes();
  await writeFile(join(build, "film.json"), JSON.stringify({ scenes, takes }));
  return takes;
};

/** The stage and the takes' stills, from one origin. */
const serve = () =>
  Bun.serve({
    port: 0,
    fetch: async (request) => {
      const path = decodeURIComponent(new URL(request.url).pathname);
      const file = Bun.file(
        path.startsWith("/takes/")
          ? join(root, TAKES_DIR, path.slice("/takes/".length))
          : join(build, path === "/" ? "index.html" : path),
      );
      return (await file.exists()) ? new Response(file) : new Response(null, { status: 404 });
    },
  });

/** H.264 plays everywhere; CRF 30 keeps the film under 10 MB with the text still sharp. */
const ENCODER = [
  "-c:v",
  "libx264",
  "-preset",
  "slow",
  "-crf",
  "30",
  "-tune",
  "animation",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
];

/** Where a teaser part sits in the film: by the scene's name (a take's name, or its kind). */
const teaserParts = (takes: Take[]) => {
  const slots = schedule(scenes, new Map(takes.map((take) => [take.name, take])));
  return teaser.map((part) => {
    const slot = slots.find(({ scene }) =>
      scene.kind === "take" ? scene.take === part.scene : scene.kind === part.scene,
    );
    if (!slot) throw new Error(`The teaser names "${part.scene}", which is not in the film.`);
    return { start: slot.start + part.from, end: slot.start + part.from + part.seconds };
  });
};

/**
 * The teaser for the READMEs, cut from the film: GitHub plays no video from the repository, but
 * it shows an animated WebP. Smaller and slower than the film, so it stays a few MB.
 */
const cutTeaser = async (film: string, parts: { start: number; end: number }[], out: string) => {
  const cuts = parts
    .map(
      ({ start, end }, index) =>
        `[0:v]trim=${start.toFixed(2)}:${end.toFixed(2)},setpts=PTS-STARTPTS,fps=12,scale=960:-2:flags=lanczos[p${index}]`,
    )
    .join(";");
  const joined = `${parts.map((_, index) => `[p${index}]`).join("")}concat=n=${parts.length}:v=1[out]`;
  await new Promise<void>((ok, fail) =>
    spawn(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-i", film, "-filter_complex", `${cuts};${joined}`].concat([
        "-map",
        "[out]",
        "-c:v",
        "libwebp_anim",
        "-quality",
        "62",
        "-loop",
        "0",
        out,
      ]),
      { stdio: "inherit" },
    ).on("exit", (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg exited ${code}`)))),
  );
};

const ffmpeg = (fps: number, out: string) => {
  const child = spawn(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(fps), "-i", "-"]
      .concat(ENCODER)
      .concat([out]),
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  const done = new Promise<void>((ok, fail) =>
    child.on("exit", (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg exited ${code}`)))),
  );
  return { stdin: child.stdin, done };
};

const takes = await bundleStage();
const server = serve();
const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
);
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("pageerror", (error) => console.error(error));
await page.goto(`http://localhost:${server.port}/`);
await page.waitForFunction(() => "film" in window);
const seconds = await page.evaluate(
  () => (window as unknown as { film: { seconds: number } }).film.seconds,
);
const renderAt = (t: number) =>
  page.evaluate(
    (at) =>
      (window as unknown as { film: { render: (t: number) => Promise<void> } }).film.render(at),
    t,
  );
const frame = { x: 0, y: 0, width: 1920, height: 1080 };
const picture = (options: { path?: string; type?: "jpeg" | "png"; quality?: number }) =>
  page.screenshot({ ...options, clip: frame });

if (args.stills) {
  const dir = join(root, ".dev", "video", "stills");
  await mkdir(dir, { recursive: true });
  for (const at of args.stills.split(",").map(Number)) {
    await renderAt(at);
    await picture({ path: join(dir, `${at.toFixed(2)}.png`) });
  }
  console.log(`Film ${seconds.toFixed(1)} s; stills in ${dir}`);
} else {
  const fps = Number(args.fps);
  const from = Number(args.from ?? 0);
  const to = Math.min(seconds, Number(args.to ?? seconds));
  const out = args.out ?? join(root, "docs", "assets", "kontext-film.mp4");
  const encoder = ffmpeg(fps, out);
  const frames = Math.round((to - from) * fps);
  for (let frame = 0; frame < frames; frame += 1) {
    await renderAt(from + frame / fps);
    const shot = await picture({ type: "jpeg", quality: 95 });
    if (!encoder.stdin.write(shot)) await new Promise((ok) => encoder.stdin.once("drain", ok));
    if (frame % (fps * 5) === 0)
      console.log(`${(from + frame / fps).toFixed(0)} / ${to.toFixed(0)} s`);
  }
  encoder.stdin.end();
  await encoder.done;
  if (!args.out) {
    // The poster: a moment that shows the app, for before the film plays.
    await renderAt(Number(process.env.POSTER_AT ?? 8));
    await picture({ path: out.replace(/\.mp4$/, ".jpg"), type: "jpeg", quality: 85 });
    await cutTeaser(out, teaserParts(takes), join(root, "docs", "assets", "kontext-teaser.webp"));
  }
  console.log(`${out}: ${(to - from).toFixed(1)} s`);
}
await browser.close();
server.stop();
