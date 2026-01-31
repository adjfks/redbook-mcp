import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function safeUnlink(p: string): Promise<void> {
  try {
    await fs.unlink(p);
  } catch (e: any) {
    if (e?.code === "ENOENT") return;
    throw e;
  }
}

export function withExt(basePath: string, ext: string): string {
  const dir = path.dirname(basePath);
  const base = path.basename(basePath, path.extname(basePath));
  return path.join(dir, `${base}${ext}`);
}

