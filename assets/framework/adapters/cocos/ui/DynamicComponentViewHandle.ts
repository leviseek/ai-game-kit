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

/**
 * 通用动态组件节点解析器：静态节点按名查页面子元素；未命中时按 mapping 懒
 * 创建组件实例加入容器（按 id 复用）。供需要运行时实例化实体集合的页面
 * （如战场单位）使用；渲染层只消费 ViewModelNode 契约，不感知创建细节。
 */
export function createDynamicComponentViewHandle(
    view: GComponent,
    mapping: DynamicComponentMapping,
): (name: string) => ViewModelNode | undefined {
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

    return (name: string): ViewModelNode | undefined => {
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
}
