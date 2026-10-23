import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/** Stalwart's HTTP listener; the app talks to it through this proxy, as Caddy does in production. */
const stalwart = process.env.STALWART_URL ?? "http://127.0.0.1:18080";
const proxy = {
  "/jmap": { target: stalwart, changeOrigin: true, ws: true },
  "/.well-known/jmap": { target: stalwart, changeOrigin: true },
};

export default defineConfig({
  plugins: [
    paraglideVitePlugin({ project: "./project.inlang", outdir: "./src/paraglide" }),
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  server: { port: Number(process.env.PORT ?? 5173), strictPort: true, proxy },
  preview: { port: Number(process.env.PORT ?? 4173), strictPort: true, proxy },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "dev/**/*.test.ts"],
    setupFiles: ["./src/test-setup.ts"],
  },
});
