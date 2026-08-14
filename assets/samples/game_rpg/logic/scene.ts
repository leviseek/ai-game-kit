import type { IModule, SceneFlow } from "../../../framework";

/**
 * 场景流转模块：组合根创建的 SceneFlow 负责跨场景资源加载与作用域释放，
 * 场景 A 独有资源在切到场景 B 时随作用域释放。模块只声明装配关系，
 * 不复制场景逻辑，也不在 dispose 释放共享 SceneFlow——组合根的 dispose
 * 统一负责能力释放（避免 failRollback 探针复用模块实例时提前销毁夹具
 * 自身能力，对齐 GameFixture 幂等契约）。
 */
export function createRpgSceneModule(flow: SceneFlow): IModule {
    return {
        id: "rpg.scene",
        dependencies: [],
        start: () => {
            // SceneFlow 由组合根创建并注入；此处仅确认其已就绪
            void flow.state;
        },
    };
}
