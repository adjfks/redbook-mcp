export function makeSearchUrl(keyword: string): string {
  const u = new URL("https://www.xiaohongshu.com/search_result");
  u.searchParams.set("keyword", keyword);
  u.searchParams.set("source", "web_explore_feed");
  return u.toString();
}

export function makeFeedDetailUrl(feedId: string, xsecToken: string): string {
  const u = new URL(`https://www.xiaohongshu.com/explore/${feedId}`);
  u.searchParams.set("xsec_token", xsecToken);
  u.searchParams.set("xsec_source", "pc_feed");
  return u.toString();
}

export function makeUserProfileUrl(userId: string, xsecToken: string): string {
  const u = new URL(`https://www.xiaohongshu.com/user/profile/${userId}`);
  u.searchParams.set("xsec_token", xsecToken);
  u.searchParams.set("xsec_source", "pc_note");
  return u.toString();
}

