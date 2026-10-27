import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

/** The Kontext server (sign-in and JMAP to Stalwart); in production it serves the app itself. */
const server = process.env.KONTEXT_SERVER ?? "http://127.0.0.1:18090";
// LiveKit's signalling for calls (dev/livekit.ts); in production Caddy passes /rtc on.
const livekit = process.env.KONTEXT_LIVEKIT ?? "http://127.0.0.1:17880";

const proxy = {
  "/jmap": { target: server },
  "/api": { target: server },
  // Agents (MCP), so the address shown in the settings also works in dev, and their OAuth discovery.
  "/mcp": { target: server },
  "/.well-known/oauth-protected-resource": { target: server },
  "/.well-known/oauth-authorization-server": { target: server },
  // Task lists for Thunderbird and phone apps (CalDAV), and where they look for them first.
  "/dav": { target: server },
  "/.well-known/caldav": { target: server },
  // OpenPGP keys of the company's people, for Thunderbird and others (WKD).
  "/.well-known/openpgpkey": { target: server },
  "/rtc": { target: livekit, ws: true },
};

export default defineConfig({
  plugins: [
    paraglideVitePlugin({ project: "./project.inlang", outdir: "./src/paraglide" }),
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    // The service worker: src/sw/service-worker.ts; the app registers it (src/pwa/pwa-status.tsx).
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src/sw",
      filename: "service-worker.ts",
      injectRegister: false,
      registerType: "prompt",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,webmanifest}"],
        // Not precached, so the first visit on a phone loads less; the browser keeps them when
        // used (/assets/ is cached for a year): pdf.js and its worker (PDF thumbnails), LiveKit
        // (calls, which need the network anyway), node-forge (S/MIME), and the font subsets for
        // Cyrillic and Vietnamese. The manifest's screenshots are for the install dialog only.
        globIgnores: [
          "**/pdf*.js",
          "**/pdf*.mjs",
          "**/livekit*.js",
          "**/node-forge*.js",
          "**/*-{cyrillic,cyrillic-ext,vietnamese,symbols2}-wght-*.woff2",
          "screenshots/**",
        ],
        maximumFileSizeToCacheInBytes: 4_000_000,
      },
      devOptions: { enabled: false },
      manifest: {
        id: "/",
        name: "Kontext",
        short_name: "Kontext",
        description: "Mail, Kalender und Kontakte, die dir gehören",
        lang: "de",
        dir: "ltr",
        start_url: "/mail",
        scope: "/",
        display: "standalone",
        display_override: ["standalone", "minimal-ui"],
        background_color: "#ffffff",
        theme_color: "#ffffff",
        categories: ["business", "productivity"],
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        screenshots: [
          {
            src: "/screenshots/wide.png",
            sizes: "1440x900",
            type: "image/png",
            form_factor: "wide",
            label: "Posteingang mit gemeinsamen Postfächern",
          },
          {
            src: "/screenshots/narrow.png",
            sizes: "780x1688",
            type: "image/png",
            form_factor: "narrow",
            label: "Posteingang am Handy",
          },
        ],
        shortcuts: [
          { name: "Neue Mail", url: "/mail?compose=new" },
          { name: "Kalender", url: "/calendar" },
          { name: "Kontakte", url: "/contacts" },
        ],
        // Kontext as the mail program for mailto: links (installed app, Chromium).
        protocol_handlers: [{ protocol: "mailto", url: "/compose?mailto=%s" }],
        // Shared from another app (photos, files, links) into a new mail.
        share_target: {
          action: "/share-target",
          method: "POST",
          enctype: "multipart/form-data",
          params: {
            title: "title",
            text: "text",
            url: "url",
            files: [{ name: "files", accept: ["*/*"] }],
          },
        },
      },
    }),
  ],
  build: {
    target: "es2022",
    rolldownOptions: {
      output: {
        // Fixed names for the big libraries loaded only on demand, which the service worker leaves
        // out of its precache (globIgnores above). Only their own modules: helpers they share with
        // the app stay where they were, or the first page would load the group with them.
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            { name: "livekit", test: /node_modules[\\/](livekit-client|@livekit)[\\/]/ },
            { name: "node-forge", test: /node_modules[\\/]node-forge[\\/]/ },
          ],
        },
      },
    },
  },
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  server: { port: Number(process.env.PORT ?? 5173), strictPort: true, proxy },
  preview: { port: Number(process.env.PORT ?? 4173), strictPort: true, proxy },
  test: {
    environment: "jsdom",
    include: [
      "src/**/*.test.{ts,tsx}",
      "dev/**/*.test.ts",
      "server/**/*.test.ts",
      "box/**/*.test.ts",
      "deploy/**/*.test.ts",
    ],
    setupFiles: ["./src/test-setup.ts"],
  },
});
