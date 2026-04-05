import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/core/index.ts",
    "src/auth/index.ts",
    "src/whop/index.ts",
    "src/config/index.ts",
    "src/subscriptions/index.ts",
    "src/email/index.ts",
    "src/utils/index.ts",
    "src/analytics/index.ts",
    "src/webhooks/index.ts",
  ],
  format: ["esm"],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  outDir: "dist",
});
