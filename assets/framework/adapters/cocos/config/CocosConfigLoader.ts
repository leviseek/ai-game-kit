import type { JsonAsset } from "cc";
import { loadConfigTable } from "../../../core/config/ConfigLoader";
import { ConfigLoadError } from "../../../core/config/ConfigErrors";
import type { IResourceProvider } from "../../../contracts/resource/ResourceProvider";
import type { ConfigTable } from "../../../contracts/config/Config";

/** 配置 Bundle 加载器：把引擎资源按配置内容语义加载为只读配置表。 */
export interface CocosConfigLoader {
    /**
     * 从配置 Bundle 装载一个配置资源（kind: "asset"）并解析为配置表。
     * 装载失败或资源非 JsonAsset 形状抛 ConfigLoadError（携带 bundle/path）；
     * 内容非纯对象抛 ConfigParseError。
     */
    loadConfig(bundle: string, path: string): Promise<ConfigTable>;
}

/**
 * Cocos Bundle 配置加载适配器：经资源层 `kind: "asset"` 读取配置资源，
 * 经 LoadCoordinator 去重与并发共享，全程不触达存档键值后端。
 * 真实引擎下 JSON 配置资源以 JsonAsset 暴露，`.json` 即纯数据内容。
 */
export function createCocosConfigLoader(provider: IResourceProvider): CocosConfigLoader {
    return {
        loadConfig(bundle, path) {
            return loadConfigTable(provider, bundle, path, (resource) => {
                // 契约边界断言：Cocos JSON 配置资源必须是 JsonAsset 形状；加载成功但
                // 形状不符（如 TextAsset）以 ConfigLoadError 携带 bundle/path 表达，
                // 保证诊断可定位到具体资源。
                const asset = resource as JsonAsset | undefined;
                if (asset === null || typeof asset !== "object" || !Object.prototype.hasOwnProperty.call(asset, "json")) {
                    throw new ConfigLoadError(bundle, path, {
                        cause: new Error("loaded resource is not a JSON config asset"),
                    });
                }
                return asset.json;
            });
        },
    };
}
