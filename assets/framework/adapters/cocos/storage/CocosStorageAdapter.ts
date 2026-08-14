import * as cc from "cc";
import { SaveCorruptionError } from "../../../core/storage/VersionedStorage";
import type { IPlatformStorage } from "../../../contracts/interfaces/IPlatformStorage";

// localStorage 形状接缝：与 cc.sys.localStorage 同构，便于测试注入与替换平台后端。
export interface LocalStorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

export interface CocosStorageAdapterOptions {
    /** 平台键值后端；缺省 cc.sys.localStorage。测试可注入 mock。 */
    readonly localStorage?: LocalStorageLike;
}

// 平台存储适配器：实现 IPlatformStorage 契约，并暴露恢复默认/备份恢复路径。
export interface CocosStorageAdapter extends IPlatformStorage {
    /** 恢复默认：删除正式键及配套临时/备份键，使读取回到"不存在"，只影响该键。 */
    restoreDefault(key: string): Promise<void>;
    /** 备份恢复：把最近一次有效备份提升为正式值并清理备份/临时键；无可用备份抛 SaveCorruptionError。 */
    restoreBackup(key: string): Promise<void>;
}

// 临时键与备份键后缀：正式键即调用方传入的键，临时/备份键附加后缀派生。
// 后缀必须以 `%` + 小写字母开头：versioned-storage 的键经 encodeURIComponent
// 编码，其中 `%` 恒为大写 `%XX` 序列，小写后缀（如 `%tmp`/`%bak`）不可能出现在
// 任何编码键中，故临时/备份键与正式键空间严格不相交（`.tmp`/`.bak` 因 `.` 未被
// 编码会与合法键冲突，不可用）。适配器不转义调用方键，此约定以调用方键名不含
// `%tmp`/`%bak` 结尾为前提。备份键占用额外键空间，恢复路径会清理。
const TEMP_SUFFIX = "%tmp";
const BACKUP_SUFFIX = "%bak";

// 存储信封：写入值附带校验和，使适配器能区分"键不存在"（get 返回 null）与
// "内容损坏"（envelope 非法或校验和不符，抛 SaveCorruptionError）。
interface Envelope {
    readonly value: string;
    readonly check: string;
}

// FNV-1a 32 位哈希：对写入值做轻量完整性校验，不依赖平台能力。
function checksum(value: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16);
}

function wrap(value: string): string {
    const envelope: Envelope = { value, check: checksum(value) };
    return JSON.stringify(envelope);
}

// 解包并校验信封：JSON 非法、形状不符或校验和不一致均视为损坏。
// 该判断是适配器层损坏诊断的唯一来源，错误类型与 versioned-storage 衔接。
function unwrap(raw: string): string {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new SaveCorruptionError("invalid envelope");
    }

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new SaveCorruptionError("unexpected envelope shape");
    }

    const envelope = parsed as Partial<Envelope>;
    if (typeof envelope.value !== "string" || typeof envelope.check !== "string") {
        throw new SaveCorruptionError("unexpected envelope shape");
    }

    if (checksum(envelope.value) !== envelope.check) {
        throw new SaveCorruptionError("checksum mismatch");
    }

    return envelope.value;
}

export function createCocosStorageAdapter(options: CocosStorageAdapterOptions = {}): CocosStorageAdapter {
    // 惰性取引擎后端：仅在未注入时读取，避免构造即访问 cc.sys（同 CocosInputAdapter）。
    const backend = options.localStorage ?? (cc.sys as { localStorage: LocalStorageLike }).localStorage;

    // 平台无键值后端时构造即报错，避免首次调用才抛难以诊断的 TypeError
    if (backend === undefined || backend === null) {
        throw new Error("Cocos storage adapter requires a localStorage backend; inject one via options.localStorage");
    }

    async function set(key: string, value: string): Promise<void> {
        const tempKey = `${key}${TEMP_SUFFIX}`;
        const backupKey = `${key}${BACKUP_SUFFIX}`;
        const wrapped = wrap(value);

        // 临时键写入完整新值；异常路径由 finally 统一清理，避免失败后残留临时键
        backend.setItem(tempKey, wrapped);
        try {
            // 校验：读回临时键确认平台完整持久化新值；不符则中断，不改动正式键
            if (backend.getItem(tempKey) !== wrapped) {
                throw new SaveCorruptionError("temp write verification failed");
            }

            const current = backend.getItem(key);

            // 值与正式键当前内容一致时无需重写备份/替换：同值不产生"替换"，无新数据
            // 可备份，且可避免写放大。注意备份存在性因此依赖"跨值写入历史"——首次写入
            // 后同值重复写不会创建备份，损坏后 restoreBackup 会以"no usable backup"报错。
            if (current === wrapped) {
                return;
            }

            // 替换前保留可用备份：把当前正式值复制到备份键
            if (current !== null) {
                backend.setItem(backupKey, current);
            }

            // 一次性替换正式键；平台 setItem 原子写入，不产生半写入
            backend.setItem(key, wrapped);
        } finally {
            backend.removeItem(tempKey);
        }
    }

    async function get(key: string): Promise<string | null> {
        const raw = backend.getItem(key);
        if (raw === null) {
            return null;
        }
        return unwrap(raw);
    }

    async function removeKey(key: string): Promise<void> {
        backend.removeItem(key);
        backend.removeItem(`${key}${TEMP_SUFFIX}`);
        backend.removeItem(`${key}${BACKUP_SUFFIX}`);
    }

    async function restoreDefault(key: string): Promise<void> {
        await removeKey(key);
    }

    async function restoreBackup(key: string): Promise<void> {
        const backupKey = `${key}${BACKUP_SUFFIX}`;
        const raw = backend.getItem(backupKey);

        if (raw === null) {
            throw new SaveCorruptionError("no usable backup");
        }

        // 备份内容须校验通过才提升，损坏备份不覆盖正式键
        const value = unwrap(raw);
        backend.setItem(key, wrap(value));
        backend.removeItem(backupKey);
        backend.removeItem(`${key}${TEMP_SUFFIX}`);
    }

    return {
        get,
        set,
        delete: removeKey,
        restoreDefault,
        restoreBackup,
    };
}
