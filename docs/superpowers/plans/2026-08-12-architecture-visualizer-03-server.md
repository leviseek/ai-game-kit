# Architecture Visualizer Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为分析内核增加代次安全快照、实时 watcher、Node HTTP/SSE 只读服务和可操作 CLI。

**Architecture:** SnapshotStore 保留 last-known-good；Watcher 以 `codegraph sync --quiet` 明确同步索引，不猜测 daemon 时序。HTTP 路由只读取 QueryService；SSE 单向广播状态。CLI 负责编译 web、打开浏览器和优雅关闭。

**Tech Stack:** Node `http/fs/path/child_process`、SSE、Bun CLI/test、CodeGraph CLI。

## Global Constraints

- 遵守 rollout 总计划及前两阶段接口。
- 服务不得返回仓库根外源码或绝对路径枚举；VS Code URL 只对已验证 source 生成。
- Watcher 不自动 `codegraph init/index`，只允许 `sync/status`。

---

### Task 1: 代次安全 GraphSnapshotStore

**Files:**

- Create: `tools/arch-viewer/lib/server/snapshot-store.ts`
- Test: `tools/arch-viewer/test/snapshot-store.test.ts`

**Interfaces:**

- Produces: `AnalysisState = "idle" | "index-waiting" | "analyzing" | "error"`。
- Produces: `SnapshotEvent` 判别联合。
- Produces: `GraphSnapshotStore.begin/commit/fail/current/subscribe`。

- [ ] **Step 1: 写竞争与失败保留测试**

```ts
test("旧代次不能覆盖新快照，失败保留 last-known-good", () => {
    const store = createGraphSnapshotStore(snapshotV1);
    const old = store.begin();
    const latest = store.begin();
    expect(store.commit(old, snapshotV2)).toBe(false);
    expect(store.commit(latest, snapshotV3)).toBe(true);
    store.fail(latest + 1, new Error("broken"));
    expect(store.current()?.version).toBe(3);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tools/arch-viewer/test/snapshot-store.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现 store**

事件为冻结对象；subscribe 返回幂等 dispose；commit/fail 仅接受当前 generation；fail 广播 error 但不清空 snapshot。

```ts
function commit(generation: number, snapshot: GraphSnapshot): boolean {
    if (generation !== currentGeneration) return false;
    currentSnapshot = snapshot;
    emit({ type: "snapshot-ready", version: snapshot.version });
    return true;
}
```

- [ ] **Step 4: 验证**

Run: `bun test tools/arch-viewer/test/snapshot-store.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交（仅获授权时）**

建议信息 `feat: 管理架构快照代次`。

---

### Task 2: ProjectWatcher 与分析调度

**Files:**

- Create: `tools/arch-viewer/lib/server/watcher.ts`
- Create: `tools/arch-viewer/lib/server/scheduler.ts`
- Test: `tools/arch-viewer/test/watcher.test.ts`

**Interfaces:**

- Produces: `WatchBackend` 注入接口。
- Produces: `createAnalysisScheduler({ sync, analyze, store, debounceMs })`。
- Produces: `watchProject(root, onChange): { dispose(): void }`。

- [ ] **Step 1: 写 debounce/coalescing 失败测试**

Fake clock/backend 连续触发 3 次只执行一次；分析中再触发只追加一次 follow-up；`sync` 失败产生 `index-waiting`，不调用 analyzer；dispose 后不再运行。

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tools/arch-viewer/test/watcher.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现 watcher 与 scheduler**

`fs.watch` 监听 `assets`、`tools`、`doc/architecture`、`doc/decisions` 和配置文件所在目录，过滤 `.meta`、`temp`、`.codegraph`、`node_modules`、`third-party`、`.superpowers`。变更先调用 `gateway.sync()`，再读取 status 确认 `pendingChanges` 全 0，然后 analyze。

```ts
async function rebuild(): Promise<void> {
    await gateway.sync();
    const status = await gateway.status();
    if (hasPendingChanges(status)) return store.indexWaiting();
    const generation = store.begin();
    const snapshot = await analyzer.buildSnapshot({ version: nextVersion() });
    store.commit(generation, snapshot);
}
```

- [ ] **Step 4: 验证**

Run: `bun test tools/arch-viewer/test/watcher.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交（仅获授权时）**

建议信息 `feat: 实时重建架构快照`。

---

### Task 3: HTTP 路由、源码安全与 SSE

**Files:**

- Create: `tools/arch-viewer/lib/server/http-server.ts`
- Create: `tools/arch-viewer/lib/server/routes.ts`
- Create: `tools/arch-viewer/lib/server/source.ts`
- Create: `tools/arch-viewer/lib/server/sse.ts`
- Test: `tools/arch-viewer/test/http-server.test.ts`

**Interfaces:**

- Produces: `startArchServer(options): Promise<{ port, url, close }>`。
- Produces API: `/api/project`、`/api/views/:type`、`/api/groups/:id`、`/api/symbols/search`、`/api/nodes/:id/neighborhood`、`/api/source`、`/api/events`。
- Produces: `readSourceExcerpt(root, file, line, radius): SourceExcerpt`，其中 `location` 只可能来自服务端验证过的仓库内路径。

- [ ] **Step 1: 写 API 与路径穿越失败测试**

用 ephemeral port 启动：断言 view JSON、404、search query、`../package.json`/仓库外绝对路径返回 403、合法源码按最大 80 行截取。SSE 连接后写 snapshot event，读取到 `event: snapshot-ready` 和 JSON data。

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tools/arch-viewer/test/http-server.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现 Node HTTP/SSE**

复用 `tools/creator/lib/http.ts` 的安全思路但不跨 workspace 深导入；使用 `resolve/relative` 做根目录校验，不用字符串 `startsWith`。JSON 响应固定 `application/json; charset=utf-8`，SSE 固定 keep-alive/`text/event-stream`，close 时释放订阅和 response。

```ts
const absolute = resolve(projectRoot, requestedFile);
const rel = relative(projectRoot, absolute);
if (rel.startsWith("..") || isAbsolute(rel)) return forbidden(response);
if (url.pathname === "/api/events") return attachSse(response, snapshotStore);
return routeApi(request, response, queryService);
```

- [ ] **Step 4: 验证 HTTP/SSE**

Run: `bun test tools/arch-viewer/test/http-server.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交（仅获授权时）**

建议信息 `feat: 提供架构只读 HTTP SSE 服务`。

---

### Task 4: CLI、web 编译与浏览器打开

**Files:**

- Create: `tools/arch-viewer/lib/server/static.ts`
- Create: `tools/arch-viewer/lib/server/open-browser.ts`
- Create: `tools/arch-viewer/lib/args.ts`
- Modify: `tools/arch-viewer/cli.ts`
- Test: `tools/arch-viewer/test/cli.test.ts`

**Interfaces:**

- CLI flags: `--port <number>`、`--no-open`、`--once`、`--help`。
- Produces: `run(argv, deps?): Promise<number>`，测试可注入 build/open/server/analyzer。

- [ ] **Step 1: 写 CLI 失败测试**

断言 `--help` 不启动服务；`--once --no-open` 执行 sync+analyze、打印 `views=6 diagnostics=N` 并退出；默认模式先运行 `tsc -p tsconfig.web.json`，再启动 server/watcher，最后打开 URL；端口非法返回 2。

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tools/arch-viewer/test/cli.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现 CLI 与静态服务**

web 源由 `tsc` 编译至 `temp/arch-viewer/web`；HTML/CSS 从 `tools/arch-viewer/web` 直接服务，JS 从 temp 服务。Windows 打开使用 `cmd.exe /c start "" <url>` 参数数组；macOS/Linux 分别 `open`/`xdg-open`，失败只 warning。SIGINT/SIGTERM 依次 dispose watcher、关闭 SSE/HTTP。

```ts
export async function run(argv: readonly string[], deps = productionDeps): Promise<number> {
    const options = parseArchArgs(argv);
    await deps.buildWeb();
    const snapshot = await deps.analyzeOnce();
    if (options.once) return printSnapshotSummary(snapshot);
    const server = await deps.startServer(options.port);
    if (options.open) await deps.openBrowser(server.url);
    return deps.waitForShutdown(server);
}
```

- [ ] **Step 4: 验证 server 阶段**

Run: `bun test tools/arch-viewer/test/snapshot-store.test.ts tools/arch-viewer/test/watcher.test.ts tools/arch-viewer/test/http-server.test.ts tools/arch-viewer/test/cli.test.ts`

Run: `bun run arch --once --no-open`

Expected: PASS；once 输出六视图摘要。

- [ ] **Step 5: 提交（仅获授权时）**

建议信息 `feat: 启动架构可视化本地服务`。
