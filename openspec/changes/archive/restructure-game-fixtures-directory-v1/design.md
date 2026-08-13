## Context

五类 `assets/game_*` 当前平铺，内部已有隐式三层：`models.ts`（类型）、能力文件（实现 + 该能力 `create*Module`，双职合一）、`assembly.ts`（组合根 + GameFixture 契约）。public-boundary 按顶层 `game_*` 前缀识别游戏层文件且递归收集，目录形态对边界检查零影响。ADR-018 约束：`core`+`contracts` 禁改，游戏层自由扩展。

## Goals / Non-Goals

**Goals:**

- 五类统一为 `models/`、`logic/`、`view/` 子目录形态，`assembly.ts` 留根。
- 纯重构：保持全部行为与公开 API 不变，`test:foundation` 全绿即验证。

**Non-Goals:**

- 不新增任何 VM 派生/绑定能力（属 C2/C3）。
- 不改变顶层目录（`game_*` 即 Bundle 边界，ADR-018 决策 1 不变）。
- 不把能力实现进一步拆分（每能力文件 ≤300 行约束下无需）。

## Decisions

### 1. 子目录命名：`models/` / `logic/` / `view/`

按职责分层：类型、能力实现、UI 呈现。`assembly.ts` 留根保持组合根可见性。

**替代方案：** 平铺 + 新增 view.ts（ai-sensei 阶段一）——但用户选择直接子目录重构，一次对齐形态，避免未来迁移。`logic/` 而非 `core/` 避免与框架 `core` 语义混淆。

### 2. 各品类文件映射

- `models.ts` → `models/index.ts`（或 `models/` 下拆分，保持原单文件语义则用 `models/models.ts` + 目录内 `index.ts` 转发）。采用后者：目录内保持文件语义，`index.ts` 转发保持 `from "./models"` 相对路径形态。
- 能力文件（battle/config/clock/input/resource/save/scene/state）→ `logic/<name>.ts`。
- `ui.ts` → `view/ui.ts`；未来 VM 派生/绑定 → `view/view.ts`（本 change 不新增）。
- `assembly.ts` 留根，import 相对路径指向新子目录。

### 3. 影响面同步

- `assets/game/fixture/registry.ts`：五处 `../../game_*/assembly` import 路径不变（assembly.ts 留根），但若其内部 import 变化则不受影响——registry 只引 assembly.ts，无需改动。
- 五类夹具测试：断言路径 `assets/game_*/assembly.ts` 不变（留根），动态 import 路径不变。**若迁移 assembly.ts 才需改**，本设计 assembly.ts 留根，故测试零改动。

**关键简化：** 因 `assembly.ts` 留根，registry 与五处测试的路径全部保持不变，影响面收敛为各品类内部相对 import 调整。

### 4. 迁移方式：git mv 保持历史

用 `git mv` 逐品类迁移文件，保证 rename 历史可追踪；逐品类迁移后运行 `test:foundation` 增量验证，再迁移下一个。

## Risks / Trade-offs

- [迁移漏改内部相对 import] → 逐品类迁移后立即跑 `test:foundation`，类型错误即时暴露。
- [五类一次性改动面大] → 按品类分步（card → rpg → idle → tycoon → fight），每步验证。
- [public-boundary 示例路径字符串与真实路径语义不一致] → 检查 `public-boundary.test.ts` 中的示例路径是否需更新，虽不验证文件存在，但保持语义一致。
- [目录形态与 Cocos Bundle 内部加载语义] → 子目录不改变 `isBundle` 顶层边界（ADR-018 决策 1），无加载语义差异。
