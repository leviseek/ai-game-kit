import { FrameworkError } from "../errors/FrameworkError";
import type { IResourceProvider } from "../../contracts/resource/ResourceProvider";
import type { ConfigTable } from "../../contracts/config/Config";
import { ConfigLoadError } from "../../contracts/config/ConfigErrors";
import { createConfigTable } from "./ConfigTable";

/** 配置资源加载失败时，解包 LoadCoordinator 包装的 FrameworkError，保留底层原因。 */
function unwrapCause(error: unknown): unknown {
  // FrameworkError 把 cause 传给 Error 构造器，但类本身未声明该字段
  // （ES2015 lib 无 Error.cause）；此处按已知形状窄化后读取。
  if (error instanceof FrameworkError) {
    const cause = (error as FrameworkError & { readonly cause?: unknown })
      .cause;
    return cause !== undefined ? cause : error;
  }
  return error;
}

/**
 * 经资源层装载配置资源并解析为配置表。配置走 `kind: "asset"` 资源读取路径，
 * 复用 LoadCoordinator/ResourceScope 语义，全程不触达存档键值后端。
 * 装载失败抛 ConfigLoadError 并保留底层原因；内容非纯对象在 createConfigTable
 * 抛 ConfigParseError，均不产生部分配置状态。
 *
 * extractContent 把加载到的引擎资源转换为配置内容；缺省原样透传，
 * Cocos 适配器用它把 JsonAsset 解包为纯数据后再走 createConfigTable。
 */
export async function loadConfigTable(
  provider: IResourceProvider,
  bundle: string,
  path: string,
  extractContent: (resource: unknown) => unknown = (resource) => resource,
): Promise<ConfigTable> {
  const handle = provider.load(bundle, path);
  const settled = await handle.done;

  if (settled.state === "failed") {
    throw new ConfigLoadError(bundle, path, {
      cause: unwrapCause(settled.error),
    });
  }

  if (settled.state === "cancelled") {
    throw new ConfigLoadError(bundle, path);
  }

  return createConfigTable(extractContent(settled.resource));
}
