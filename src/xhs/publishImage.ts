import path from "node:path";

import type { Locator, Page } from "playwright";

import type { AppConfig } from "../lib/config.js";
import { ensureDir } from "../lib/fs.js";
import { ImageResolver } from "../utils/imageResolver.js";
import { BrowserManager } from "./browserManager.js";

// 注意：本文件会在 page.evaluate 的浏览器上下文中引用 document/HTMLElement。
// 在 Node 的 TS 类型环境下，为避免引入 DOM lib，这里做轻量声明。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const document: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const HTMLElement: any;

type SelectorDef =
  | string
  | {
      selector: string;
      innerText?: string;
    };

function selectorOf(def: SelectorDef): string {
  return typeof def === "string" ? def : def.selector;
}

function getLocator(page: Page, def: SelectorDef): Locator {
  const base = page.locator(selectorOf(def));
  if (typeof def === "string") return base;
  return def.innerText ? base.filter({ hasText: def.innerText }) : base;
}

const PublishSelectors = {
  publishUrl: "https://creator.xiaohongshu.com/publish/publish?source=official",
  uploadContent: "div.upload-content",
  tab: "div.creator-tab",
  popover: "div.d-popover",
  uploadInput: ".upload-input",
  uploadedPreview: ".img-preview-area .pr",
  titleInput: "div.d-input input",
  submitButton: {
    selector: "div.submit div.d-button-content",
    innerText: "发布",
  },
  qlEditor: "div.ql-editor",
  placeholderP: 'p[data-placeholder*="输入正文描述"]',
  topicContainerFirstItem: "#creator-editor-topic-container .item",
  scheduleRadioLabel: 'span.el-radio__label:has-text("定时发布")',
  dateTimePicker: "input.el-input__inner[placeholder='选择日期和时间']",
  datePicker: "input.el-input__inner[placeholder='选择日期']",
  timePicker: "input.el-input__inner[placeholder='选择时间']",
  pickerConfirmBtn: "button.el-picker-panel__link-btn:has-text(\"确定\")",
} as const satisfies Record<string, SelectorDef>;

export type PublishContentArgs = {
  title: string;
  content: string;
  images: string[];
  tags?: string[];
  schedule_at?: string;
};

function computeTitleWidth(title: string): number {
  // 简化版：中日韩/全角算 2，其他算 1
  let w = 0;
  for (const ch of title) {
    const code = ch.codePointAt(0) ?? 0;
    const isWide =
      (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
      (code >= 0x2e80 && code <= 0xa4cf) || // CJK, Yi, etc.
      (code >= 0xac00 && code <= 0xd7a3) || // Hangul Syllables
      (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility Ideographs
      (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6);
    w += isWide ? 2 : 1;
  }
  return w;
}

function parseScheduleAt(scheduleAt?: string): Date | null {
  if (!scheduleAt) return null;
  const d = new Date(scheduleAt);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`定时发布时间格式错误，请使用 ISO8601/RFC3339：${scheduleAt}`);
  }
  return d;
}

function validateScheduleAt(d: Date): void {
  const now = Date.now();
  const min = now + 60 * 60 * 1000;
  const max = now + 14 * 24 * 60 * 60 * 1000;
  const t = d.getTime();
  if (t < min) throw new Error("定时发布时间必须至少在 1 小时后");
  if (t > max) throw new Error("定时发布时间不能超过 14 天");
}

function formatDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

async function removePopover(page: Page): Promise<void> {
  await page.evaluate((sel) => {
    document.querySelectorAll(sel).forEach((e: any) => e.remove());
  }, selectorOf(PublishSelectors.popover));
}

async function clickEmpty(page: Page): Promise<void> {
  await page.mouse.click(420, 40).catch(() => undefined);
}

async function clickTabByText(page: Page, tabText: string): Promise<void> {
  await page.waitForSelector(selectorOf(PublishSelectors.uploadContent), { timeout: 30_000 });

  const tabs = getLocator(page, PublishSelectors.tab);
  const n = await tabs.count();
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    for (let i = 0; i < n; i++) {
      const tab = tabs.nth(i);
      const txt = (await tab.textContent())?.trim();
      if (txt !== tabText) continue;
      try {
        await tab.click({ timeout: 2000 });
        return;
      } catch {
        await removePopover(page);
        await clickEmpty(page);
        await page.waitForTimeout(200);
      }
    }
    await page.waitForTimeout(200);
  }

  throw new Error(`没有找到发布 TAB - ${tabText}`);
}

async function waitUploadedCountAtLeast(page: Page, expected: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const count = await getLocator(page, PublishSelectors.uploadedPreview).count().catch(() => 0);
    if (count >= expected) return;
    await page.waitForTimeout(500);
  }
  throw new Error("上传超时，请检查网络连接和图片大小");
}

async function getContentEditableLocator(page: Page) {
  const ql = getLocator(page, PublishSelectors.qlEditor);
  if ((await ql.count()) > 0) return ql.first();

  // fallback：找到 placeholder p，往上找 role=textbox
  const hasPlaceholder = (await getLocator(page, PublishSelectors.placeholderP).count()) > 0;
  if (!hasPlaceholder) return null;

  await page.evaluate(() => {
    const p = Array.from(document.querySelectorAll("p")).find((el) => {
      const ph = (el as any).getAttribute?.("data-placeholder") ?? "";
      return ph.includes("输入正文描述");
    });
    if (!p) return;
    let cur: any = p as any;
    for (let i = 0; i < 8; i++) {
      const parent = cur.parentElement;
      if (!parent) break;
      if (parent.getAttribute("role") === "textbox") {
        parent.setAttribute("data-xhs-textbox", "true");
        break;
      }
      cur = parent;
    }
  });

  const tb = page.locator('[data-xhs-textbox="true"]');
  if ((await tb.count()) > 0) return tb.first();
  return null;
}

async function inputTags(page: Page, tags: string[]): Promise<void> {
  if (tags.length === 0) return;
  for (const raw of tags) {
    const tag = raw.replace(/^#/, "");
    await page.keyboard.type(`#${tag}`, { delay: 30 });
    await page.waitForTimeout(800);

    const suggestion = getLocator(page, PublishSelectors.topicContainerFirstItem).first();
    if ((await suggestion.count()) > 0) {
      await suggestion.click({ timeout: 1500 }).catch(async () => {
        await page.keyboard.type(" ", { delay: 10 });
      });
    } else {
      await page.keyboard.type(" ", { delay: 10 });
    }
    await page.waitForTimeout(400);
  }
}

async function setSchedulePublish(page: Page, when: Date): Promise<void> {
  await getLocator(page, PublishSelectors.scheduleRadioLabel).click({ timeout: 10_000 });
  await page.waitForTimeout(500);

  // 打开日期时间面板
  await getLocator(page, PublishSelectors.dateTimePicker).click({ timeout: 10_000 });
  await page.waitForTimeout(500);

  // 设置日期与时间
  const dateStr = formatDate(when);
  const timeStr = formatTime(when);

  const dateInput = getLocator(page, PublishSelectors.datePicker);
  await dateInput.click({ timeout: 10_000 });
  await dateInput.fill(dateStr);
  await page.waitForTimeout(300);

  const timeInput = getLocator(page, PublishSelectors.timePicker);
  await timeInput.click({ timeout: 10_000 });
  await timeInput.fill(timeStr);
  await page.waitForTimeout(300);

  await getLocator(page, PublishSelectors.pickerConfirmBtn).click({ timeout: 10_000 });
  await page.waitForTimeout(500);
}

export class PublishImageService {
  private readonly resolver: ImageResolver;

  constructor(
    private readonly browserManager: BrowserManager,
    private readonly config: AppConfig,
    resolver?: ImageResolver,
  ) {
    this.resolver = resolver ?? new ImageResolver();
  }

  async publishContent(args: PublishContentArgs): Promise<{ title: string; images: number; status: string; note?: string }> {
    if (!args.title) throw new Error("title 不能为空");
    if (!args.content) throw new Error("content 不能为空");
    if (!Array.isArray(args.images) || args.images.length === 0) throw new Error("images 至少需要 1 张");

    // 标题长度： runewidth <= 40
    if (computeTitleWidth(args.title) > 40) {
      throw new Error("标题长度超过限制（最多 20 个中文字或 40 个英文单位）");
    }

    const scheduleAt = parseScheduleAt(args.schedule_at);
    if (scheduleAt) validateScheduleAt(scheduleAt);

    const tags = (args.tags ?? []).filter(Boolean);
    const noteParts: string[] = [];
    const effectiveTags = tags.length > 10 ? tags.slice(0, 10) : tags;
    if (tags.length > 10) noteParts.push("标签数量超过 10，已截断前 10 个标签");

    const imagePaths = await this.resolver.resolveImages(args.images);

    const screenshotsDir = path.join(this.config.dataDir, "screenshots");
    await ensureDir(screenshotsDir);

    return await this.browserManager.run("publish_content", async (ctx, page) => {
      try {
        await page.goto(PublishSelectors.publishUrl, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);

        // 等待 DOM 稳定一些
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(1000);

        await clickTabByText(page, "上传图文");
        await page.waitForTimeout(1000);

        // 上传图片
        await page.waitForSelector(selectorOf(PublishSelectors.uploadInput), { timeout: 30_000 });
        await page.setInputFiles(selectorOf(PublishSelectors.uploadInput), imagePaths);
        await waitUploadedCountAtLeast(page, imagePaths.length, 60_000);

        // 标题
        await getLocator(page, PublishSelectors.titleInput).first().click({ timeout: 10_000 });
        await getLocator(page, PublishSelectors.titleInput).first().fill(args.title);
        await page.waitForTimeout(500);

        // 正文
        const editor = await getContentEditableLocator(page);
        if (!editor) throw new Error("没有找到内容输入框");
        await editor.click({ timeout: 10_000 });
        await editor.fill(args.content);
        await page.waitForTimeout(800);

        // 标签
        await inputTags(page, effectiveTags);

        // 定时发布（可选）
        if (scheduleAt) {
          await setSchedulePublish(page, scheduleAt);
        }

        // 提交
        await getLocator(page, PublishSelectors.submitButton).first().click({ timeout: 10_000 });
        await page.waitForTimeout(3000);

        return {
          title: args.title,
          images: imagePaths.length,
          status: "发布完成",
          note: noteParts.length ? noteParts.join("；") : undefined,
        };
      } catch (err: any) {
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        const shot = path.join(screenshotsDir, `publish_content_${ts}.png`);
        await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);
        const msg = err?.message ? String(err.message) : String(err);
        throw new Error(`${msg}\n截图: ${shot}`);
      } finally {
        // 持久化 storageState（若发生登录态更新）
        await ctx.storageState({ path: this.browserManager.getStoragePath() }).catch(() => undefined);
      }
    });
  }
}

