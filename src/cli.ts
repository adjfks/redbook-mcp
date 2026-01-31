
import { Command } from "commander";
import path from "node:path";
import { startMcpServer } from "./mcp/server.js";
import { defaultDataDir, defaultStoragePath, type AppConfig } from "./lib/config.js";
import { ensureDir } from "./lib/fs.js";
import { BrowserManager } from "./xhs/browserManager.js";
import { SearchService } from "./xhs/search.js";
import { FeedDetailService } from "./xhs/feedDetail.js";
import { LoginService } from "./xhs/login.js";
import { StorageStateStore } from "./storage/storageStateStore.js";

const program = new Command();

program
  .name("redbook-mcp")
  .description("MCP server and CLI for Xiaohongshu")
  .version("0.1.0");

// Global options
program
  .option("--dataDir <path>", "Data directory")
  .option("--storagePath <path>", "Storage file path")
  .option("--chromePath <path>", "Chrome executable path")
  .option("--headless <value>", "Headless mode (true/false)", "true");

function getAppConfig(options: {
  dataDir?: string;
  storagePath?: string;
  headless?: string;
  chromePath?: string;
}): AppConfig {
  const dataDir = options.dataDir ?? process.env.XHS_DATA_DIR ?? defaultDataDir();
  const storagePath = options.storagePath ?? process.env.XHS_STORAGE_PATH ?? defaultStoragePath(dataDir);
  // Default headless is true unless explicitly set to false or '0'
  const isHeadless = options.headless !== "false" && options.headless !== "0";

  return {
    headless: isHeadless,
    storagePath: path.resolve(storagePath),
    chromePath: options.chromePath ?? process.env.XHS_CHROME_PATH,
    dataDir: path.resolve(dataDir),
  };
}

program
  .command("server", { isDefault: true })
  .description("Start the MCP server")
  .action(async () => {
    const opts = program.opts();
    const config = getAppConfig(opts);
    await ensureDir(config.dataDir);
    await startMcpServer(config);
  });

program
  .command("login")
  .description("Login to Xiaohongshu (Interactive)")
  .action(async () => {
    const opts = program.opts();
    const config = getAppConfig(opts);
    const store = new StorageStateStore(config.storagePath);
    const browserManager = new BrowserManager(config);
    const loginService = new LoginService(browserManager, store);

    try {
      console.log("Checking login status...");
      const status = await loginService.checkLoginStatus();
      if (status.isLoggedIn) {
        console.log(`✅ Already logged in as ${status.username}`);
        return;
      }

      console.log("Opening login window...");
      console.log("Please scan the QR code in the browser window.");

      // Trigger login flow
      await loginService.getLoginQrcode();

      // Poll for login success
      /* eslint-disable no-constant-condition */
      while (true) {
        await new Promise((r) => setTimeout(r, 2000));
        process.stdout.write(".");
        const s = await loginService.checkLoginStatus();
        if (s.isLoggedIn) {
          console.log("\n✅ Login successful!");
          break;
        }
      }
    } catch (e) {
      console.error("Login failed:", e);
      process.exit(1);
    }
  });

program
  .command("search <keyword>")
  .description("Search feeds")
  .action(async (keyword) => {
    const opts = program.opts();
    const config = getAppConfig(opts);
    const browserManager = new BrowserManager(config);
    const searchService = new SearchService();

    try {
      const results = await browserManager.run("search", (ctx, page) => searchService.search(page, keyword));
      console.log(JSON.stringify(results, null, 2));
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });

program
  .command("detail <id>")
  .description("Get feed detail")
  .option("--token <token>", "XSecToken")
  .action(async (id, cmdOpts) => {
    const opts = program.opts();
    const config = getAppConfig(opts);
    const browserManager = new BrowserManager(config);
    const feedDetailService = new FeedDetailService();

    try {
      const result = await browserManager.run("detail", (ctx, page) =>
        feedDetailService.getFeedDetail(page, {
          feed_id: id,
          xsec_token: cmdOpts.token || "",
        }),
      );
      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  });

program.parse();
