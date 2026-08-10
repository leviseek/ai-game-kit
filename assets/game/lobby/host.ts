import type { ViewModelNode } from "../../framework";
import type { FairyGuiListHandle } from "../../framework";
import type { GameEntryInfo } from "./catalog";

/**
 * 品类会话编排的宿主接缝：真实 UI 宿主（boot/AppRoot）注入打开/关闭入口页
 * 的能力。lobby 保持引擎无关，页面呈现细节（package 加载、pageAdapter、
 * FairyGuiViewHandle 节点解析器）留在宿主实现，lobby 只编排夹具生命周期、
 * 呈现器装配与会话作用域顺序。类型经 host.ts 共享给 boot 与 game（boot 仅
 * `import type`，不引入运行时依赖）。
 */
export interface GameLobbyHost {
    /**
     * 打开品类入口页并返回会话页面句柄。会话资源作用域（品类 package 持有）
     * 由宿主在此建立并绑定到句柄，exit 时经 closeEntryPage 逆序释放。
     * 句柄暴露真实页面的节点解析器，供 lobby 装配品类呈现器（ViewModelRenderer）。
     */
    openEntryPage(entry: GameEntryInfo): Promise<EntryPageHandle>;
    /**
     * 会话内切换到另一入口页：关闭当前入口页并释放其作用域，再打开新入口页
     * （同一品类会话的多页面流程，如 auto_battle 编队页 → 战场页）。幂等。
     */
    switchEntryPage(entry: GameEntryInfo): Promise<EntryPageHandle>;
    /** 关闭入口页并释放会话作用域。重复关闭幂等。 */
    closeEntryPage(handle: EntryPageHandle): Promise<void>;
    /** 打开全局常驻页（列表页），持有于全局作用域，不占用会话槽位。 */
    openGlobalPage(entry: GameEntryInfo): Promise<EntryPageHandle>;
    /** 确保某 Bundle 已加载（经 provider.load 哨兵资源触发脚本执行）；幂等。 */
    loadBundle(bundle: string): Promise<void>;
    /** UI 根初始化并返回是否就绪（fgui GRoot 可用）；幂等重试语义。 */
    ensureUiReady(): boolean;
    /** 加载共享 UI 依赖包（Common）到全局作用域常驻；幂等。 */
    ensureSharedUiDependencies(): Promise<void>;
}

/**
 * 会话页面句柄：承载"页面关闭 → 会话退出"联动与真实页面节点解析器。
 * 宿主把关闭回调登记进真实页面作用域（如 UiPage.addDisposable），导航关闭
 * 页面时触发；重复登记幂等。页面关闭联动保证返回键只关页面也能触发会话
 * 清理，不遗留运行中的夹具。
 */
export interface EntryPageHandle {
    /** 真实页面节点解析器：按名解析 fgui 节点，供呈现器装配渲染。 */
    readonly node: (name: string) => ViewModelNode | undefined;
    /**
     * 可选列表解析器：按名解析 fgui GList 并包装为引擎无关句柄，供含虚拟
     * 列表的页面（如编队页候选区）呈现器驱动。无列表的页面为 undefined。
     */
    readonly list?: (name: string) => FairyGuiListHandle<unknown> | undefined;
    /** 注册页面关闭回调：导航关闭该页面时触发一次（幂等）。 */
    onClose(callback: () => void): void;
}
