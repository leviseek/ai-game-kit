import type { JsonAsset } from "cc";
import { loadConfigTable } from "../../../core/config/ConfigLoader";
import type { IResourceProvider } from "../../../contracts/resource/ResourceProvider";
import type { ConfigTable } from "../../../contracts/config/Config";

/** 配置 Bundle 加载器：把引擎资源按配置内容语义加载为只读配置表。 */
export interface CocosConfigLoader {
  /**
   * 从配置 Bundle 装载一个配置资源（kind: "asset"）并解析为配置表。
   * 装载失败抛 ConfigLoadError 并保留底层原因；内容非纯对象抛 ConfigParseError。
   */
  loadConfig(bundle: string, path: string): Promise<ConfigTable>;
}

/**
 * Cocos Bundle 配置加载适配器：经资源层 `kind: "asset"` 读取配置资源，
 * 复用 LoadCoordinator/ResourceScope 语义，全程不触达存档键值后端。
 * 真实引擎下 JSON 配置资源以 JsonAsset 暴露，`.json` 即纯数据内容。
 */
export function createCocosConfigLoader(
  provider: IResourceProvider,
): CocosConfigLoader {
  return {
    loadConfig(bundle, path) {
      return loadConfigTable(provider, bundle, path, (resource) => {
        // 契约边界断言：Cocos JSON 配置资源必须是 JsonAsset；非该形状按内容
        // 非法处理，由 createConfigTable 抛 ConfigParseError（不产生部分状态）。
        const asset = resource as JsonAsset | undefined;
        return asset?.json;
      });
    },
  };
}
