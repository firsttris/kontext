/**
 * The app icon, a folded paper plane ("Senden"), drawn once here and written to `public/` in every
 * size the browsers ask for: `bun run icons`. Rendered by Chromium from Playwright, so the PNGs
 * match the SVG exactly.
 */
import { writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const out = (name: string) => new URL(`../public/${name}`, import.meta.url).pathname;

/** The plane in a 512 box, scaled about the centre (maskable icons keep it in the safe circle). */
const plane = (scale: number, faces: [string, string, string]) =>
  `<g transform="translate(256 256) scale(${scale}) translate(-252 -260)" stroke-linejoin="round">
    <path d="M404 112 100 244l122 46z" fill="${faces[0]}"/>
    <path d="M404 112 222 290l50 118z" fill="${faces[1]}"/>
    <path d="M222 290l50 118-6-96z" fill="${faces[2]}"/></g>`;

/** Rounded for the browser tab and the "any" icons; square where the system cuts its own shape. */
const appIcon = ({ radius, scale }: { radius: number; scale: number }) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><title>Kontext</title><defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#38bdf8"/><stop offset="1" stop-color="#4338ca"/></linearGradient>
<linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>
<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#0b1440" flood-opacity=".35"/></filter>
<clipPath id="tile"><rect width="512" height="512" rx="${radius}"/></clipPath></defs>
<g clip-path="url(#tile)"><rect width="512" height="512" fill="url(#bg)"/><rect width="512" height="512" fill="url(#gloss)"/>
<g filter="url(#shadow)">${plane(scale, ["#fff", "#e0e7ff", "#a5b4fc"])}</g></g></svg>`;

// Android draws the notification badge from its alpha channel alone: a white plane on transparency.
// One outline, not the three faces: their shared edges would show as seams.
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<path transform="translate(256 256) scale(1.45) translate(-252 -260)" d="M404 112 100 244l122 46 50 118z" fill="#fff"/></svg>`;

const rounded = appIcon({ radius: 112, scale: 1 });
const square = appIcon({ radius: 0, scale: 1 });
const maskable = appIcon({ radius: 0, scale: 0.78 });

const pngs: [name: string, svg: string, size: number][] = [
  ["icon-192.png", rounded, 192],
  ["icon-512.png", rounded, 512],
  ["icon-maskable-512.png", maskable, 512],
  ["apple-touch-icon.png", square, 180],
  ["badge-96.png", badge, 96],
];

await writeFile(out("favicon.svg"), rounded);
const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
);
const page = await browser.newPage();
for (const [name, svg, size] of pngs) {
  await page.setViewportSize({ width: size, height: size });
  const sized = svg.replace("<svg ", `<svg width="${size}" height="${size}" `);
  await page.setContent(`<body style="margin:0">${sized}</body>`);
  await page.screenshot({ path: out(name), omitBackground: true });
}
await browser.close();
