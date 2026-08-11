## 1. 环境开关

- [x] 1.1 `boot/dev/dev-env.ts`（新）：`createIsDevEnabled({ ccDebug, search })`——cc 宏为主，URL `?dev=0` 强制关闭、`?dev=1` 强制开启；可注入便于纯 TS 测试。
- [x] 1.2 环境开关单测：debug+无参数开启；release 关闭；`?dev=0` 覆盖 debug；`?dev=1` 强制开启 release；非法参数不抛错回退默认。

## 2. 信息源

- [x] 2.1 `framework/adapters/cocos/device/CocosDeviceInfo.ts`（新）：实现既有 `DeviceInfo` 契约（platform/model/language），读 `cc.sys`；结构化接缝（构造注入读取器）测试可注入。
- [x] 2.2 `boot/dev/dev-info.ts`（新）：`DevInfoSampler`——运行时间（注入墙钟 `TimeSource` 差值，格式化 mm:ss）、平台/型号（CocosDeviceInfo）、网络（navigator.onLine + connection.effectiveType，降级 unknown）、FPS/内存（复用 `PerfSampler`）。
- [x] 2.3 采样器单测：注入假墙钟/假 DeviceInfo/假 navigator/假 PerfSampler，验证格式化与降级路径。

## 3. FGUI 组件

- [x] 3.1 FGUI（委派 fgui-designer + `bun run fgui validate --strict`）：新包 `DevOverlay` —— `DevOverlayBall.xml`（收缩小球，纯色 sprite 生成 + FPS 徽标文本）、`DevOverlayPanel.xml`（信息面板：运行时间/平台/网络/FPS/内存 text 节点 + 背景）；禁 graph/transition，仅跨包引 Common。
- [x] 3.2 FGUI 发布：AutoBattle 无关，发布 DevOverlay 包到真实产物路径，`check_publish` 证据通过。

## 4. 悬浮球控制器

- [x] 4.1 `boot/dev/dev-ball.ts`（新）：状态机 `collapsed → dragging → snapping → expanded`；TOUCH 事件拖拽（setXY 更新、拖动中停用吸附）；默认贴 view 左上角常驻，释放回左侧贴边（GRoot 设计分辨率边界，动画插值）。
- [x] 4.2 展开/收起：鼠标 ROLL_OVER 悬停展开、ROLL_OUT 移出收起；点击轻点预留 onTap 回调（当前 no-op，日后经注册接入 GM 面板）；动画 TS 驱动（alpha/xy/visible，禁 transition，注入 timeSource）。
- [x] 4.3 控制器单测：状态机迁移、贴边计算（最近边选择、露头坐标）、触摸 vs 鼠标分支、动画目标位置。

## 5. 装配接入

- [x] 5.1 `boot/dev/dev-overlay.ts`（新）：装配入口——`mountDevOverlay({ root, isDevEnabled, sampler, timeSource })`，GRoot 就绪后挂载到全局常驻作用域，幂等（重复调用只创建一次），返回 dispose 句柄。
- [x] 5.2 `boot/AppRoot.ts`：BootFlow UI 根就绪后若 `isDevEnabled()` 为 true 则挂载 dev overlay；`onDestroy` 释放；dev 关闭默认不创建。
- [x] 5.3 既有 `approot-composition` / `approot-ui-smoke` 测试注入 `isDevEnabled=false` 保持路径不变；装配测试验证 dev 关闭不创建、dev 开启挂载且幂等。

## 6. 测试与验证

- [x] 6.1 新增模块纯逻辑单测全绿（环境开关/采样/贴边/状态机）；`bun run typecheck` / `typecheck:ci` / `lint` 通过。注：`bun test` 全量存在 1 个与本 change 无关的既有失败（`game-auto-battle-fixture` "declares the exact auto-battle module list"）。
- [x] 6.2 FGUI 编辑器视觉验证（visual-verifier，mode=fgui）：悬浮球收缩态（蓝色圆形 + FPS 徽标）与信息面板（深色背景 + 五行文本）通过；面板位于球左侧负坐标区，静态 48x48 截图范围裁切不入镜，结构经 `read-component` 确认。Cocos 预览运行时确认（debug 常驻/拖拽贴边/悬停展开/release 无残留）为人工运行 debug 构建的后续项。

## 7. ADR 检查

- [x] 7.1 ADR 检查：本 change 引入 dev overlay 分层归属（工程能力独立模块、不进 framework 白名单/samples 品类）与环境开关策略（cc 宏 + URL 覆盖、release 关闭），属架构决策——创建 `doc/decisions/ADR-031-dev-overlay-layer-and-environment-gate.md`。
