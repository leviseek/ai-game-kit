import * as cc from "cc";
import { SaveCorruptionError } from "../../../core/storage/VersionedStorage";
import type { PlatformStorage } from "../../../contracts/platform/Platform";

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

// 平台存储适配器：实现 PlatformStorage 契约，并暴露恢复默认/备份恢复路径。
export interface CocosStorageAdapter extends PlatformStorage {
  /** 恢复默认：删除正式键及配套临时/备份键，使读取回到"不存在"，只影响该键。 */
  restoreDefault(key: string): Promise<void>;
  /** 备份恢复：把最近一次有效备份提升为正式值并清理备份/临时键；无可用备份抛 SaveCorruptionError。 */
  restoreBackup(key: string): Promise<void>;
}

// 临时键与备份键后缀：正式键即调用方传入的键，临时/备份键附加后缀以互不冲突。
// 备份键占用额外键空间，恢复路径会清理；与正式键名重叠的边界情况由键编码约定规避。
const TEMP_SUFFIX = ".tmp";
const BACKUP_SUFFIX = ".bak";

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
  if (
    typeof envelope.value !== "string" ||
    typeof envelope.check !== "string"
  ) {
    throw new SaveCorruptionError("unexpected envelope shape");
  }

  if (checksum(envelope.value) !== envelope.check) {
    throw new SaveCorruptionError("checksum mismatch");
  }

  return envelope.value;
}

export function createCocosStorageAdapter(
  options: CocosStorageAdapterOptions = {},
): CocosStorageAdapter {
  // 惰性取引擎后端：仅在未注入时读取，避免构造即访问 cc.sys（同 CocosInputAdapter）。
  const backend =
    options.localStorage ?? (cc.sys as { localStorage: LocalStorageLike }).localStorage;

  async function set(key: string, value: string): Promise<void> {
    const tempKey = `${key}${TEMP_SUFFIX}`;
    const backupKey = `${key}${BACKUP_SUFFIX}`;
    const wrapped = wrap(value);

    // 临时键写入完整新值
    backend.setItem(tempKey, wrapped);

    // 校验：读回临时键确认平台完整持久化新值；不符则中断，不改动正式键
    if (backend.getItem(tempKey) !== wrapped) {
      backend.removeItem(tempKey);
      throw new SaveCorruptionError("temp write verification failed");
    }

    // 替换前保留可用备份：把当前正式值复制到备份键
    const current = backend.getItem(key);
    if (current !== null) {
      backend.setItem(backupKey, current);
    }

    // 一次性替换正式键；平台 setItem 原子写入，不产生半写入
    backend.setItem(key, wrapped);
    backend.removeItem(tempKey);
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
