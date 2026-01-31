import type { Browser, BrowserContext, Page } from "playwright";

import { StorageStateStore } from "../storage/storageStateStore.js";
import { Selectors } from "./selectors.js";
import { BrowserManager } from "./browserManager.js";

type LoginQrcodeResult =
  | { isLoggedIn: true; timeout: string; imgBase64?: string }
  | { isLoggedIn: false; timeout: string; imgBase64: string };

export class LoginService {
  private activeLogin:
    | {
      browser: Browser;
      ctx: BrowserContext;
      page: Page;
      store: StorageStateStore;
      timeoutMs: number;
      startedAt: number;
      settle: Promise<void>;
    }
    | undefined;

  constructor(private readonly browserManager: BrowserManager, private readonly store: StorageStateStore) { }

  async checkLoginStatus(): Promise<{ isLoggedIn: boolean; username: string }> {
    return await this.browserManager.run("check_login_status", async (_ctx, page) => {
      await page.goto(Selectors.exploreUrl, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1000);
      const isLoggedIn = (await page.locator(Selectors.loginStatusChannel).count()) > 0;
      return { isLoggedIn, username: "redbook-mcp" };
    });
  }

  /**
   * 获取二维码并在后台等待登录（成功后写入 storageState.json）。
   * 注意：为了让客户端尽快拿到二维码，本方法不会阻塞等待扫码完成。
   */
  async getLoginQrcode(): Promise<LoginQrcodeResult> {
    const status = await this.checkLoginStatus();
    if (status.isLoggedIn) {
      return { isLoggedIn: true, timeout: "0s" };
    }

    // 已有登录会话就复用（避免重复弹出多个窗口）
    if (this.activeLogin) {
      const elapsed = Date.now() - this.activeLogin.startedAt;
      const remaining = Math.max(0, this.activeLogin.timeoutMs - elapsed);
      const imgBase64 = await this.extractQrcodeBase64(this.activeLogin.page);
      if (!imgBase64) return { isLoggedIn: true, timeout: "0s" };
      return { isLoggedIn: false, timeout: `${Math.ceil(remaining / 1000)}s`, imgBase64 };
    }

    const timeoutMs = 4 * 60 * 1000;
    const { browser, ctx, page } = await this.browserManager.openInteractiveLogin();

    const sessionStore = this.store;
    await page.goto(Selectors.exploreUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // 若刚打开就已登录，直接写 state 并关闭
    if ((await page.locator(Selectors.loginStatusChannel).count()) > 0) {
      await sessionStore.ensureParentDir();
      await ctx.storageState({ path: sessionStore.getPath() });
      await page.close().catch(() => undefined);
      await ctx.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
      return { isLoggedIn: true, timeout: "0s" };
    }

    const imgBase64 = await this.extractQrcodeBase64(page);
    if (!imgBase64) {
      // 理论上不会发生：页面没登录也没二维码
      await page.close().catch(() => undefined);
      await ctx.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
      return { isLoggedIn: true, timeout: "0s" };
    }

    const settle = this.waitForLoginAndPersist({ browser, ctx, page, store: sessionStore, timeoutMs });
    this.activeLogin = {
      browser,
      ctx,
      page,
      store: sessionStore,
      timeoutMs,
      startedAt: Date.now(),
      settle,
    };

    // 不等待 settle，直接返回二维码给客户端显示
    return { isLoggedIn: false, timeout: `${Math.ceil(timeoutMs / 1000)}s`, imgBase64 };
  }

  async deleteCookies(): Promise<{ deletedPath: string }> {
    // 如果正在登录，先关闭登录会话
    await this.stopActiveLogin();
    await this.store.delete();
    return { deletedPath: this.store.getPath() };
  }

  private async extractQrcodeBase64(page: Page): Promise<string | null> {
    const src = await page.locator(Selectors.loginQrcodeImg).getAttribute("src");
    if (!src) return null;
    if (src.startsWith("data:image/png;base64,")) return src.replace("data:image/png;base64,", "");
    if (src.startsWith("data:image/")) {
      const idx = src.indexOf("base64,");
      if (idx >= 0) return src.slice(idx + "base64,".length);
    }
    // 兜底：如果是 URL，这里不支持直接下载（后续可扩展）
    return null;
  }

  private async waitForLoginAndPersist(args: {
    browser: Browser;
    ctx: BrowserContext;
    page: Page;
    store: StorageStateStore;
    timeoutMs: number;
  }): Promise<void> {
    const { browser, ctx, page, store, timeoutMs } = args;
    try {
      await page.waitForSelector(Selectors.loginStatusChannel, { timeout: timeoutMs });
      await store.ensureParentDir();
      await ctx.storageState({ path: store.getPath() });
    } catch {
      // ignore timeout/cancel
    } finally {
      await page.close().catch(() => undefined);
      await ctx.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
      this.activeLogin = undefined;
    }
  }

  private async stopActiveLogin(): Promise<void> {
    const s = this.activeLogin;
    if (!s) return;
    this.activeLogin = undefined;
    await s.page.close().catch(() => undefined);
    await s.ctx.close().catch(() => undefined);
    await s.browser.close().catch(() => undefined);
  }
}

