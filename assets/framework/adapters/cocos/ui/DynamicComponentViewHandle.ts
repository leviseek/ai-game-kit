import { GComponent, GObject, UIPackage } from "fairygui-cc";
import type { ViewModelNode } from "../../../contracts/ui/ViewModel";
import { wrapFairyGuiObject } from "./FairyGuiViewHandle";

/**
 * 动态组件节点映射：描述"按名找不到的节点 → 运行时实例化组件实例"的规则。
 * 纯数据（无 fgui 类型），由品类层提供，框架适配层据此装配动态解析器。
 */
export interface DynamicComponentMapping {
    /** 容器子组件名：动态实例加入该容器。 */
    readonly containerName: string;
    /** 组件 URL（UIPackage.createObjectFromURL）。 */
    readonly componentUrl: string;
    /**
     * 解析节点名 → 动态实例目标：`id` 用于按 id 复用实例，`field` 为实例内
     * 子字段名（`null` = 实例本身）。非动态节点返回 undefined。
     */
    readonly parse: (
        name: string,
    ) => { readonly id: string; readonly field: string | null } | undefined;
    /**
     * 可选活跃 id 推导：prune 回收时若未提供，用 parse(nodeNames) 从绑定集
     * 节点名推导活跃实例 id；提供则用该函数。供"实例生命周期跟随另一套映射"
     * 的场景（如命中反馈实例跟随单位实例：FX 节点名不在绑定集内，须从 unit_*
     * 节点推导活跃单位 id，使特效实例随 UnitSlot 一起回收）。
     */
    readonly activeIds?: (nodeNames: readonly string[]) => ReadonlySet<string>;
}

/** 动态实例句柄：resolver 本身 + 绑定集回收能力（供渲染器 setBindings 后调用）。 */
export interface DynamicInstanceResolver {
    (name: string): ViewModelNode | undefined;
    /**
     * 回收不再活跃的实例：把当前绑定集的节点名推导为活跃实例 id 集，销毁
     * instances 中不在该集合的实例（对齐"单位随状态增删"语义）。
     */
    prune(nodeNames: readonly string[]): void;
}

/** 单套映射的内部状态：容器 + 实例表（解析与回收的边界）。 */
interface MappingState {
    readonly mapping: DynamicComponentMapping;
    container: GComponent | null;
    readonly instances: Map<string, GObject>;
}

/** 组装单套映射的解析与回收状态。 */
function createMappingState(mapping: DynamicComponentMapping): MappingState {
    return {
        mapping,
        container: null,
        instances: new Map(),
    };
}

/** 按 id 懒创建组件实例加入容器；容器缺失或创建失败返回 undefined。 */
function ensureInstanceIn(
    state: MappingState,
    id: string,
): GObject | undefined {
    const existing = state.instances.get(id);
    if (existing !== undefined) {
        return existing;
    }
    const container = state.container;
    if (container === null) {
        return undefined;
    }
    const created = UIPackage.createObjectFromURL(state.mapping.componentUrl);
    if (created === null) {
        return undefined;
    }
    created.name = `${state.mapping.containerName}_${id}`;
    container.addChild(created);
    state.instances.set(id, created);
    return created;
}

/**
 * 通用动态组件节点解析器：静态节点按名查页面子元素；未命中时按 mappings 逐套
 * 懒创建组件实例加入各自容器（按 id 复用）。供需要运行时实例化实体集合的页面
 * （如战场单位 + 命中反馈特效）使用；渲染层只消费 ViewModelNode 契约，不感知
 * 创建细节。支持单套或数组映射：每套映射独立容器与实例表，节点名依次匹配，
 * 首套命中即返回（不跨套匹配）。返回值附加 prune 能力：渲染器每次 setBindings
 * 全量刷新后把当前节点名交给本句柄，逐套回收不再活跃的实例。
 */
export function createDynamicComponentViewHandle(
    view: GComponent,
    mapping: DynamicComponentMapping | readonly DynamicComponentMapping[],
): DynamicInstanceResolver {
    const mappings: readonly DynamicComponentMapping[] = Array.isArray(mapping)
        ? mapping
        : [mapping];
    const states: MappingState[] = mappings.map((item) => {
        const state = createMappingState(item);
        state.container = view.getChild(item.containerName) as GComponent | null;
        return state;
    });

    const resolver: DynamicInstanceResolver = (name: string): ViewModelNode | undefined => {
        const child = view.getChild(name);
        if (child !== null) {
            return wrapFairyGuiObject(child);
        }

        for (const state of states) {
            const parsed = state.mapping.parse(name);
            if (parsed === undefined) {
                continue;
            }
            const instance = ensureInstanceIn(state, parsed.id);
            if (instance === undefined) {
                return undefined;
            }
            if (parsed.field === null) {
                return wrapFairyGuiObject(instance);
            }
            const target = (instance as GComponent).getChild(parsed.field);
            if (target === null) {
                return undefined;
            }
            return wrapFairyGuiObject(target);
        }
        return undefined;
    };

    resolver.prune = (nodeNames: readonly string[]): void => {
        for (const state of states) {
            const { mapping, container, instances } = state;
            let activeIds: ReadonlySet<string>;
            if (mapping.activeIds !== undefined) {
                activeIds = mapping.activeIds(nodeNames);
            } else {
                activeIds = new Set<string>();
                for (const name of nodeNames) {
                    const parsed = mapping.parse(name);
                    if (parsed !== undefined) {
                        (activeIds as Set<string>).add(parsed.id);
                    }
                }
            }
            for (const [id, instance] of instances) {
                if (!activeIds.has(id)) {
                    container?.removeChild(instance, true);
                    instances.delete(id);
                }
            }
        }
    };

    return resolver;
}
