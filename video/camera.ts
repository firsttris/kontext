import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Browser } from "@playwright/test";

/**
 * A camera picture for the calls in the film: a person drawn as a silhouette in a warm room, no
 * real face. Chromium plays it as its camera (--use-file-for-fake-video-capture wants .y4m).
 */
const html = (wall: string, shirt: string, long: boolean) => `<body style="margin:0">
<div style="position:relative;width:640px;height:480px;overflow:hidden;background:
  radial-gradient(circle at 75% 20%, rgba(255,240,210,.9), transparent 45%),
  linear-gradient(160deg, ${wall}, #2a2a30)">
  <div style="position:absolute;left:40px;top:60px;width:150px;height:200px;border-radius:8px;
    background:linear-gradient(#ffffff22,#ffffff08);filter:blur(2px)"></div>
  <div style="position:absolute;left:470px;top:250px;width:120px;height:230px;border-radius:60px 60px 0 0;
    background:#3f6b4a;filter:blur(6px);opacity:.7"></div>
  ${long ? `<div style="position:absolute;left:225px;top:95px;width:190px;height:260px;border-radius:95px 95px 40px 40px;background:#5a3a22"></div>` : ""}
  <div style="position:absolute;left:250px;top:110px;width:140px;height:165px;border-radius:50%;
    background:radial-gradient(circle at 40% 35%, #e2b48f, #b07a55)"></div>
  <div style="position:absolute;left:245px;top:92px;width:150px;height:80px;border-radius:75px 75px 30px 30px;
    background:${long ? "#5a3a22" : "#3b2a20"}"></div>
  <div style="position:absolute;left:160px;top:285px;width:320px;height:240px;border-radius:150px 150px 0 0;
    background:${shirt}"></div>
</div></body>`;

const run = (args: string[]) =>
  new Promise<void>((ok, fail) =>
    spawn("ffmpeg", args, { stdio: "ignore" }).on("exit", (code) =>
      code === 0 ? ok() : fail(new Error(`ffmpeg exited ${code}`)),
    ),
  );

export const cameraFile = async (
  browser: Browser,
  name: string,
  { wall, shirt, long = false }: { wall: string; shirt: string; long?: boolean },
) => {
  const dir = ".dev/video/camera";
  await mkdir(dir, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  await page.setContent(html(wall, shirt, long));
  const png = join(dir, `${name}.png`);
  await page.screenshot({ path: png });
  await page.close();
  const y4m = join(dir, `${name}.y4m`);
  await run(["-y", "-loop", "1", "-i", png, "-t", "1", "-r", "10", "-pix_fmt", "yuv420p", y4m]);
  return y4m;
};
