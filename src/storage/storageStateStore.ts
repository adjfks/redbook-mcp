import fs from "node:fs/promises";
import path from "node:path";

import { ensureDir, fileExists, safeUnlink } from "../lib/fs.js";

export class StorageStateStore {
  constructor(private readonly storagePath: string) {}

  getPath(): string {
    return this.storagePath;
  }

  async ensureParentDir(): Promise<void> {
    await ensureDir(path.dirname(this.storagePath));
  }

  async exists(): Promise<boolean> {
    return fileExists(this.storagePath);
  }

  async readRaw(): Promise<string | null> {
    if (!(await this.exists())) return null;
    return await fs.readFile(this.storagePath, "utf-8");
  }

  async writeRaw(json: string): Promise<void> {
    await this.ensureParentDir();
    await fs.writeFile(this.storagePath, json, "utf-8");
  }

  async delete(): Promise<void> {
    await safeUnlink(this.storagePath);
  }
}

