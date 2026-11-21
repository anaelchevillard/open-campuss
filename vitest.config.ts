import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: { include: ["tests/*.test.{ts,tsx}"], environment: "node", env: { SECRET_KEY: "x".repeat(40) } },
  resolve: { alias: { "@": path("./src"), "server-only": path("./tests/empty.ts") } },
});
