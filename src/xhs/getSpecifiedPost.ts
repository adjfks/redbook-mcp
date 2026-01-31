import type { Page } from "playwright";

import { FeedDetailService } from "./feedDetail.js";
import { SearchService, type FilterOption } from "./search.js";

const MAX_RETRY = 2;

export class GetSpecifiedPostService {
  static async getSpecifiedPost(page: Page, keyword: string, post_count: number, filters?: FilterOption): Promise<any[]> {
    if (!keyword) throw new Error("缺少关键词参数");
    if (post_count <= 0) throw new Error("帖子数量必须大于0");

    const searchService = new SearchService();
    const feedDetailService = new FeedDetailService();

    // 1. 使用 SearchService 搜索关键词，应用筛选条件
    let searchResult = await searchService.search(page, keyword, filters);
    let feeds = searchResult.feeds || [];
    let retry = 0;

    do {
      searchResult = await searchService.search(page, keyword, filters);
      feeds = searchResult.feeds || [];
      retry++;
      if (feeds.length > 0) {
        break;
      }
    } while (feeds.length === 0 && retry < MAX_RETRY)

    // 2. 筛选出有效的 feed 信息
    const validFeeds: { feedId: string; xsecToken: string }[] = [];
    for (const feed of feeds) {
      // 提取 feed_id 和 xsecToken
      const feedId =
        feed.id ||
        feed.noteId ||
        feed.note_id ||
        feed.feed_id ||
        feed.note?.id ||
        feed.noteCard?.id ||
        feed.itemId;

      const xsecToken =
        feed.xsecToken ||
        feed.xsec_token ||
        feed.token ||
        feed.noteCard?.xsecToken ||
        feed.noteCard?.xsec_token;

      if (feedId && xsecToken) {
        validFeeds.push({ feedId, xsecToken });
      }
    }

    // 3. 取前 post_count 个有效 feed 并发获取详情
    const targetFeeds = validFeeds.slice(0, post_count);
    const results: any[] = new Array(targetFeeds.length).fill(null);

    // 并发控制：最多同时开启 5 个页面
    const CONCURRENCY = 5;
    let cursor = 0;

    const worker = async () => {
      while (true) {
        const i = cursor++;
        if (i >= targetFeeds.length) break;

        const { feedId, xsecToken } = targetFeeds[i];
        let newPage: Page | null = null;
        try {
          newPage = await page.context().newPage();
          // 获取帖子详情
          const detail = await feedDetailService.getFeedDetail(newPage, {
            feed_id: feedId,
            xsec_token: xsecToken,
            load_all_comments: false,
          });
          results[i] = cleanPostData(detail);
        } catch (error) {
          // 忽略单个失败
        } finally {
          if (newPage) await newPage.close().catch(() => undefined);
        }
      }
    };

    const workers = Array.from({ length: Math.min(targetFeeds.length, CONCURRENCY) }).map(() => worker());
    await Promise.all(workers);

    return results.filter((r) => r !== null);
  }
}

export function cleanPostData(data: any): any {
  if (!data) return {};

  const cleanedComments: any = {};
  if (data.comments && Array.isArray(data.comments.list)) {
    cleanedComments.list = data.comments.list.map((comment: any) => ({
      content: comment.content,
      subComments: Array.isArray(comment.subComments)
        ? comment.subComments.map((sub: any) => ({
          content: sub.content,
        }))
        : [],
    }));
  }

  const cleanedNote: any = {};
  if (data.note) {
    cleanedNote.desc = data.note.desc;
    cleanedNote.type = data.note.type;
    cleanedNote.title = data.note.title;

    if (data.note.imageList && Array.isArray(data.note.imageList)) {
      cleanedNote.imageList = data.note.imageList.map((img: any) => ({
        urlPre: img.urlPre,
        urlDefault: img.urlDefault,
      }));
    }

    cleanedNote.interactInfo = data.note.interactInfo;

    if (data.note.tagList && Array.isArray(data.note.tagList)) {
      cleanedNote.tagList = data.note.tagList.map((tag: any) => ({
        name: tag.name,
      }));
    }
  }

  return {
    comments: cleanedComments,
    note: cleanedNote,
  };
}