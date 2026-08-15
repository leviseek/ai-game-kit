## Context

现状（见 proposal.md - Why）：

- `validateComponent` 跨包分支（`tools/fgui/lib/fgui.ts`）对 `obj.pkg` 非空一律发 warning"请在目标包确认资源存在"，不解析目标包（`listPackages`/`readPackage` 已在 list defaultItem 校验中用于解析目标包）。
- `validate` 命令只有 `checkTypeFreshness`；`generateConstants`（`commands/gen-constants.ts`）输出与 `generateTypeFiles` 同构（pkg/file/lines）。
- `LineupStore`/`IdleRewardsStore` 各含 ~60 行自实现版本/迁移/解析；`createVersionedStorage` 键组合固定 `save:<ns>:<key>`，商店既有键 `auto-battle:auto_battle:<key>` 不同。
- `check-foundation-contracts.ts` 候选 tsc 路径含两条硬编码 D:\ 路径；`fixture-perf` 默认 `skip-build=true`；`runCodeGraphCommand` 对 ENOENT 返回 exitCode 1 + 原始 stderr。
- `public-boundary` 的 `extractModuleSpecifiers` 主路径为 `Bun.Transpiler.scan(source).imports`（真解析），正则仅补充静态 import/require——P2-5 担忧不成立。
- 约束：`public-boundary` 白名单精确断言；`IVersionedStorageOptions` 为公开契约（新增字段必须可选）；ES2015；Creator 转译。

## Goals / Non-Goals

**Goals:** 跨包引用断裂即 error；gen-constants 受 freshness 保护；商店复用 versioned-storage（原键不换）；工具链可复现；本地门禁全绿。

**Non-Goals:** P2-6/10/11 与 CI 恢复（记录）。

## Decisions

### D1: 跨包引用反向校验（P2-4）

`validateComponent` 跨包分支：按 `obj.pkg`（目标包 id）在 `listPackages(project).map(readPackage)` 中查找目标包——命中且 `src` 在目标包 `resources` 中存在 → 无问题（有效引用不再发噪音警告）；命中但 `src` 缺失 → error（引用断裂）；目标包不可解析（Basic/Builder 官方库或工程外包）→ 保留人工确认 warning。复用 list defaultItem 校验的目标包解析模式。

### D2: gen-constants freshness（P1-7）

`validate` 新增 `checkConstantFreshness(project)`：`generateConstants(project)` 重算期望（pkg/file/lines），与磁盘 `ui-<包>.ts` 逐字对比——缺失/过期/多余产物均报 error；`-types.ts` 文件由 `checkTypeFreshness` 覆盖，本检查跳过。与 gen-types 对称，消除 ADR-032 残余约束。

### D3: 版本化存储复用 + 固定 storageKey（P2-9）

`IVersionedStorageOptions` 新增可选 `storageKey?: string`：`createVersionedStorage` 以 `fixedKey ?? composeStorageKey(ns, key)` 组合键，`save/load/delete` 统一使用。`LineupStore`/`IdleRewardsStore` 迁移：委托 `createVersionedStorage({ storage, currentVersion, migrators, storageKey: 既有键 })`，保留形状校验（isLineupRecord/isIdleRewardRecord）与 payload 前置拒绝；删除自实现版本/迁移/解析。版本化存储全套（`createVersionedStorage` + 四个类型化错误 + 五个契约类型）纳入根白名单（`expectedRootExports` 逐字同步）。理由：storageKey 使商店保持既有键（真实存档原位可读、既有测试零改动），避免"换键 + 旧键迁移"的额外复杂度。

### D4: 工具链可复现性

- `check-foundation-contracts.ts`：tsc 候选仅环境变量（`COCOS_TSC` → `COCOS_CREATOR_HOME` 推导），移除硬编码路径；未探测到时错误信息指引设置环境变量。
- `fixture-perf`：`skip-build` 默认 `false`（先构建再采样，产物陈旧时性能数据失真；显式 `--skip-build=true` 可跳过）。
- `runCodeGraphCommand`：ENOENT 抛类型化错误，附 codegraph 安装（`npm i -g codegraph`）与 `codegraph init` 指引；其它失败路径行为不变。

### D5: P2-5 以核实关闭

`extractModuleSpecifiers` 主路径为 `Bun.Transpiler.scan`（真解析），正则仅补充静态 import/require 边角——"正则漏检"不成立，无代码改动；本决策记录核实结论。

## Risks / Trade-offs

- **D1 行为变化**：有效跨包引用不再发 warning（噪音消除）；引用断裂从"人工确认"升级为 error——真实工程 AutoBattle/CardGame → Common 引用经实跑验证全部解析成功，validate --strict 通过。
- **D2 新增门禁**：gen-constants 产物过期将阻断 validate；生成物与源 XML 的同步义务扩大（与 gen-types 一致，ADRs 已声明"生成物禁止手改"）。
- **D3 白名单 +9**：`createVersionedStorage`/4 错误/5 类型全部有真实消费方（商店 + 测试），符合"新增公共接口须有真实消费场景"门槛；storageKey 为可选字段，缺省行为不变。
- **D4 默认值变化**：`fixture-perf` 默认构建（本地需 Creator）；`check-foundation-contracts` 依赖环境变量（README 已声明 `COCOS_CREATOR_HOME` 优先读取）；ENOENT 抛错由 arch-viewer 既有错误处理承接。

## Migration Plan

1. P2-4：fgui.ts 跨包反向校验 + fgui.test.ts 用例（有效/缺失/不可解析三分支）。
2. P1-7：validate.ts checkConstantFreshness + validate-freshness.test.ts 用例。
3. P2-9：IVersionedStorageOptions.storageKey + VersionedStorage 实现 + 白名单 + 商店迁移 + 测试（storageKey 覆盖/缺省组合）。
4. 工具链：fixture-perf 默认值、check-foundation-contracts 路径、codegraph ENOENT 指引。
5. 文档：ADR-038；`openspec validate --specs --strict` 通过后归档。

回滚：各步独立可回退；D3 移除 storageKey 即恢复默认组合键（商店需回退自实现）；D1 恢复 warning-only。

## Open Questions

无（P2-6/10/11 与 CI 恢复以 Non-Goals 记录，各自独立评估）。
