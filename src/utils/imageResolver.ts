import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ensureDir, fileExists } from "../lib/fs.js";

function isHttpUrl(s: string): boolean {
  return s.startsWith("http://") || s.startsWith("https://");
}

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function guessExtFromContentType(contentType: string | null): string {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("image/jpeg")) return ".jpg";
  if (ct.includes("image/jpg")) return ".jpg";
  if (ct.includes("image/png")) return ".png";
  if (ct.includes("image/webp")) return ".webp";
  if (ct.includes("image/gif")) return ".gif";
  return "";
}

export type ImageResolveOptions = {
  /**
   * URL 图片下载目录
   */
  downloadDir?: string;
};

export class ImageResolver {
  private readonly downloadDir: string;

  constructor(opts?: ImageResolveOptions) {
    this.downloadDir = opts?.downloadDir ?? path.join(os.tmpdir(), "xiaohongshu_images");
  }

  async resolveImages(images: string[]): Promise<string[]> {
    const resolved: string[] = [];

    for (const img of images) {
      if (isHttpUrl(img)) {
        resolved.push(await this.downloadImage(img));
        continue;
      }

      // 本地路径：要求存在（跨平台）
      if (!(await fileExists(img))) {
        throw new Error(`本地图片不存在或不可访问: ${img}`);
      }
      resolved.push(img);
    }

    if (resolved.length === 0) {
      throw new Error("至少需要 1 张图片");
    }

    return resolved;
  }

  private async downloadImage(url: string): Promise<string> {
    await ensureDir(this.downloadDir);

    const cacheKey = sha256Hex(url);
    const basePath = path.join(this.downloadDir, `img_${cacheKey}`);

    // 若已有任意扩展名缓存则直接复用（降低重复下载）
    for (const ext of [".jpg", ".jpeg", ".png", ".webp", ".gif"]) {
      const p = `${basePath}${ext}`;
      if (await fileExists(p)) return p;
    }

    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(`下载图片失败: ${res.status} ${res.statusText}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());

    const ext = guessExtFromContentType(res.headers.get("content-type")) || ".img";
    const filePath = `${basePath}${ext}`;
    await fs.writeFile(filePath, buf);
    return filePath;
  }
}

