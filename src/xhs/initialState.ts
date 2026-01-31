import type { Page } from "playwright";

export async function waitInitialState(page: Page, timeoutMs = 30_000): Promise<void> {
  await page.waitForFunction(() => (globalThis as any).__INITIAL_STATE__ !== undefined, undefined, { timeout: timeoutMs });
}

type PathKey = string | number;

function safeParseJson<T>(json: string | null | undefined): T {
  if (!json) return null as T;
  return JSON.parse(json) as T;
}

export async function waitInitialStatePath(page: Page, path: PathKey[], timeoutMs = 30_000): Promise<void> {
  await page.waitForFunction(
    (p: PathKey[]) => {
      const root = (globalThis as any).__INITIAL_STATE__;
      if (root === undefined) return false;
      let cur: any = root;
      for (const key of p) {
        if (cur == null) return false;
        cur = cur[key as any];
      }
      return cur !== undefined;
    },
    path,
    { timeout: timeoutMs },
  );
}

export async function readInitialStatePath<T = any>(page: Page, path: PathKey[], timeoutMs = 30_000): Promise<T> {
  await waitInitialStatePath(page, path, timeoutMs);
  const json = await page.evaluate((p: PathKey[]) => {
    const root = (globalThis as any).__INITIAL_STATE__;
    let cur: any = root;
    for (const key of p) {
      if (cur == null) return null;
      cur = cur[key as any];
    }
    // 只序列化“目标子树”，并用 WeakSet 跳过循环引用
    const seen = new WeakSet<object>();
    return JSON.stringify(cur, (_k, v) => {
      if (typeof v === "object" && v !== null) {
        if (seen.has(v as object)) return undefined;
        seen.add(v as object);
      }
      return v;
    });
  }, path);
  return safeParseJson<T>(json);
}

export async function readInitialState(page: Page): Promise<any> {
  await waitInitialState(page);
  // 兼容旧调用：尽量返回可 JSON 化的快照。
  // 注意：全量 __INITIAL_STATE__ 可能非常大，也可能包含循环引用；
  // 更推荐用 readInitialStatePath() 只读取你需要的子树。
  const json = await page.evaluate(() => {
    const s = (globalThis as any).__INITIAL_STATE__;
    const seen = new WeakSet<object>();
    return JSON.stringify(s, (_k, v) => {
      if (typeof v === "object" && v !== null) {
        if (seen.has(v as object)) return undefined;
        seen.add(v as object);
      }
      return v;
    });
  });
  return safeParseJson(json);
}

export async function readJsonFromInitialState<T>(page: Page, fn: () => any, timeoutMs = 30_000): Promise<T> {
  await page.waitForFunction(fn, undefined, { timeout: timeoutMs });
  return await page.evaluate(fn) as T;
}

