// 最小异步键值存储；存档 DTO/迁移属后续能力，不使用本接口承载。
export interface IPlatformStorage {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
}
