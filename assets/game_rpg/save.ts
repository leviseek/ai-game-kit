import type { Module, PlatformStorage } from "../framework";

/** 存档 schema 版本：夹具层自持版本号，升级时递增。 */
export const RPG_SAVE_VERSION = 1;

/** 版本化存档句柄：基于注入的平台存储，写入带版本号的存档记录。 */
export interface RpgSave {
  readonly currentVersion: number;
  save(namespace: string, key: string, data: unknown): Promise<void>;
  load(
    namespace: string,
    key: string,
  ): Promise<{ version: number; data: unknown } | null>;
}

/**
 * 版本化存档：把 (namespace, key) 编码为平台存储键，记录 `{ version, data }`
 * 记录。夹具层实现"版本化"语义（存版本号、读取时校验），不依赖框架根入口
 * 白名单外的内部实现（design decision 4 边界）。
 */
export function createRpgSave(storage: PlatformStorage): RpgSave {
  const keyFor = (namespace: string, key: string): string =>
    `rpg:${encodeURIComponent(namespace)}:${encodeURIComponent(key)}`;

  return {
    currentVersion: RPG_SAVE_VERSION,
    async save(namespace: string, key: string, data: unknown): Promise<void> {
      const record = JSON.stringify({
        version: RPG_SAVE_VERSION,
        data,
      });
      await storage.set(keyFor(namespace, key), record);
    },
    async load(
      namespace: string,
      key: string,
    ): Promise<{ version: number; data: unknown } | null> {
      const raw = await storage.get(keyFor(namespace, key));
      if (raw === null) {
        return null;
      }
      const record = JSON.parse(raw) as { version: number; data: unknown };
      return { version: record.version, data: record.data };
    },
  };
}

export function createRpgSaveModule(save: RpgSave): Module {
  return {
    id: "rpg.save",
    dependencies: [],
    start: () => {
      // 存档仓库已就绪；版本号经 currentVersion 暴露
      void save.currentVersion;
    },
    dispose: () => {
      // 平台存储由注入方持有，此处不释放
    },
  };
}
