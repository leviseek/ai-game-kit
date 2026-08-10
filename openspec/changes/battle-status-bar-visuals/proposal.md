## Why

当前 `AutoBattleView.xml` 中各单位 HP 条与能量条共用同一个 `CommonProgressBar.xml`（`src="com01"`，fill 同为调色板 `fill` 蓝色 `#4a90e2`），观战者无法从视觉上区分血量与能量，战斗信息密度低。自动战斗玩法进化的 change-02（Stage 0）目标是在不触碰数据模型与战斗逻辑的前提下，让血条/能量条**视觉可区分**（如 HP 暖色/红色、能量蓝/绿色，或不同高度 + 标签），为后续玩法（读伤害、看技能节奏）打底。纯表现调整：`hp/energy` 字段与 progress 绑定已具备，无需新增字段。

## What Changes

- **进度条样式变体**：委派 fgui-designer 评估并产出进度条样式变体（不引入新的进度条**组件类型**语义，在 `Common` 包内新增可复用样式变体即可）；`AutoBattleView.xml` 中 `bar_unit_{n}_hp`（血条）与 `bar_unit_{n}_energy`（能量条）改用可区分的样式/尺寸/标签。
- **像素图与调色板（如需要）**：新增纯色像素图走 `bun run fgui sprite` 生成并登记，颜色必须 ⊆ `ui/demo/palette.json` 允许集合（新色先加入该文件），资源 id 前缀续编（`next-id --prefix`）。
- **VM/绑定微调**：`view/view.ts` 绑定声明保持节点名与 progress 语义不变（或仅对齐），不新增字段；`logic/` 与数据模型（`hp/energy`）零改动。
- **验证**：`?smoke=auto-battle` 冒烟保持通过（页面可开、节点名对齐校验、驱动到终局）；截图 + `visual-verifier`（mode=fgui）核对血条/能量条视觉可区分；发布产物由 FGUI 编辑器生成（不手改）。

## Capabilities

### New Capabilities

- `auto-battle-status-bar-visuals`: 战场页状态条的视觉区分语义——`game_auto_battle` 战场页 SHALL 以可区分的视觉呈现单位 HP 条与能量条（颜色/尺寸/标签至少一项不同），区分属渲染层表现，不改变进度值绑定、数据模型与战斗逻辑。

### Modified Capabilities

- `auto-battle-playable`: 扩展"战场 ViewModel 绑定"要求——各单位血条与能量条不仅映射战斗状态，还须以视觉可区分的方式呈现（新增场景），绑定节点名与 progress 语义不变。

## Impact

- **FGUI 源**：`ui/demo/assets/Common/CommonProgressBar.xml`（样式变体）、`ui/demo/assets/AutoBattle/AutoBattleView.xml`（血/能量条引用样式切换）、`ui/demo/assets/Common/package.xml`（新资源登记）；改动须委派 fgui-designer 产出 + `bun run fgui validate --strict` 通过。
- **像素图/调色板（如需要）**：`ui/demo/palette.json`（新增色先入调色板）、`bun run fgui sprite` 生成的像素图与登记。
- **发布产物**：`assets/ui/AutoBattle/*`、`assets/ui/Common/*`（`.bin`/atlas 由 FGUI 编辑器发布生成，不手改，发布后 `fgui check-publish` 核对）。
- **验证链路**：`assets/samples/game_auto_battle/smoke.ts`（冒烟保持通过，无需改动）；视觉核对走截图 + visual-verifier（mode=fgui）。
- **不触碰**：`logic/`、`models/`、`view/view.ts` 绑定声明（或仅对齐）、测试断言（无样式断言）。
- **风险**：新增样式若引入跨包引用必须遵守 AGENTS 约束（只允许指向 `Common`/`Common_xxx`，不得指向 Basic/Builder 或其它业务包）；样式变体若在 `Common` 包内新增须保持包内资源 id 续编一致，`validate --strict` 全量通过。
