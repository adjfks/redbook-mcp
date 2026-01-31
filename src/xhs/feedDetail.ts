import type { Page } from "playwright";

import { readInitialStatePath } from "./initialState.js";
import { makeFeedDetailUrl } from "./urls.js";

export type CommentLoadConfig = {
  click_more_replies?: boolean;
  max_replies_threshold?: number;
  max_comment_items?: number;
  scroll_speed?: "slow" | "normal" | "fast";
};

const DetailSelectors = {
  commentsContainer: ".comments-container",
  parentComment: ".parent-comment",
  showMore: ".show-more",
  endContainer: ".end-container",
  noComments: ".no-comments-text",
  accessWrapper: ".access-wrapper, .error-wrapper, .not-found-wrapper, .blocked-wrapper",
};

function scrollIntervalMs(speed: string | undefined): number {
  switch (speed) {
    case "slow":
      return 1100;
    case "fast":
      return 350;
    default:
      return 650;
  }
}

async function checkPageAccessible(page: Page): Promise<void> {
  const wrapper = page.locator(DetailSelectors.accessWrapper).first();
  if ((await wrapper.count()) === 0) return;
  const text = ((await wrapper.textContent()) ?? "").trim();
  if (!text) return;
  const keywords = [
    "当前笔记暂时无法浏览",
    "该内容因违规已被删除",
    "该笔记已被删除",
    "内容不存在",
    "笔记不存在",
    "已失效",
    "私密笔记",
    "仅作者可见",
    "因用户设置，你无法查看",
    "因违规无法查看",
  ];
  for (const kw of keywords) {
    if (text.includes(kw)) throw new Error(`笔记不可访问: ${kw}`);
  }
  throw new Error(`笔记不可访问: ${text}`);
}

async function clickShowMoreButtons(page: Page, maxRepliesThreshold: number): Promise<{ clicked: number; skipped: number }> {
  const els = page.locator(DetailSelectors.showMore);
  const count = await els.count();
  let clicked = 0;
  let skipped = 0;
  for (let i = 0; i < count && i < 6; i++) {
    const el = els.nth(i);
    const txt = ((await el.textContent()) ?? "").trim();
    const m = txt.match(/展开\s*(\d+)\s*条回复/);
    if (m && maxRepliesThreshold > 0) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > maxRepliesThreshold) {
        skipped++;
        continue;
      }
    }
    await el.scrollIntoViewIfNeeded().catch(() => undefined);
    await page.waitForTimeout(200);
    const ok = await el.click({ timeout: 800 }).then(() => true).catch(() => false);
    if (ok) {
      clicked++;
      await page.waitForTimeout(800);
    }
  }
  return { clicked, skipped };
}

async function loadAllComments(page: Page, config: CommentLoadConfig): Promise<void> {
  // 先滚到评论区
  const container = page.locator(DetailSelectors.commentsContainer).first();
  if ((await container.count()) > 0) {
    await container.scrollIntoViewIfNeeded().catch(() => undefined);
    await page.waitForTimeout(500);
  }

  // 无评论直接结束
  const noComments = page.locator(DetailSelectors.noComments).first();
  if ((await noComments.count()) > 0) {
    const t = ((await noComments.textContent()) ?? "").trim();
    if (t.includes("这是一片荒地")) return;
  }

  const maxItems = config.max_comment_items && config.max_comment_items > 0 ? config.max_comment_items : 0;
  const speed = config.scroll_speed ?? "normal";
  const interval = scrollIntervalMs(speed);
  const maxAttempts = maxItems > 0 ? maxItems * 3 : 300;

  let stagnant = 0;
  let lastCount = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const end = page.locator(DetailSelectors.endContainer).first();
    if ((await end.count()) > 0) {
      const t = ((await end.textContent()) ?? "").toUpperCase();
      if (t.includes("THE END")) return;
    }

    const count = await page.locator(DetailSelectors.parentComment).count().catch(() => 0);
    if (maxItems > 0 && count >= maxItems) return;

    if (count !== lastCount) {
      lastCount = count;
      stagnant = 0;
    } else {
      stagnant++;
    }

    if (config.click_more_replies && attempt % 3 === 0) {
      await clickShowMoreButtons(page, config.max_replies_threshold ?? 10);
    }

    await page.mouse.wheel(0, 900).catch(() => undefined);
    await page.waitForTimeout(interval);

    if (stagnant > 20) {
      // 大滚动冲刺
      await page
        .evaluate(() => (globalThis as any).scrollTo(0, (globalThis as any).document?.body?.scrollHeight ?? 0))
        .catch(() => undefined);
      await page.waitForTimeout(900);
      stagnant = 0;
    }
  }
}

export class FeedDetailService {
  async getFeedDetail(
    page: Page,
    args: { feed_id: string; xsec_token: string; load_all_comments?: boolean; comment_config?: CommentLoadConfig },
  ): Promise<any> {
    const url = makeFeedDetailUrl(args.feed_id, args.xsec_token);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    await checkPageAccessible(page);

    if (args.load_all_comments) {
      await loadAllComments(page, {
        click_more_replies: args.comment_config?.click_more_replies ?? false,
        max_replies_threshold: args.comment_config?.max_replies_threshold ?? 10,
        max_comment_items: args.comment_config?.max_comment_items ?? 0,
        scroll_speed: args.comment_config?.scroll_speed ?? "normal",
      }).catch(() => undefined);
    }

    // 只读取需要的子树，避免全量 __INITIAL_STATE__ 的 JSON.stringify 在页面侧爆栈
    const node = await readInitialStatePath<any>(page, ["note", "noteDetailMap", args.feed_id]);
    if (!node) throw new Error("没有捕获到 feed 详情数据");
    return node;
  }
}

