import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const webDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": webDir } },
  test: { include: ["**/*.test.ts"], exclude: ["node_modules/**", ".next/**"] },
});
