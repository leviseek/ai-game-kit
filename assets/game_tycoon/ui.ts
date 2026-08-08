import type { Module, UiNavigator } from "../framework";
import type { TycoonEconomicState, TycoonProductionState } from "./models";
import {
  TYCOON_FACTORY_ROUTE,
  TYCOON_HUB_ROUTE,
  type TycoonFactoryViewModel,
  type TycoonHubViewModel,
} from "./models";

/**
 * 分层 UI 的呈现数据源：各层 ViewModel 由 live 经营/生产状态派生。
 * 适配层负责 route 到 fgui 呈现的绑定；本层只做"状态 → ViewModel"的
 * 纯数据映射，不依赖 fgui，也不持有导航器之外的共享状态。
 */
export interface TycoonUiViewModels {
  /** normal 层总览 ViewModel：现金与库存快照。 */
  readonly hubViewModel: TycoonHubViewModel;
  /** popup 层生产详情 ViewModel：当前任务与进度。 */
  readonly factoryViewModel: TycoonFactoryViewModel;
}

/**
 * 从 live 状态派生分层 UI 的 ViewModel。快照函数由组合根注入
 * （读 economy/production 控制器），本层只做映射，保证业务数据
 * 经统一的呈现形状暴露给导航 route。
 */
export function createTycoonUiViewModels(sources: {
  readonly economyState: () => TycoonEconomicState;
  readonly productionState: () => TycoonProductionState;
}): TycoonUiViewModels {
  return {
    get hubViewModel(): TycoonHubViewModel {
      const state = sources.economyState();
      return {
        cash: state.cash,
        inventory: state.inventory,
      };
    },
    get factoryViewModel(): TycoonFactoryViewModel {
      const state = sources.productionState();
      return {
        activeProductId: state.activeProductId,
        progress: state.progress,
      };
    },
  };
}

/**
 * 分层 UI 模块：组合根创建的 UiNavigator 承载分层 route 的打开/关闭。
 * 经营状态经两层呈现——normal 层总览（hub）与 popup 层生产详情（factory），
 * 覆盖关系由导航层层级契约维护。模块只声明装配关系，不在 dispose 释放
 * 共享导航器——组合根的 dispose 统一负责（对齐 GameFixture 幂等契约）。
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
