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

/**
 * 通用动态组件节点解析器：静态节点按名查页面子元素；未命中时按 mapping 懒
 * 创建组件实例加入容器（按 id 复用）。供需要运行时实例化实体集合的页面
 * （如战场单位）使用；渲染层只消费 ViewModelNode 契约，不感知创建细节。
 * 返回值附加 prune 能力：渲染器每次 setBindings 全量刷新后把当前节点名交给
 * 本句柄，回收不再被绑定的实例（阵亡单位实例随绑定集移除）。
 */
export function createDynamicComponentViewHandle(
    view: GComponent,
    mapping: DynamicComponentMapping,
): DynamicInstanceResolver {
    const container = view.getChild(mapping.containerName) as GComponent | null;
    const instances = new Map<string, GObject>();

    function ensureInstance(id: string): GObject | undefined {
        const existing = instances.get(id);
        if (existing !== undefined) {
            return existing;
        }
        if (container === null) {
            return undefined;
        }
        const created = UIPackage.createObjectFromURL(mapping.componentUrl);
        if (created === null) {
            return undefined;
        }
        created.name = `${mapping.containerName}_${id}`;
        container.addChild(created);
        instances.set(id, created);
        return created;
    }

    const resolver: DynamicInstanceResolver = (name: string): ViewModelNode | undefined => {
        const child = view.getChild(name);
        if (child !== null) {
            return wrapFairyGuiObject(child);
        }

        if (container === null) {
            return undefined;
        }
        const parsed = mapping.parse(name);
        if (parsed === undefined) {
            return undefined;
        }
        const instance = ensureInstance(parsed.id);
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
    };

    resolver.prune = (nodeNames: readonly string[]): void => {
        const activeIds = new Set<string>();
        for (const name of nodeNames) {
            const parsed = mapping.parse(name);
            if (parsed !== undefined) {
                activeIds.add(parsed.id);
            }
        }
        for (const [id, instance] of instances) {
            if (!activeIds.has(id)) {
                container?.removeChild(instance, true);
                instances.delete(id);
            }
        }
    };

    return resolver;
}
