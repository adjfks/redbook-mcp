import path from "node:path";

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import { ensureDir, fileExists } from "../lib/fs.js";
import { Mutex } from "../lib/mutex.js";
import type { AppConfig } from "../lib/config.js";

export class BrowserManager {
  private readonly mutex = new Mutex();

  constructor(private readonly config: AppConfig) {}

  /**
   * 所有浏览器自动化任务统一串行执行，避免并发导致页面状态互相干扰。
   */
  async run<T>(name: string, fn: (ctx: BrowserContext, page: Page) => Promise<T>): Promise<T> {
    return this.mutex.runExclusive(async () => {
      const { browser, ctx } = await this.newContext();
      const page = await ctx.newPage();

      try {
        return await fn(ctx, page);
      } finally {
        await page.close().catch(() => undefined);
        await ctx.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
      }
    });
  }

  private async newContext(): Promise<{ browser: Browser; ctx: BrowserContext }> {
    await ensureDir(this.config.dataDir);

    const browser = await chromium.launch({
      headless: this.config.headless,
      executablePath: this.config.chromePath,
    });

    const storageExists = await fileExists(this.config.storagePath);
    const ctx = await browser.newContext(
      storageExists
        ? {
            storageState: this.config.storagePath,
          }
        : {},
    );

    // 降低一些自动化痕迹（不保证有效，但成本低）
    await ctx.addInitScript(() => {
      // @ts-ignore
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    return { browser, ctx };
  }

  /**
   * 用于登录扫码：强制有头打开，返回 ctx/page 由调用方控制生命周期。
   */
  async openInteractiveLogin(): Promise<{ browser: Browser; ctx: BrowserContext; page: Page }> {
    await ensureDir(this.config.dataDir);
    const browser = await chromium.launch({
      headless: false,
      executablePath: this.config.chromePath,
    });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    return { browser, ctx, page };
  }

  getStoragePath(): string {
    return path.resolve(this.config.storagePath);
  }
}

