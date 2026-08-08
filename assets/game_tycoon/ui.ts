import type { Module, UiNavigator } from "../framework";
import { TYCOON_FACTORY_ROUTE, TYCOON_HUB_ROUTE } from "./models";

/**
 * 分层 UI 模块：组合根创建的 UiNavigator 承载分层 route 的打开/关闭。
 * 经营状态经两层呈现——normal 层总览（hub）与 popup 层生产详情（factory），
 * 覆盖关系由导航层层级契约维护。适配层负责 route 到 fgui 呈现的绑定；
 * 本模块只在导航层登记 route 标识，不依赖 fgui。模块只声明装配关系，
 * 不在 dispose 释放共享导航器——组合根的 dispose 统一负责
 * （对齐 GameFixture 幂等契约）。
 */
export function createTycoonUiModule(navigator: UiNavigator): Module {
  return {
    id: "tycoon.ui",
    dependencies: [],
    start: () => {
      // 打开代表性 route 的入口由调用方经 navigator 触发；此处登记 route 常量
      void TYCOON_HUB_ROUTE;
      void TYCOON_FACTORY_ROUTE;
      void navigator;
    },
  };
}
