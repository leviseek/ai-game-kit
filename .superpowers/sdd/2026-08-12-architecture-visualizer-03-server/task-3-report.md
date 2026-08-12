### Task 3 Report: HTTP 路由、源码安全与 SSE

**状态**: DONE

**改动**:
- 新增 `tools/arch-viewer/lib/server/http-server.ts`，提供 `startArchServer(options)`，使用 ephemeral port，返回 `port`、`url`、`close`。
- 新增 `tools/arch-viewer/lib/server/routes.ts`，提供只读 JSON API：`/api/project`、`/api/views/:type`、`/api/groups/:id`、`/api/symbols/search`、`/api/nodes/:id/neighborhood`、`/api/source`。
- 新增 `tools/arch-viewer/lib/server/source.ts`，提供 `readSourceExcerpt(root, file, line, radius)`，使用 `resolve/relative/isAbsolute` 校验仓库内路径，并限制最大 80 行源码窗口。
- 新增 `tools/arch-viewer/lib/server/sse.ts`，提供 `/api/events` 的 `text/event-stream` 订阅，发送 `snapshot-ready` 等 store event，连接关闭和 server close 时释放订阅与 response。
- 新增 `tools/arch-viewer/test/http-server.test.ts`，覆盖路由 JSON、404、search、路径穿越、仓库外绝对路径、源码截取和 SSE event。

**TDD / 验证命令和结果**:
- RED: `bun test tools/arch-viewer/test/http-server.test.ts` -> FAIL，失败原因为缺失 `../lib/server/http-server`，符合先写测试预期。
- GREEN: `bun test tools/arch-viewer/test/http-server.test.ts` -> PASS，5 pass / 0 fail / 35 expect。
- `bun x tsc --noEmit -p tools/arch-viewer/tsconfig.json` -> PASS。
- `git diff --check` -> PASS。

**自审**:
- JSON 响应统一 `application/json; charset=utf-8`。
- SSE 响应固定 `text/event-stream`、`Cache-Control: no-cache`、`Connection: keep-alive`，并写入 keep-alive 注释帧。
- `/api/source` 只返回服务端验证后的相对路径，不返回绝对路径；403 响应只返回 `{ "error": "forbidden" }`。
- 路由层只读取已有 snapshot store，不触发 `codegraph init/index`。
- 新增文件均小于 300 行，未引入依赖，未使用 `as any` 或 `@ts-ignore`。

**concerns**:
- `git diff --check` 对未跟踪文件覆盖有限；提交前已计划暂存后再跑 `git diff --cached --check`。
- 首次 GREEN 全文件运行曾超时一次；单测定位后未复现，并补强了 server close 主动释放 SSE connection 的路径，后续验证通过。
