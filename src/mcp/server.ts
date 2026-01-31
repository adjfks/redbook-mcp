import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { AppConfig } from "../lib/config.js";
import { StorageStateStore } from "../storage/storageStateStore.js";
import { BrowserManager } from "../xhs/browserManager.js";
import { CommentService } from "../xhs/comment.js";
import { FeedDetailService } from "../xhs/feedDetail.js";
import { FeedsService } from "../xhs/feeds.js";
import { LoginService } from "../xhs/login.js";
import { LikeFavoriteService } from "../xhs/likeFavorite.js";
import { PublishImageService } from "../xhs/publishImage.js";
import { PublishVideoService } from "../xhs/publishVideo.js";
import { SearchService } from "../xhs/search.js";
import { GetSpecifiedPostService } from "../xhs/getSpecifiedPost.js";
import { UserProfileService } from "../xhs/userProfile.js";

function toolText(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function toolImagePng(base64: string) {
  return { content: [{ type: "image" as const, data: base64, mimeType: "image/png" }] };
}

export async function startMcpServer(config: AppConfig): Promise<void> {
  const server = new McpServer(
    { name: "redbook-mcp", version: "0.1.0" },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  const store = new StorageStateStore(config.storagePath);
  const browserManager = new BrowserManager(config);
  const loginService = new LoginService(browserManager, store);
  const publishImageService = new PublishImageService(browserManager, config);
  const publishVideoService = new PublishVideoService(browserManager, config);
  const feedsService = new FeedsService();
  const searchService = new SearchService();
  const feedDetailService = new FeedDetailService();
  const userProfileService = new UserProfileService();
  const commentService = new CommentService();
  const likeFavService = new LikeFavoriteService();

  const readOnlyAnnotations: ToolAnnotations = { title: "ReadOnly", readOnlyHint: true };
  const destructiveAnnotations: ToolAnnotations = { title: "Destructive", destructiveHint: true };

  server.registerTool(
    "check_login_status",
    {
      title: "Check Login Status",
      description: "检查小红书登录状态",
      annotations: readOnlyAnnotations,
    },
    async () => {
      const status = await loginService.checkLoginStatus();
      if (status.isLoggedIn) {
        return toolText(`✅ 已登录\n用户名: ${status.username}\n\n你可以使用其他功能了。`);
      }
      return toolText("❌ 未登录\n\n请使用 get_login_qrcode 工具获取二维码进行登录。");
    },
  );

  server.registerTool(
    "get_login_qrcode",
    {
      title: "Get Login QR Code",
      description: "获取登录二维码（返回 Base64 图片和超时时间）",
      annotations: readOnlyAnnotations,
    },
    async () => {
      const r = await loginService.getLoginQrcode();
      if (r.isLoggedIn) return toolText("你当前已处于登录状态");

      return {
        content: [
          { type: "text" as const, text: `请用小红书 App 在 ${r.timeout} 内扫码登录 👇` },
          ...toolImagePng(r.imgBase64).content,
        ],
      };
    },
  );

  server.registerTool(
    "delete_cookies",
    {
      title: "Delete Cookies",
      description: "删除 cookies 文件，重置登录状态。删除后需要重新登录。",
      annotations: destructiveAnnotations,
    },
    async () => {
      const { deletedPath } = await loginService.deleteCookies();
      return toolText(`Cookies 已成功删除，登录状态已重置。\n\n删除的文件路径: ${deletedPath}\n\n下次操作时，需要重新登录。`);
    },
  );

  server.registerTool(
    "publish_content",
    {
      title: "Publish Content",
      description: "发布小红书图文内容",
      annotations: destructiveAnnotations,
      inputSchema: {
        title: z.string().describe("内容标题（小红书限制：最多20个中文字或英文单词）"),
        content: z
          .string()
          .max(1000, "正文内容不能超过1000个字符")
          .describe("正文内容，不包含以#开头的标签内容，所有话题标签都用tags参数来生成和提供即可，不能超过1000个字符"),
        images: z
          .array(
            z
              .string()
              .describe(
                "图片路径，支持两种方式：1. HTTP/HTTPS 图片链接（自动下载）；2. 本地图片绝对路径（推荐）",
              ),
          )
          .min(1)
          .describe("图片路径列表（至少需要1张图片）"),
        tags: z.array(z.string()).optional().describe("话题标签列表（可选参数），如 [美食, 旅行, 生活]"),
        schedule_at: z
          .string()
          .optional()
          .describe("定时发布时间（可选），ISO8601格式如 2024-01-20T10:30:00+08:00，支持1小时至14天内。不填则立即发布"),
      },
    },
    async (args) => {
      const r = await publishImageService.publishContent({
        title: args.title,
        content: args.content,
        images: args.images,
        tags: args.tags,
        schedule_at: args.schedule_at,
      });
      return toolText(
        r.note
          ? `发布完成\n标题: ${r.title}\n图片: ${r.images}\n备注: ${r.note}`
          : `发布完成\n标题: ${r.title}\n图片: ${r.images}`,
      );
    },
  );

  server.registerTool(
    "publish_with_video",
    {
      title: "Publish Video",
      description: "发布小红书视频内容（仅支持本地单个视频文件）",
      annotations: destructiveAnnotations,
      inputSchema: {
        title: z.string().describe("内容标题（小红书限制：最多20个中文字或英文单词）"),
        content: z.string().max(1000, "正文内容不能超过1000个字符").describe("正文内容（≤1000字符）"),
        video: z.string().describe("本地视频绝对路径"),
        tags: z.array(z.string()).optional().describe("话题标签列表（可选参数）"),
        schedule_at: z.string().optional().describe("定时发布时间（可选），ISO8601格式"),
      },
    },
    async (args) => {
      const r = await publishVideoService.publishVideo({
        title: args.title,
        content: args.content,
        video: args.video,
        tags: args.tags,
        schedule_at: args.schedule_at,
      });
      return toolText(`视频发布完成\n标题: ${r.title}`);
    },
  );

  server.registerTool(
    "list_feeds",
    {
      title: "List Feeds",
      description: "获取首页 Feeds 列表",
      annotations: readOnlyAnnotations,
    },
    async () => {
      const r = await browserManager.run("list_feeds", async (_ctx, page) => feedsService.listFeeds(page));
      return toolText(JSON.stringify(r, null, 2));
    },
  );

  server.registerTool(
    "search_feeds",
    {
      title: "Search Feeds",
      description: "搜索小红书内容（需要已登录）",
      annotations: readOnlyAnnotations,
      inputSchema: {
        keyword: z.string().describe("搜索关键词"),
        filters: z
          .object({
            sort_by: z.enum(["综合", "最新", "最多点赞", "最多评论", "最多收藏"]).optional(),
            note_type: z.enum(["不限", "视频", "图文"]).optional(),
            publish_time: z.enum(["不限", "一天内", "一周内", "半年内"]).optional(),
            search_scope: z.enum(["不限", "已看过", "未看过", "已关注"]).optional(),
            location: z.enum(["不限", "同城", "附近"]).optional(),
          })
          .optional()
          .describe("筛选选项"),
      },
    },
    async (args) => {
      const r = await browserManager.run("search_feeds", async (_ctx, page) =>
        searchService.search(page, args.keyword, args.filters),
      );
      return toolText(JSON.stringify(r, null, 2));
    },
  );

  server.registerTool(
    "get_specified_post",
    {
      title: "获取指定数量和条件的帖子内容",
      description: "获取指定数量和条件的帖子内容，返回帖子内容、图片、作者信息、互动数据（点赞/收藏/分享数）及评论列表. 注意：此工具需要已登录.",
      annotations: readOnlyAnnotations,
      inputSchema: {
        keyword: z.string().describe("搜索关键词"),
        post_count: z.number().describe("帖子数量"),
        filters: z
          .object({
            sort_by: z.enum(["综合", "最新", "最多点赞", "最多评论", "最多收藏"]).optional(),
            note_type: z.enum(["不限", "视频", "图文"]).optional(),
            publish_time: z.enum(["不限", "一天内", "一周内", "半年内"]).optional(),
            search_scope: z.enum(["不限", "已看过", "未看过", "已关注"]).optional(),
            location: z.enum(["不限", "同城", "附近"]).optional(),
          })
          .optional()
          .describe("筛选选项"),
      },
    },
    async (args) => {
      const r = await browserManager.run("get_specified_post", async (_ctx, page) =>
        GetSpecifiedPostService.getSpecifiedPost(page, args.keyword, args.post_count, args.filters),
      );
      return toolText(JSON.stringify(r, null, 2));
    },
  );

  server.registerTool(
    "get_feed_detail",
    {
      title: "Get Feed Detail",
      description:
        "获取小红书笔记详情，返回笔记内容、图片、作者信息、互动数据（点赞/收藏/分享数）及评论列表。默认返回前10条一级评论，如需更多评论请设置load_all_comments=true",
      annotations: readOnlyAnnotations,
      inputSchema: {
        feed_id: z.string().describe("小红书笔记ID，从Feed列表获取"),
        xsec_token: z.string().describe("访问令牌，从Feed列表的xsecToken字段获取"),
        load_all_comments: z.boolean().optional().describe("是否加载全部评论"),
        comment_config: z
          .object({
            click_more_replies: z.boolean().optional(),
            max_replies_threshold: z.number().optional(),
            max_comment_items: z.number().optional(),
            scroll_speed: z.enum(["slow", "normal", "fast"]).optional(),
          })
          .optional(),
      },
    },
    async (args) => {
      const r = await browserManager.run("get_feed_detail", async (_ctx, page) =>
        feedDetailService.getFeedDetail(page, {
          feed_id: args.feed_id,
          xsec_token: args.xsec_token,
          load_all_comments: args.load_all_comments,
          comment_config: args.comment_config,
        }),
      );
      return toolText(JSON.stringify(r, null, 2));
    },
  );

  server.registerTool(
    "user_profile",
    {
      title: "User Profile",
      description: "获取指定的小红书用户主页，返回用户基本信息，关注、粉丝、获赞量及其笔记内容",
      annotations: readOnlyAnnotations,
      inputSchema: {
        user_id: z.string().describe("小红书用户ID，从Feed列表获取"),
        xsec_token: z.string().describe("访问令牌，从Feed列表的xsecToken字段获取"),
      },
    },
    async (args) => {
      const r = await browserManager.run("user_profile", async (_ctx, page) =>
        userProfileService.getUserProfile(page, args.user_id, args.xsec_token),
      );
      return toolText(JSON.stringify(r, null, 2));
    },
  );

  server.registerTool(
    "post_comment_to_feed",
    {
      title: "Post Comment",
      description: "发表评论到小红书笔记",
      annotations: destructiveAnnotations,
      inputSchema: {
        feed_id: z.string(),
        xsec_token: z.string(),
        content: z.string(),
      },
    },
    async (args) => {
      await browserManager.run("post_comment_to_feed", async (_ctx, page) =>
        commentService.postComment(page, args.feed_id, args.xsec_token, args.content),
      );
      return toolText(`评论发表成功 - Feed ID: ${args.feed_id}`);
    },
  );

  server.registerTool(
    "reply_comment_in_feed",
    {
      title: "Reply Comment",
      description: "回复小红书笔记下的指定评论",
      annotations: destructiveAnnotations,
      inputSchema: {
        feed_id: z.string(),
        xsec_token: z.string(),
        comment_id: z.string().optional(),
        user_id: z.string().optional(),
        content: z.string(),
      },
    },
    async (args) => {
      if (!args.comment_id && !args.user_id) return toolText("缺少 comment_id 或 user_id");
      await browserManager.run("reply_comment_in_feed", async (_ctx, page) =>
        commentService.replyComment(page, {
          feedId: args.feed_id,
          xsecToken: args.xsec_token,
          commentId: args.comment_id,
          userId: args.user_id,
          content: args.content,
        }),
      );
      return toolText(`评论回复成功 - Feed ID: ${args.feed_id}`);
    },
  );

  server.registerTool(
    "like_feed",
    {
      title: "Like Feed",
      description: "为指定笔记点赞或取消点赞（如已点赞将跳过点赞，如未点赞将跳过取消点赞）",
      annotations: destructiveAnnotations,
      inputSchema: {
        feed_id: z.string(),
        xsec_token: z.string(),
        unlike: z.boolean().optional(),
      },
    },
    async (args) => {
      await browserManager.run("like_feed", async (_ctx, page) =>
        likeFavService.like(page, args.feed_id, args.xsec_token, args.unlike),
      );
      return toolText(`${args.unlike ? "取消点赞" : "点赞"}成功 - Feed ID: ${args.feed_id}`);
    },
  );

  server.registerTool(
    "favorite_feed",
    {
      title: "Favorite Feed",
      description: "收藏指定笔记或取消收藏（如已收藏将跳过收藏，如未收藏将跳过取消收藏）",
      annotations: destructiveAnnotations,
      inputSchema: {
        feed_id: z.string(),
        xsec_token: z.string(),
        unfavorite: z.boolean().optional(),
      },
    },
    async (args) => {
      await browserManager.run("favorite_feed", async (_ctx, page) =>
        likeFavService.favorite(page, args.feed_id, args.xsec_token, args.unfavorite),
      );
      return toolText(`${args.unfavorite ? "取消收藏" : "收藏"}成功 - Feed ID: ${args.feed_id}`);
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

