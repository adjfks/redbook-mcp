import type { Page } from "playwright";

import { readInitialStatePath } from "./initialState.js";
import { makeSearchUrl } from "./urls.js";

export type FilterOption = {
  sort_by?: string;
  note_type?: string;
  publish_time?: string;
  search_scope?: string;
  location?: string;
};

type InternalFilterOption = { filtersIndex: number; tagsIndex: number; text: string };

const filterOptionsMap: Record<number, InternalFilterOption[]> = {
  1: [
    { filtersIndex: 1, tagsIndex: 1, text: "综合" },
    { filtersIndex: 1, tagsIndex: 2, text: "最新" },
    { filtersIndex: 1, tagsIndex: 3, text: "最多点赞" },
    { filtersIndex: 1, tagsIndex: 4, text: "最多评论" },
    { filtersIndex: 1, tagsIndex: 5, text: "最多收藏" },
  ],
  2: [
    { filtersIndex: 2, tagsIndex: 1, text: "不限" },
    { filtersIndex: 2, tagsIndex: 2, text: "视频" },
    { filtersIndex: 2, tagsIndex: 3, text: "图文" },
  ],
  3: [
    { filtersIndex: 3, tagsIndex: 1, text: "不限" },
    { filtersIndex: 3, tagsIndex: 2, text: "一天内" },
    { filtersIndex: 3, tagsIndex: 3, text: "一周内" },
    { filtersIndex: 3, tagsIndex: 4, text: "半年内" },
  ],
  4: [
    { filtersIndex: 4, tagsIndex: 1, text: "不限" },
    { filtersIndex: 4, tagsIndex: 2, text: "已看过" },
    { filtersIndex: 4, tagsIndex: 3, text: "未看过" },
    { filtersIndex: 4, tagsIndex: 4, text: "已关注" },
  ],
  5: [
    { filtersIndex: 5, tagsIndex: 1, text: "不限" },
    { filtersIndex: 5, tagsIndex: 2, text: "同城" },
    { filtersIndex: 5, tagsIndex: 3, text: "附近" },
  ],
};

function findInternalOption(filtersIndex: number, text: string): InternalFilterOption {
  const options = filterOptionsMap[filtersIndex];
  if (!options) throw new Error(`筛选组 ${filtersIndex} 不存在`);
  const found = options.find((o) => o.text === text);
  if (!found) throw new Error(`在筛选组 ${filtersIndex} 中未找到文本 '${text}'`);
  return found;
}

function convertToInternalFilters(filter: FilterOption): InternalFilterOption[] {
  const out: InternalFilterOption[] = [];
  if (filter.sort_by) out.push(findInternalOption(1, filter.sort_by));
  if (filter.note_type) out.push(findInternalOption(2, filter.note_type));
  if (filter.publish_time) out.push(findInternalOption(3, filter.publish_time));
  if (filter.search_scope) out.push(findInternalOption(4, filter.search_scope));
  if (filter.location) out.push(findInternalOption(5, filter.location));
  return out;
}

export class SearchService {
  async search(page: Page, keyword: string, filters?: FilterOption): Promise<{ feeds: any[]; count: number }> {
    if (!keyword) throw new Error("缺少关键词参数");

    await page.goto(makeSearchUrl(keyword), { waitUntil: "domcontentloaded" });
    // 将固定等待时间从 1000ms 减少到 500ms，主要依赖后续的数据捕获
    await page.waitForTimeout(500);

    if (filters && Object.keys(filters).length > 0) {
      const internal = convertToInternalFilters(filters);
      // 悬停展开筛选面板
      const filterBtn = page.locator("div.filter").first();
      if ((await filterBtn.count()) > 0) {
        await filterBtn.hover({ timeout: 5000 }).catch(() => undefined);
        await page.waitForTimeout(300);
      }

      for (const f of internal) {
        const sel = `div.filter-panel div.filters:nth-child(${f.filtersIndex}) div.tags:nth-child(${f.tagsIndex})`;
        await page.locator(sel).first().click({ timeout: 3000 }).catch(() => undefined);
        await page.waitForTimeout(200);
      }

      await page.waitForTimeout(500);
    }

    // 优化：只读取 search.feeds 路径，避免全量序列化 __INITIAL_STATE__ 导致性能问题
    const feedsObj = await readInitialStatePath<any>(page, ["search", "feeds"]);
    if (!feedsObj) throw new Error("没有捕获到搜索 feeds 数据");

    // 兼容不同结构
    const data = feedsObj.value || feedsObj._value || feedsObj._rawValue || feedsObj;
    const feeds = data ? (JSON.parse(JSON.stringify(data)) as any[]) : null;

    if (!feeds) throw new Error("解析 feeds 数据失败");
    return { feeds, count: feeds.length };
  }
}


