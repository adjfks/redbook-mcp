import type { Page } from "playwright";

import { readInitialState } from "./initialState.js";

export type Feed = any;

export class FeedsService {
  async listFeeds(page: Page): Promise<{ feeds: Feed[]; count: number }> {
    await page.goto("https://www.xiaohongshu.com", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);

    // window.__INITIAL_STATE__.feed.feeds.value/_value
    const s: any = await readInitialState(page);
    const feedsObj = s?.feed?.feeds;
    const data = feedsObj?.value !== undefined ? feedsObj.value : feedsObj?._value;
    const feeds = data ? (JSON.parse(JSON.stringify(data)) as Feed[]) : null;
    if (!feeds) throw new Error("没有捕获到 feeds 数据（可能未登录或页面不可访问）");

    return { feeds, count: feeds.length };
  }
}

