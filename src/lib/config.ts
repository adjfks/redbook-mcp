import os from "node:os";
import path from "node:path";

export type AppConfig = {
  headless: boolean;
  /**
   * Playwright storageState.json 的路径（登录态）。
   */
  storagePath: string;
  /**
   * 指定本机 Chrome/Chromium 可执行文件路径（可选）。
   */
  chromePath?: string;
  /**
   * 用于保存运行时产物（截图、下载等）的目录。
   */
  dataDir: string;
};

export function defaultDataDir(): string {
  return path.join(os.homedir(), ".redbook-mcp");
}

export function defaultStoragePath(dataDir: string): string {
  return path.join(dataDir, "storageState.json");
}

