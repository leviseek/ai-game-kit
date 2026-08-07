import type { Module, SceneFlow } from "../framework";

/**
 * 场景流转模块：组合根创建的 SceneFlow 负责跨场景资源加载与作用域释放，
 * 场景 A 独有资源在切到场景 B 时随作用域释放。模块只登记引用，
 * 不复制场景逻辑；dispose 委托 SceneFlow 释放资源与流转状态。
 */
export function createRpgSceneModule(flow: SceneFlow): Module {
  return {
    id: "rpg.scene",
    dependencies: [],
    start: () => {
      // SceneFlow 由组合根创建并注入；此处仅确认其已就绪
      void flow.state;
    },
    dispose: () => {
      flow.dispose();
    },
  };
}
