import type { Page } from "playwright";

import { makeFeedDetailUrl } from "./urls.js";

const CommentSelectors = {
  inputBoxSpan: "div.input-box div.content-edit span",
  inputBoxP: "div.input-box div.content-edit p.content-input",
  submitButton: "div.bottom button.submit",
  commentItem: ".parent-comment, .comment-item, .comment",
};

export class CommentService {
  async postComment(page: Page, feedId: string, xsecToken: string, content: string): Promise<void> {
    const url = makeFeedDetailUrl(feedId, xsecToken);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);

    const span = page.locator(CommentSelectors.inputBoxSpan).first();
    await span.click({ timeout: 10_000 });

    const p = page.locator(CommentSelectors.inputBoxP).first();
    await p.click({ timeout: 10_000 });
    await p.fill(content);
    await page.waitForTimeout(800);

    const submit = page.locator(CommentSelectors.submitButton).first();
    await submit.click({ timeout: 10_000 });
    await page.waitForTimeout(1200);
  }

  async replyComment(page: Page, args: { feedId: string; xsecToken: string; commentId?: string; userId?: string; content: string }): Promise<void> {
    const url = makeFeedDetailUrl(args.feedId, args.xsecToken);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    const target = await this.findCommentElement(page, args.commentId, args.userId);
    await target.scrollIntoViewIfNeeded().catch(() => undefined);
    await page.waitForTimeout(800);

    const replyBtn = target.locator(".right .interactions .reply").first();
    await replyBtn.click({ timeout: 10_000 });
    await page.waitForTimeout(800);

    const p = page.locator(CommentSelectors.inputBoxP).first();
    await p.click({ timeout: 10_000 });
    await p.fill(args.content);
    await page.waitForTimeout(500);

    const submit = page.locator(CommentSelectors.submitButton).first();
    await submit.click({ timeout: 10_000 });
    await page.waitForTimeout(1500);
  }

  private async findCommentElement(page: Page, commentId?: string, userId?: string) {
    const maxAttempts = 100;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (commentId) {
        const byId = page.locator(`#comment-${commentId}`).first();
        if ((await byId.count()) > 0) return byId;
      }

      if (userId) {
        const items = page.locator(CommentSelectors.commentItem);
        const n = await items.count().catch(() => 0);
        for (let i = 0; i < n; i++) {
          const el = items.nth(i);
          const found = el.locator(`[data-user-id="${userId}"]`);
          if ((await found.count()) > 0) return el;
        }
      }

      await page.mouse.wheel(0, 800).catch(() => undefined);
      await page.waitForTimeout(800);
    }
    throw new Error(`未找到评论 (commentID: ${commentId ?? ""}, userID: ${userId ?? ""})`);
  }
}

