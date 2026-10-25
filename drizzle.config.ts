import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: ["./server/db/schema.ts", "./server/db/oauth-schema.ts"],
  out: "./server/db/migrations",
});
