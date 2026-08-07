import type { Module, UiNavigator } from "../framework";
import { RPG_STATUS_ROUTE } from "./models";

/**
 * UI 模块：组合根创建的 UiNavigator 承载 FairyGUI route 的打开/关闭。
 * 适配层负责 route 到 fgui 呈现的绑定；本模块只在导航层登记 route 标识，
 * 不依赖 fgui。模块只声明装配关系，不在 dispose 释放共享导航器——组合根
 * 的 dispose 统一负责（避免 failRollback 探针复用模块实例时提前销毁夹具
 * 自身导航器，对齐 GameFixture 幂等契约）。
 */
export function createRpgUiModule(navigator: UiNavigator): Module {
  return {
    id: "rpg.ui",
    dependencies: [],
    start: () => {
      // 打开代表性 route 的入口由调用方经 navigator 触发；此处登记 route 常量
      void RPG_STATUS_ROUTE;
    },
  };
}
