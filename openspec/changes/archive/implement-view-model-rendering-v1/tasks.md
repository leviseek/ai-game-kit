## 1. 契约与测试基线

- [x] 1.1 编写 `tests/framework/foundation/view-model-renderer.test.ts` 的失败测试：Bindable 读写/相同值不触发/订阅；绑定声明各 kind；diff 只更新变化绑定；全量渲染；dispose 幂等；未知节点容错
- [x] 1.2 确认失败测试编译（API 未实现，测试处于红）

## 2. 契约文件

- [x] 2.1 新增 `assets/framework/contracts/ui/ViewModel.ts`：`Bindable<T>`、`ViewModel`、`ViewModelNode`、`Binding<T>` 判别联合
- [x] 2.2 检查既有 `contracts/ui/Navigation.ts` 零修改

## 3. 核心渲染器

- [x] 3.1 新增 `assets/framework/core/ui/ViewModelRenderer.ts`：`createBindable`、`createViewModelRenderer`（setViewModel 全量 + 订阅自动 diff + refresh + dispose）
- [x] 3.2 运行 `bun run test:foundation` 目标测试转绿（TDD 闭环）

## 4. 视图接缝与白名单

- [x] 4.1 新增 `assets/framework/adapters/cocos/ui/FairyGuiViewHandle.ts`：`createFairyGuiViewHandle`，fgui 类型仅此文件
- [x] 4.2 更新 `assets/framework/index.ts` 白名单导出新增符号
- [x] 4.3 更新 `tests/framework/foundation/public-boundary.test.ts` 的 `expectedRootExports` 同步新增符号

## 5. 收口验证

- [x] 5.1 运行 `bun run test:foundation`、`bun run test:foundation:types`、`bun run test:fgui` 全绿
- [x] 5.2 运行 `bun run typecheck`（含 tools/creator、tools/fgui tsconfig）通过
- [x] 5.3 确认 `framework/core`+`contracts` 既有文件零修改（git diff 检查）；public-boundary 依赖扫描通过
- [x] 5.4 新增 ADR-019（允许 contracts/ui 与 core/ui 新增能力文件，既有文件零修改）
- [x] 5.5 ADR 检查收尾：本 change 已产生新架构决策（渲染管线边界），ADR-019 已创建
