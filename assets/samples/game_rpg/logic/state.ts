import type { IModule } from "../../../framework";
import type { RpgPlayerState } from "../models";

/**
 * 跨场景状态持有器：玩家状态由组合根闭包持有，场景切换不重建。
 * 模块只负责在生命周期中"锚定"该持有器，状态读写经组合根暴露的
 * playerState 钩子完成（见 assembly.ts）。
 */
export interface RpgStateStore {
    get(): RpgPlayerState | null;
    set(state: RpgPlayerState): void;
}

export function createRpgStateStore(): RpgStateStore {
    let current: RpgPlayerState | null = null;

    return {
        get: () => current,
        set: (state: RpgPlayerState) => {
            // 拷贝后持有，避免调用方随后修改同一对象影响已存状态
            current = { ...state };
        },
    };
}

/** 跨场景状态模块：状态持有本身是纯闭包，模块生命周期无副作用。 */
export function createRpgStateModule(store: RpgStateStore): IModule {
    return {
        id: "rpg.state",
        dependencies: [],
        start: () => {
            // 持有器在组合根构造时即就绪；start 只是让模块进入装配清单
            void store;
        },
    };
}
