## 1. 迁移基线

- [x] 1.1 确认当前工作区干净，`bun run test:foundation` 全绿作为重构前基线
- [x] 1.2 确认 registry 与五处夹具测试只引用 `game_*/assembly.ts`（留根），不引用其它平铺文件路径

## 2. game_card 迁移

- [x] 2.1 `git mv` 将 `game_card/models.ts` → `game_card/models/models.ts` + 新建 `models/index.ts` 转发
- [x] 2.2 `git mv` 将 `game_card` 能力文件（battle/config/clock/input）→ `game_card/logic/`，更新内部相对 import
- [x] 2.3 `git mv` 将 `game_card/ui.ts` → `game_card/view/ui.ts`
- [x] 2.4 更新 `game_card/assembly.ts` 内部相对 import 指向新子目录
- [x] 2.5 运行 `bun run test:foundation` 验证 card 迁移无行为漂移

## 3. game_rpg 迁移

- [x] 3.1 按 2.1-2.4 同法迁移 `game_rpg`（models/clock/input/resource/save/scene/state/ui）
- [x] 3.2 运行 `bun run test:foundation` 验证 rpg 迁移无行为漂移

## 4. game_idle 迁移

- [x] 4.1 按同法迁移 `game_idle` 全部文件
- [x] 4.2 运行 `bun run test:foundation` 验证 idle 迁移无行为漂移

## 5. game_tycoon 迁移

- [x] 5.1 按同法迁移 `game_tycoon` 全部文件（含 ui.ts 中的 VM 派生逻辑）
- [x] 5.2 运行 `bun run test:foundation` 验证 tycoon 迁移无行为漂移

## 6. game_fight 迁移

- [x] 6.1 按同法迁移 `game_fight` 全部文件
- [x] 6.2 运行 `bun run test:foundation` 验证 fight 迁移无行为漂移

## 7. 收口验证

- [x] 7.1 运行 `bun run test:foundation`、`bun run test:foundation:types`、`bun run test:fgui` 全绿
- [x] 7.2 运行 `bun run typecheck`（含 tools/creator、tools/fgui tsconfig）通过
- [x] 7.3 检查 `public-boundary.test.ts` 示例路径与真实目录语义一致；`public-boundary` 依赖扫描通过
- [x] 7.4 确认 `assets/game/fixture/registry.ts` 与五处夹具测试无需改动（assembly.ts 留根），如有意外路径依赖一并修复
- [x] 7.5 ADR 检查：本 change 为纯目录重构，未产生新架构决策（目录形态沿用 ADR-018 决策 1 的 Bundle 边界），记录无需 ADR
