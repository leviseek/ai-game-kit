import * as cc from "cc";

// 结构化的引擎接缝：只依赖本适配器用到的能力，便于测试注入 mock
interface CocosDirectorLike {
  loadScene(
    sceneName: string,
    onLaunched?: (error: Error | null, scene?: unknown) => void,
  ): boolean;
}

export interface CocosSceneAdapterOptions {
  /** 引擎 director；缺省使用 cc.director，测试可注入 mock。 */
  readonly director?: CocosDirectorLike;
}

export interface CocosSceneAdapter {
  /**
   * 激活目标场景：映射到 cc.director.loadScene。loadScene 返回 false（场景
   * 无法启动）或 onLaunched 携带错误时 reject，成功启动后 resolve。
   */
  readonly activateScene: (sceneId: string) => Promise<void>;
}

/**
 * Cocos 场景适配器：把 SceneFlow 的激活接缝映射到 cc.director.loadScene。
 * 只做薄映射，场景资源所有权与释放仍由 SceneFlow 通过资源提供者管理；
 * 不修改 startup.scene 序列化内容。
 */
export function createCocosSceneAdapter(
  options: CocosSceneAdapterOptions = {},
): CocosSceneAdapter {
  // 惰性读取 cc.director：未注入时才使用引擎默认实例
  const director = options.director ?? cc.director;

  return {
    activateScene: (sceneId: string) =>
      new Promise<void>((resolve, reject) => {
        const started = director.loadScene(sceneId, (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });

        // loadScene 返回 false 表示场景未能启动（如场景不存在）
        if (!started) {
          reject(new Error(`Cocos scene "${sceneId}" could not be loaded`));
        }
      }),
  };
}
