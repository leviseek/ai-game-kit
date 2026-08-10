# AutoBattleView 速度挡位显示简化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除 AutoBattleView 的 `txt_speed` 文本节点，挡位只在 `btn_speed` 按钮标题上实时显示 `x1`/`x2`/`x3`。

**Architecture:** 在 `view.ts` 绑定声明里把 `txt_speed` 的 text 绑定移除、给 `btn_speed` 增加 text 绑定（与已有 command 绑定共存，不同 index 不冲突），测试断言从 `txt_speed` 文本改为 `btn_speed` 标题；FGUI 侧删除 `txt_speed` 节点并把 `btn_speed` 上移到原位置（委派 fgui-designer）；发布产物由 FGUI 编辑器生成，不手改 bin。

**Tech Stack:** TypeScript strict、bun test、FairyGUI（FGUI）组件 XML、fgui CLI。

## Global Constraints

- 中文注释；标识符/类型名/API/错误消息/路径保持英文。
- 不改变挡位循环语义（1x→2x→3x→1x）、`AutoBattleClock.timeScale` 驱动、`AutoBattleSpeed` 类型与 VM `speed` 字段。
- 不引入新依赖、不改公共接口。
- FGUI 组件 XML 修改委派 fgui-designer（`/fgui-edit`），主会话不手写 XML；产物由编辑器发布，禁止手改 bin/atlas。
- 修改逻辑时同步更新受影响的注释；删除逻辑时删除对应注释。

---

### Task 1: 视图层绑定迁移（view.ts + 相关测试断言）

**Files:**
- Modify: `assets/samples/game_auto_battle/view/view.ts`（`createAutoBattleBindings`，view.ts:162-168）
- Modify: `tests/framework/foundation/game-auto-battle-presenter.test.ts`（96, 113-120 行）
- Modify: `tests/framework/foundation/game-auto-battle-speed-control.test.ts`（88-102 行）
- Modify: `assets/samples/game_auto_battle/smoke.ts`（209-216 行）
- Modify: `tests/framework/foundation/game-auto-battle-view.test.ts`（180-185 行）

**Interfaces:**
- Consumes: `AutoBattleViewModel.speed: AutoBattleSpeed`（已有）；`Binding` 类型（framework 导出）；`createAutoBattlePresenter(fixture, node)`；`fixture.viewModel.node(name)`。
- Produces: `createAutoBattleBindings(commands)` 返回数组含 `btn_speed` 的 text + command 绑定、不再含 `txt_speed` 绑定；测试断言统一改走 `btn_speed`。签名本身不变（仅数组内容变化）。

- [ ] **Step 1: 更新所有测试断言（先红）**

**presenter.test.ts 96 行**（renders static HUD 测试）：
```typescript
            expect(view.nodes.get("txt_round")?.text).toBe("第 1 回合");
            expect(view.nodes.get("btn_speed")?.text).toBe("x1");
```

**presenter.test.ts 113-120 行**（clicking the speed button 测试）：
```typescript
            expect(view.nodes.get("btn_speed")?.text).toBe("x1");
            view.nodes.get("btn_speed")?.clickHandler?.();
            expect(fixture.speed).toBe(2);
            expect(view.nodes.get("btn_speed")?.text).toBe("x2");

            view.nodes.get("btn_speed")?.clickHandler?.();
            expect(fixture.speed).toBe(3);
            expect(view.nodes.get("btn_speed")?.text).toBe("x3");
```

**speed-control.test.ts 88-102 行**：测试名 `"the speed command updates the txt_speed binding via VM"` → `"the speed command updates the btn_speed title via VM"`；断言：
```typescript
            fixture.viewModel.render();
            expect(fixture.viewModel.node("btn_speed").text).toBe("x1");

            fixture.cycleSpeed();
            fixture.viewModel.render();
            expect(fixture.viewModel.node("btn_speed").text).toBe("x2");

            fixture.cycleSpeed();
            fixture.viewModel.render();
            expect(fixture.viewModel.node("btn_speed").text).toBe("x3");
```

**smoke.ts 209-216 行**：
```typescript
    const firstResult = endState.result;
    fixture.cycleSpeed();
    fixture.viewModel.render();
    const speedNode = fixture.viewModel.node("btn_speed").text;
    report(
        "speed-cycle",
        fixture.speed === 2 && speedNode === "x2",
        `speed=${fixture.speed} title=${speedNode ?? "none"}`,
    );
```
同步更新该段上方注释（若点名 txt_speed）为按钮标题语义。

**view.test.ts 180-185 行**（static bindings 测试，vm.speed 固定 1）：
```typescript
        expect(view.nodes.get("txt_round")?.text).toBe("第 1 回合");
        expect(view.nodes.get("btn_speed")?.text).toBe("x1");
        expect(view.nodes.get("txt_result")?.visible).toBe(false);
```

- [ ] **Step 2: 运行测试确认失败（红）**

Run: `bun test ./tests/framework/foundation/game-auto-battle-view.test.ts ./tests/framework/foundation/game-auto-battle-presenter.test.ts ./tests/framework/foundation/game-auto-battle-speed-control.test.ts`
Expected: FAIL——`btn_speed` 尚未有 text 绑定，`btn_speed` 节点 text 为 undefined，断言 `toBe("x1")` 失败。

- [ ] **Step 3: 修改 `createAutoBattleBindings`（实现）**

把现有 `txt_speed` text 绑定（view.ts:162-166）：

```typescript
        {
            kind: "text",
            node: "txt_speed",
            get: (vm) => `x${vm.speed}`,
        },
        { kind: "command", node: "btn_restart", run: () => commands.restart() },
        { kind: "command", node: "btn_speed", run: () => commands.cycleSpeed() },
```

替换为：删除 `txt_speed` 绑定，在 `btn_speed` command 绑定前新增 text 绑定：

```typescript
        { kind: "command", node: "btn_restart", run: () => commands.restart() },
        {
            kind: "text",
            node: "btn_speed",
            get: (vm) => `x${vm.speed}`,
        },
        { kind: "command", node: "btn_speed", run: () => commands.cycleSpeed() },
```

同步更新绑定数组上方 JSDoc（view.ts:131-136）：若点名 `txt_speed` 则改为 `btn_speed` 标题。

- [ ] **Step 4: 运行测试确认通过（绿）**

Run: `bun test ./tests/framework/foundation/game-auto-battle-view.test.ts ./tests/framework/foundation/game-auto-battle-presenter.test.ts ./tests/framework/foundation/game-auto-battle-speed-control.test.ts`
Expected: PASS

- [ ] **Step 5: 运行 typecheck**

Run: `bun run typecheck`
Expected: PASS（`AutoBattleSpeed` 模板字符串 `x${vm.speed}` 类型不变）

- [ ] **Step 6: 提交**

```bash
git add assets/samples/game_auto_battle/view/view.ts tests/framework/foundation/game-auto-battle-presenter.test.ts tests/framework/foundation/game-auto-battle-speed-control.test.ts assets/samples/game_auto_battle/smoke.ts tests/framework/foundation/game-auto-battle-view.test.ts
git commit -m "feat: 速度挡位绑定从 txt_speed 迁移到 btn_speed 标题"
```

---

### Task 2: FGUI 组件修改（委派 fgui-designer）

**Files:**
- Modify: `ui/demo/assets/AutoBattle/AutoBattleView.xml`（fgui-designer 产出）

**Interfaces:**
- Consumes: Task 1 的绑定 `node: "btn_speed"`（FGUI 组件需保留 `btn_speed` 节点名不变）。
- Produces: AutoBattleView 组件不再含 `txt_speed` 节点；`btn_speed` 在 (580,448)；`bun run fgui validate --strict` 通过；发布产物更新。

- [ ] **Step 1: 委派 fgui-designer 删除 txt_speed 并上移按钮**

使用 `/fgui-edit` 命令委派 fgui-designer 修改 `AutoBattleView.xml`：
- 删除 `<text id="ab_txt_speed" name="txt_speed" .../>` 节点。
- 把 `btn_speed` 从 `xy="580,484"` 上移到 `xy="580,448"`（原 txt_speed 位置），其余属性不变（`CommonButton`，标题 `x1`）。
- 不触碰 `txt_round`/`txt_log`/`txt_result`/`btn_restart` 等其它节点。

- [ ] **Step 2: 运行 fgui validate**

Run: `bun run fgui validate --strict`
Expected: PASS（无 txt_speed 残留引用、无其它语义告警）

- [ ] **Step 3: 在 FGUI 编辑器发布 AutoBattle 包并 check-publish**

前置：用户在 FGUI 编辑器对 AutoBattle 包执行发布。
用 fgui-mcp `fgui_check_publish`（packages=["AutoBattle"]）。
Expected: evidence 齐全（编辑器发布信号 + bin mtime 新鲜度 + validate --strict 通过），无 mismatch。

- [ ] **Step 4: 提交**

```bash
git add ui/demo/assets/AutoBattle/AutoBattleView.xml assets/ui/AutoBattle/AutoBattle.bin
git commit -m "feat: AutoBattleView 删除 txt_speed，速度按钮上移显示挡位"
```

---

### Task 3: 全量验证

**Files:**
- 无代码改动；仅运行验证。

**Interfaces:**
- Consumes: 全部先前任务的产物。

- [ ] **Step 1: typecheck + lint**

Run: `bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 2: 全量 foundation 测试**

Run: `bun test ./tests/framework/foundation`
Expected: PASS（无 txt_speed 残留引用；speed 相关断言全部走 btn_speed）

- [ ] **Step 3: 全工程 txt_speed 残留扫描**

Run: `bun -e "const {execSync}=require('child_process'); const out=execSync('rg -l \"txt_speed\" ui assets tests --glob \"!**/assets/ui/**/*.bin\"').toString(); console.log(out||'no txt_speed refs')"`
Expected: 仅剩归档文档 `docs/superpowers/plans/2026-08-10-lineup-editor-click-phase5-fgui.md` 与 `openspec/changes/archive/2026-08-10-battle-speed-control/*`（历史记录，不改动）。

- [ ] **Step 4: 冒烟验证（可选，需 Cocos 运行时）**

在 FGUI 编辑器/运行时点击 `btn_speed`，确认按钮标题随挡位实时显示 `x1`→`x2`→`x3`，无 txt_speed 残留。

- [ ] **Step 5: 提交（如无改动则跳过）**

无未提交代码改动时跳过本步。

---

## Self-Review 记录

- **Spec 覆盖**：D1（删 txt_speed + 按钮上移 y448）→ Task 2；D2（btn_speed text 绑定）→ Task 1；测试同步 → Task 1（先红后绿）；发布产物 → Task 2 Step 3；全量验证 → Task 3。
- **占位符**：所有步骤含具体代码/命令，无 TBD/TODO。
- **类型一致性**：绑定 `node: "btn_speed"`、`get: (vm) => \`x${vm.speed}\`` 与现有 `AutoBattleSpeed`/`Binding` 类型一致；测试断言统一用 `btn_speed` 的 `text` 字段（内存节点 `toViewModelNode` 的 `setText` 写入 `recording.text`，与 txt_round 断言同机制）。Task 1 内先断言后实现，保证红→绿闭环。
