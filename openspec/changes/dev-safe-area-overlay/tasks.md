## 1. 控制器与采样（boot/dev 纯逻辑 + 单测）

- [x] 1.1 扩 `DevInfo.ts`：`DevInfo` 加 `viewport`（物理/逻辑像素）与 `uiSize`（GRoot 尺寸）字段；`DevInfoSamplerOptions` 加 `readViewport`/`readUiSize` 读取器接缝；`createDevInfoSampler` 采样新字段
- [x] 1.2 新建 `SafeAreaOverlayController.ts`（boot/dev）：注入 `readSafeArea()`/`readBounds()`/`now()`，`step()` 重算 rect + 脏检查（值未变不重绘），经 `onRect` 回调输出
- [x] 1.3 新建 `tests/framework/foundation/safe-area-overlay-controller.test.ts`：rect 计算正确、值不变不重绘、值变化触发重绘、`readBounds`/`readSafeArea` 每次被实时调用（防快照）
- [x] 1.4 新建/扩展 `tests/framework/foundation/dev-info.test.ts`：分辨率字段采样正确、读取器注入生效、不可用时降级

## 2. Adapter 视图与 viewport 读取（framework/adapters/cocos）

- [x] 2.1 新建 `CocosViewportInfo`（framework/adapters/cocos）：物理像素 + 逻辑像素 + safe area rect 实时读取封装（`import * as cc` 仅限本文件），带可注入接缝
- [x] 2.2 新建 `SafeAreaOverlayViewHandle.ts`（framework/adapters/cocos/ui）：创建 9-slice 虚线框组件挂 GRoot、`setRect(rect)`、`setVisible(visible)`、`dispose()`（从 GRoot removeChild + 幂等）
- [x] 2.3 新建 `tests/framework/foundation/safe-area-overlay-view-handle.test.ts`：挂载后 GRoot 出现对象、setRect 位置尺寸正确、dispose 移除干净、setVisible 联动

## 3. FGUI 资源（委派 fgui-designer）

- [x] 3.1 委派 fgui-designer 生成黄色虚线像素图（`bun run fgui sprite`，新色进 `palette.json`）并登记资源
- [x] 3.2 委派 fgui-designer 新建安全区虚线框组件（四边 9-slice `<image>`，禁止 `<graph>`），DevOverlayBall 面板加 `info_viewport`/`info_resolution` 两个文本节点
- [x] 3.3 `bun run fgui validate --strict` 通过；`ui/generated` 类型更新；节点常量进 `DevBall.ts` 常量表（字符串归口三问）
- [x] 3.4 在 FGUI 编辑器中发布 DevOverlay 包，`fgui_check_publish` 三重证据通过

## 4. 装配与联动（boot/dev）

- [x] 4.1 `DevOverlay.ts` 装配：sampler 注入 `readViewport`/`readUiSize`（Adapter viewport 读取器）；创建 safe area 控制器与视图，与 DevBall 面板展开/收起联动（框可见性随面板状态）
- [x] 4.2 dev 关闭 no-op 零残留；`dispose` 同步移除框
- [x] 4.3 扩展 `tests/framework/foundation/dev-overlay-mount.test.ts`：dev 开→框+面板分辨率信息出现；dev 关→零残留

## 5. 验证与文档

- [ ] 5.1 浏览器缩窗口验证框跟随 + 面板分辨率更新（≤500ms 延迟可接受）；编辑器切不同设计分辨率核对（需在 Cocos 编辑器运行，人工验证）
- [x] 5.2 运行 `bun test`、lint、typecheck 全绿（相关测试 67 通过；foundation 全量 2 个既有失败与本改动无关，基线一致）
- [x] 5.3 ADR 检查：本次安全区可视化引入新架构决策（分层落点/像素图选型/resize 链路）→ 已创建 `doc/decisions/ADR-034-dev-overlay-safe-area-visualization.md`
