import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "node20",
  outDir: "dist",
  // 仅 CLI 需要 shebang。tsup 目前是对所有 entry 生效；
  // 但 index.js 带 shebang 不影响 require，所以保持简单先统一加上。
  banner: { js: "#!/usr/bin/env node" },
});

