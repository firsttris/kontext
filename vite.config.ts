import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/** The Kontext server (sign-in and JMAP to Stalwart); in production it serves the app itself. */
const server = process.env.KONTEXT_SERVER ?? "http://127.0.0.1:18090";
const proxy = {
  "/jmap": { target: server },
  "/api": { target: server },
};

export default defineConfig({
  plugins: [
    paraglideVitePlugin({ project: "./project.inlang", outdir: "./src/paraglide" }),
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  build: { target: "es2022" },
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
  server: { port: Number(process.env.PORT ?? 5173), strictPort: true, proxy },
  preview: { port: Number(process.env.PORT ?? 4173), strictPort: true, proxy },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "dev/**/*.test.ts", "server/**/*.test.ts"],
    setupFiles: ["./src/test-setup.ts"],
  },
});
