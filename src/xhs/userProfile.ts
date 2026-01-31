import type { Page } from "playwright";

import { readInitialState } from "./initialState.js";
import { makeUserProfileUrl } from "./urls.js";

export class UserProfileService {
  async getUserProfile(page: Page, userId: string, xsecToken: string): Promise<any> {
    await page.goto(makeUserProfileUrl(userId, xsecToken), { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);

    const s: any = await readInitialState(page);

    const userPageData = s?.user?.userPageData;
    const basic = userPageData?.value !== undefined ? userPageData.value : userPageData?._value;
    if (!basic) throw new Error("user.userPageData.value not found in __INITIAL_STATE__");

    const notes = s?.user?.notes;
    const notesData = notes?.value !== undefined ? notes.value : notes?._value;
    if (!notesData) throw new Error("user.notes.value not found in __INITIAL_STATE__");

    // notesData 是二维数组
    const feeds: any[] = [];
    for (const arr of notesData as any[]) {
      if (Array.isArray(arr)) feeds.push(...arr);
    }

    return {
      userBasicInfo: basic.basicInfo ?? basic.BasicInfo ?? basic,
      interactions: basic.interactions ?? basic.Interactions ?? [],
      feeds,
    };
  }
}

