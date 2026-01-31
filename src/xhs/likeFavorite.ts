import type { Page } from "playwright";

import { readInitialState } from "./initialState.js";
import { makeFeedDetailUrl } from "./urls.js";

const InteractSelectors = {
  likeButton: ".interact-container .left .like-lottie",
  collectButton: ".interact-container .left .reds-icon.collect-icon",
};

async function getInteractState(page: Page, feedId: string): Promise<{ liked: boolean; collected: boolean }> {
  const s: any = await readInitialState(page);
  const map = s?.note?.noteDetailMap;
  const node = map?.[feedId];
  const info = node?.note?.interactInfo;
  return {
    liked: Boolean(info?.liked),
    collected: Boolean(info?.collected),
  };
}

export class LikeFavoriteService {
  async like(page: Page, feedId: string, xsecToken: string, unlike?: boolean): Promise<void> {
    const url = makeFeedDetailUrl(feedId, xsecToken);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);

    const { liked } = await getInteractState(page, feedId).catch(() => ({ liked: false, collected: false }));
    const targetLiked = !unlike;
    if (targetLiked && liked) return;
    if (!targetLiked && !liked) return;

    await page.locator(InteractSelectors.likeButton).first().click({ timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(2000);
  }

  async favorite(page: Page, feedId: string, xsecToken: string, unfavorite?: boolean): Promise<void> {
    const url = makeFeedDetailUrl(feedId, xsecToken);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);

    const { collected } = await getInteractState(page, feedId).catch(() => ({ liked: false, collected: false }));
    const target = !unfavorite;
    if (target && collected) return;
    if (!target && !collected) return;

    await page.locator(InteractSelectors.collectButton).first().click({ timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(2000);
  }
}

