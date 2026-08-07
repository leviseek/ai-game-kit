import type { Module, UiNavigator } from "../framework";
import { RPG_STATUS_ROUTE } from "./models";

/**
 * UI 模块：组合根创建的 UiNavigator 承载 FairyGUI route 的打开/关闭。
 * 适配层负责 route 到 fgui 呈现的绑定；本模块只在导航层登记 route 标识，
 * 不依赖 fgui。dispose 委托导航器释放页面作用域。
 */
export function createRpgUiModule(navigator: UiNavigator): Module {
  return {
    id: "rpg.ui",
    dependencies: [],
    start: () => {
      // 打开代表性 route 的入口由调用方经 navigator 触发；此处登记 route 常量
      void RPG_STATUS_ROUTE;
    },
    dispose: () => {
      navigator.dispose();
    },
  };
}
