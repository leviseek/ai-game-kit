/**
 * 迁移器：把某旧版本的存档数据升级为下一版本数据。
 * 迁移器只负责"该级"升级；框架按注册映射逐级调用，不感知具体数据形状。
 */
export interface ISaveMigrator {
    (data: unknown): unknown;
}
