import path from "node:path";

import { startMcpServer } from "./mcp/server.js";
import { defaultDataDir, defaultStoragePath, type AppConfig } from "./lib/config.js";
import { ensureDir } from "./lib/fs.js";

function parseBool(v: string | undefined, defaultValue: boolean): boolean {
  if (v === undefined) return defaultValue;
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return defaultValue;
}

function readArgValue(argv: string[], name: string): string | undefined {
  const idx = argv.findIndex((a) => a === name);
  if (idx < 0) return undefined;
  return argv[idx + 1];
}

async function main() {
  const argv = process.argv.slice(2);

  const dataDir = readArgValue(argv, "--dataDir") ?? process.env.XHS_DATA_DIR ?? defaultDataDir();
  const storagePath =
    readArgValue(argv, "--storagePath") ?? process.env.XHS_STORAGE_PATH ?? defaultStoragePath(dataDir);
  const headless = parseBool(readArgValue(argv, "--headless") ?? process.env.XHS_HEADLESS, true);
  const chromePath = readArgValue(argv, "--chromePath") ?? process.env.XHS_CHROME_PATH;

  await ensureDir(dataDir);

  const config: AppConfig = {
    headless,
    storagePath: path.resolve(storagePath),
    chromePath,
    dataDir: path.resolve(dataDir),
  };

  await startMcpServer(config);
}

main().catch((err) => {
  // stdio server 场景：只写 stderr，避免污染 stdout（stdout 用于 MCP 协议通信）
  // eslint-disable-next-line no-console
  process.exit(1);
});

