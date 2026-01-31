import path from "node:path";

import type { Page } from "playwright";

import type { AppConfig } from "../lib/config.js";
import { ensureDir, fileExists } from "../lib/fs.js";
import { BrowserManager } from "./browserManager.js";
import { PublishContentArgs as BasePublishArgs } from "./publishImage.js";

const VideoSelectors = {
  publishUrl: "https://creator.xiaohongshu.com/publish/publish?source=official",
  uploadContent: "div.upload-content",
  tab: "div.creator-tab",
  uploadInput: ".upload-input, input[type='file']",
  publishBtn: "button.publishBtn",
  titleInput: "div.d-input input",
};

export type PublishVideoArgs = Omit<BasePublishArgs, "images" | "schedule_at"> & {
  video: string;
  schedule_at?: string;
};

export class PublishVideoService {
  constructor(private readonly browserManager: BrowserManager, private readonly config: AppConfig) {}

  async publishVideo(args: PublishVideoArgs): Promise<{ title: string; status: string }> {
    if (!args.video) throw new Error("必须提供本地视频文件路径");
    if (!(await fileExists(args.video))) throw new Error(`视频文件不存在或不可访问: ${args.video}`);

    const screenshotsDir = path.join(this.config.dataDir, "screenshots");
    await ensureDir(screenshotsDir);

    return await this.browserManager.run("publish_with_video", async (_ctx, page) => {
      try {
        await page.goto(VideoSelectors.publishUrl, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(VideoSelectors.uploadContent, { timeout: 30_000 });
        await page.waitForTimeout(1000);

        // 切到上传视频 tab（复用 publishImage 的简化方式）
        const tabs = page.locator(VideoSelectors.tab);
        const n = await tabs.count();
        for (let i = 0; i < n; i++) {
          const tab = tabs.nth(i);
          const txt = (await tab.textContent())?.trim();
          if (txt === "上传视频") {
            await tab.click().catch(() => undefined);
            break;
          }
        }
        await page.waitForTimeout(1000);

        // 标题
        await page.locator(VideoSelectors.titleInput).first().fill(args.title);

        // 视频上传
        await page.setInputFiles(VideoSelectors.uploadInput, args.video);

        // 等待发布按钮可点击（简单版）
        const btn = page.locator(VideoSelectors.publishBtn).first();
        await btn.waitFor({ timeout: 10 * 60 * 1000 }); // 最多 10 分钟
        await btn.click({ timeout: 10_000 });
        await page.waitForTimeout(3000);

        return { title: args.title, status: "发布完成" };
      } catch (err: any) {
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        const shot = path.join(screenshotsDir, `publish_video_${ts}.png`);
        await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);
        const msg = err?.message ? String(err.message) : String(err);
        throw new Error(`${msg}\n截图: ${shot}`);
      }
    });
  }
}

