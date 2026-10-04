import { defineConfig } from "tsup"
export default defineConfig({
  entry: [
    "src/main.ts",
    "src/migrate.ts",
    "src/worker.ts",
    "src/infrastructure/parser-child.ts",
    "src/provision.ts",
  ],
  format: ["esm"],
  platform: "node",
  target: "node22",
  noExternal: ["@open-file/core"],
  clean: true,
  sourcemap: true,
})
