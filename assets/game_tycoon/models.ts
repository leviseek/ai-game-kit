/**
 * 模拟经营品类业务模型：生产链与经济模型仅存在于游戏层，
 * 框架层不出现对应类型（负向边界断言由 5.1 测试锁定）。
 */

/** 生产产品配置：成本、售价与生产时长由配置表驱动（数值与来源分离）。 */
export interface TycoonProduct {
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  readonly price: number;
  readonly durationMs: number;
}

/** 生产链状态：当前生产中的产品与完成进度（0..1），空闲时无活动任务。 */
export interface TycoonProductionState {
  readonly activeProductId: string | null;
  readonly progress: number;
}

/** 经济状态：现金与各产品库存；生产完成入库存、出售换现金。 */
export interface TycoonEconomicState {
  readonly cash: number;
  readonly inventory: Readonly<Record<string, number>>;
}

/** 代表性 FairyGUI route（normal 层）：经营总览。 */
export const TYCOON_HUB_ROUTE = "tycoon/hub";

/** 代表性 FairyGUI route（popup 层）：生产详情。 */
export const TYCOON_FACTORY_ROUTE = "tycoon/factory";

/** normal 层总览的 ViewModel：只承载呈现数据，不涉及渲染实现。 */
export interface TycoonHubViewModel {
  readonly cash: number;
  readonly inventory: Readonly<Record<string, number>>;
}

/** popup 层生产详情的 ViewModel：只承载呈现数据。 */
export interface TycoonFactoryViewModel {
  readonly activeProductId: string | null;
  readonly progress: number;
}
