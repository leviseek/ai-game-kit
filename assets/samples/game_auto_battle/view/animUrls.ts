/**
 * 自动战斗动效帧 URL 常量：动画帧由独立 Cocos AssetBundle（`assets/animations/`）
 * 承载，URL 用 `bundle://<bundle名>/<包内相对路径>` 名字格式（适配层解析后经
 * GLoader.setUrlWithBundle 加载 spriteFrame）。不用 ui:// 短 id、不引用 FGUI 包内
 * 资源——动画帧已从 FGUI 包迁移到动画 bundle（FGUI 组件内只留首帧占位）。
 * 供爆炸序列帧（UnitHitFeedbackCom loader_effect）与单位形象动画（UnitSlot
 * loader_unit）按帧索引逐帧 setUrl 驱动。
 *
 * 帧 URL 数据源已迁移到配置表（unitAnimations 表，见 content/autoBattleTables）：
 * 本模块保留缺省变体帧表（WARRIOR_FRAME_URLS）供向后兼容与无表回退，新增
 * buildUnitAnimationFrames 按表条目生成帧 URL 序列，UnitAnimator 支持注入
 * frameUrlsOf 解析器（presenter 从 config 查询）。
 */

import type { AutoBattleAnimName, AutoBattleUnitAnimation } from "../models";

/** 动画专属 bundle 名（assets/animations.meta 的 isBundle 目录名）。 */
export const ANIM_BUNDLE = "animations";

/** 动画帧在 bundle 内的目录前缀（PNG 位于 assets/animations/auto-battle/）。 */
const ANIM_BUNDLE_DIR = "auto-battle";

/** 两位十进制补零：1 → "01"。 */
function pad2(value: number): string {
    return value < 10 ? `0${value}` : String(value);
}

/** 构造横向连续帧 URL 序列：`bundle://<bundle>/<dir>/<前缀><两位序号>`。 */
function frames(namePrefix: string, count: number): readonly string[] {
    return Array.from({ length: count }, (_, index) => `bundle://${ANIM_BUNDLE}/${ANIM_BUNDLE_DIR}/${namePrefix}_${pad2(index)}`);
}

/** 爆炸序列帧 URL（12 帧 × 96x96，资源 fx_explosion_00..11）。 */
export const EXPLOSION_FRAME_URLS: readonly string[] = frames("fx_explosion", 12);

/** 按单位动画表条目生成帧 URL 序列：`bundle://<bundle>/<dir>/<prefix>_<两位序号>`。 */
export function buildUnitAnimationFrames(animation: AutoBattleUnitAnimation): Readonly<Record<AutoBattleAnimName, readonly string[]>> {
    const build = (prefix: string): readonly string[] => Array.from({ length: animation.frameCount }, (_, index) => `bundle://${animation.bundle}/${animation.dir}/${prefix}_${pad2(index)}`);
    return {
        idle: build(animation.prefixByAnim.idle),
        gesture: build(animation.prefixByAnim.gesture),
        walk: build(animation.prefixByAnim.walk),
        attack: build(animation.prefixByAnim.attack),
        death: build(animation.prefixByAnim.death),
    };
}

/** warrior 动画名集合（精灵表行序：idle/gesture/walk/attack/death）。 */
export type WarriorAnim = "idle" | "gesture" | "walk" | "attack" | "death";

/** warrior 变体名（精灵表上下各 5 行；上 f 下 m，外观差异小，可后续按职业细分）。 */
export type WarriorVariant = "f" | "m";

/** 单位阵营 → warrior 变体：己方 f、敌方 m（占位映射，fgui-designer 目视确认）。 */
export const WARRIOR_VARIANT_BY_SIDE: Readonly<Record<string, WarriorVariant>> = {
    ally: "f",
    enemy: "m",
};

/** warrior 帧 URL 表：`[variant][anim]` → 10 帧 URL（资源 warrior_{v}_{anim}_00..09）。 */
export const WARRIOR_FRAME_URLS: Readonly<Record<WarriorVariant, Readonly<Record<WarriorAnim, readonly string[]>>>> = {
    f: {
        idle: frames("warrior_f_idle", 10),
        gesture: frames("warrior_f_gesture", 10),
        walk: frames("warrior_f_walk", 10),
        attack: frames("warrior_f_attack", 10),
        death: frames("warrior_f_death", 10),
    },
    m: {
        idle: frames("warrior_m_idle", 10),
        gesture: frames("warrior_m_gesture", 10),
        walk: frames("warrior_m_walk", 10),
        attack: frames("warrior_m_attack", 10),
        death: frames("warrior_m_death", 10),
    },
};
