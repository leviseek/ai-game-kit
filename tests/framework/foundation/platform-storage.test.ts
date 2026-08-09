import { describe, expect, mock, test } from "bun:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// 平台存储适配器测试：mock cc 模块后动态加载适配器源文件。
// 行为断言全部经注入的 localStorage 接缝，不依赖 cc 缺省成员（同 cocos-audio-adapter 约定）。
mock.module("cc", () => ({
    sys: {
        localStorage: {
            getItem: () => null,
            setItem: () => { },
            removeItem: () => { },
        },
    },
}));

import { SaveCorruptionError } from "../../../assets/framework/core/storage/VersionedStorage";
import type { PlatformStorage } from "../../../assets/framework/contracts/platform/Platform";

const projectRoot = resolve(import.meta.dir, "../../..");
const adapterFile = resolve(
    projectRoot,
    "assets/framework/adapters/cocos/storage/CocosStorageAdapter.ts",
);

// localStorage 形状的接缝：与 cc.sys.localStorage 同构，供注入与底层检查。
interface LocalStorageLike {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

interface InspectableLocalStorage extends LocalStorageLike {
    readonly entries: () => Readonly<Record<string, string>>;
}

// 适配器契约：实现 PlatformStorage 形状，并暴露恢复默认/备份恢复路径。
interface CocosStorageAdapter extends PlatformStorage {
    restoreDefault(key: string): Promise<void>;
    restoreBackup(key: string): Promise<void>;
}

type CreateCocosStorageAdapter = (options?: {
    readonly localStorage?: LocalStorageLike;
}) => CocosStorageAdapter;

interface CocosStorageAdapterExports {
    readonly createCocosStorageAdapter: CreateCocosStorageAdapter;
}

async function loadCreateAdapter(): Promise<CreateCocosStorageAdapter> {
    const exports = (await import(
        pathToFileURL(adapterFile).href,
    )) as CocosStorageAdapterExports;

    expect(typeof exports.createCocosStorageAdapter).toBe("function");

    return exports.createCocosStorageAdapter;
}

// 适配器内部键方案（实现约定，测试据此注入损坏/检查清理）：
// 正式键即调用方传入的键；临时键/备份键附加 %tmp/%bak 后缀派生。
// 后缀以 `%` + 小写字母开头：versioned-storage 的键经 encodeURIComponent 编码，
// 其中 `%` 恒为大写 `%XX` 序列，故这些后缀不可能与任何正式键冲突。
const TEMP_SUFFIX = "%tmp";
const BACKUP_SUFFIX = "%bak";

function tempKey(key: string): string {
    return `${key}${TEMP_SUFFIX}`;
}

function backupKey(key: string): string {
    return `${key}${BACKUP_SUFFIX}`;
}

function createInspectableLocalStorage(): InspectableLocalStorage {
    const store = new Map<string, string>();

    return {
        getItem(key) {
            return store.get(key) ?? null;
        },
        setItem(key, value) {
            store.set(key, value);
        },
        removeItem(key) {
            store.delete(key);
        },
        entries() {
            return Object.fromEntries(store);
        },
    };
}

// 包装接缝：对满足条件的键在写入时抛错，模拟平台写入中断（非原子平台或配额失败）。
function createFailingBackend(
    backend: InspectableLocalStorage,
    shouldFailOnWrite: (key: string) => boolean,
): LocalStorageLike {
    return {
        getItem: (key) => backend.getItem(key),
        setItem(key, value) {
            if (shouldFailOnWrite(key)) {
                throw new Error("simulated write failure");
            }
            backend.setItem(key, value);
        },
        removeItem: (key) => backend.removeItem(key),
    };
}

describe("CocosStorageAdapter backend read/write", () => {
    test("a value written through one adapter is readable by a new adapter instance", async () => {
        const createAdapter = await loadCreateAdapter();
        const backend = createInspectableLocalStorage();
        const writer = createAdapter({ localStorage: backend });

        await writer.set("player.save", "v1");

        const reader = createAdapter({ localStorage: backend });
        expect(await reader.get("player.save")).toBe("v1");
    });

    test("a deleted key is no longer readable", async () => {
        const createAdapter = await loadCreateAdapter();
        const backend = createInspectableLocalStorage();
        const adapter = createAdapter({ localStorage: backend });

        await adapter.set("player.save", "v1");
        await adapter.delete("player.save");

        expect(await adapter.get("player.save")).toBeNull();
    });

    test("a missing key reads as null without a corruption error", async () => {
        const createAdapter = await loadCreateAdapter();
        const adapter = createAdapter({
            localStorage: createInspectableLocalStorage(),
        });

        expect(await adapter.get("player.save")).toBeNull();
    });

    test("the adapter exposes the PlatformStorage contract shape", async () => {
        const createAdapter = await loadCreateAdapter();
        const adapter = createAdapter({
            localStorage: createInspectableLocalStorage(),
        });

        // 契约形状：get/set/delete 均为返回 Promise 的方法
        expect(typeof adapter.get).toBe("function");
        expect(typeof adapter.set).toBe("function");
        expect(typeof adapter.delete).toBe("function");
        expect(adapter.get("k") instanceof Promise).toBe(true);
        expect(adapter.set("k", "v") instanceof Promise).toBe(true);
        expect(adapter.delete("k") instanceof Promise).toBe(true);

        // 类型形状：可赋值给 PlatformStorage
        const contract: PlatformStorage = adapter;
        expect(contract).toBe(adapter);
    });
});

describe("CocosStorageAdapter atomic replace and backup", () => {
    test("an interrupted write leaves the complete old value readable", async () => {
        const createAdapter = await loadCreateAdapter();
        const backend = createInspectableLocalStorage();
        const adapter = createAdapter({ localStorage: backend });

        await adapter.set("player.save", "old-value");
        expect(await adapter.get("player.save")).toBe("old-value");

        // 正式键写入时抛错，模拟替换瞬间中断；临时/备份键写入不受影响
        const failing = createAdapter({
            localStorage: createFailingBackend(
                backend,
                (key) => key === "player.save",
            ),
        });

        await expect(failing.set("player.save", "new-value")).rejects.toThrow(
            "simulated write failure",
        );

        // 中断后读取仍得到完整旧值，而不是半写入内容
        expect(await failing.get("player.save")).toBe("old-value");
    });

    test("a later successful write recovers from an earlier interrupted write", async () => {
        const createAdapter = await loadCreateAdapter();
        const backend = createInspectableLocalStorage();
        const adapter = createAdapter({ localStorage: backend });

        await adapter.set("player.save", "old-value");

        const failing = createAdapter({
            localStorage: createFailingBackend(
                backend,
                (key) => key === "player.save",
            ),
        });
        await expect(failing.set("player.save", "boom")).rejects.toThrow(
            "simulated write failure",
        );

        const healthy = createAdapter({ localStorage: backend });
        await healthy.set("player.save", "new-value");
        expect(await healthy.get("player.save")).toBe("new-value");
    });

    test("a usable backup is retained before the formal key is replaced", async () => {
        const createAdapter = await loadCreateAdapter();
        const backend = createInspectableLocalStorage();
        const adapter = createAdapter({ localStorage: backend });

        await adapter.set("player.save", "v1");
        await adapter.set("player.save", "v2");

        // 替换前保留可用备份：备份键存在且内容可用（经恢复路径可取回 v1）
        expect(backend.entries()[backupKey("player.save")]).toBeDefined();

        backend.setItem("player.save", "corrupted!");
        await expect(adapter.get("player.save")).rejects.toThrow(
            SaveCorruptionError,
        );
        await adapter.restoreBackup("player.save");
        expect(await adapter.get("player.save")).toBe("v1");
    });

    test("recovery removes the backup and temp keys", async () => {
        const createAdapter = await loadCreateAdapter();
        const backend = createInspectableLocalStorage();
        const adapter = createAdapter({ localStorage: backend });

        await adapter.set("player.save", "v1");
        await adapter.set("player.save", "v2");
        expect(backend.entries()[backupKey("player.save")]).toBeDefined();

        await adapter.restoreDefault("player.save");

        expect(await adapter.get("player.save")).toBeNull();
        expect(backend.entries()[backupKey("player.save")]).toBeUndefined();
        expect(backend.entries()[tempKey("player.save")]).toBeUndefined();
    });
});

describe("CocosStorageAdapter corruption recovery", () => {
    test("a corrupted record is reported as a typed, diagnosable error", async () => {
        const createAdapter = await loadCreateAdapter();
        const backend = createInspectableLocalStorage();
        const adapter = createAdapter({ localStorage: backend });

        await adapter.set("player.save", "valid");

        // 平台后端被外部写入损坏数据（模拟非原子写入或篡改）
        backend.setItem("player.save", "not-an-envelope{{");

        await expect(adapter.get("player.save")).rejects.toThrow(
            SaveCorruptionError,
        );
    });

    test("restore default affects only the corrupted key", async () => {
        const createAdapter = await loadCreateAdapter();
        const backend = createInspectableLocalStorage();
        const adapter = createAdapter({ localStorage: backend });

        await adapter.set("player.save", "v1");
        await adapter.set("inventory.save", "items");

        backend.setItem("player.save", "corrupted!");
        await expect(adapter.get("player.save")).rejects.toThrow(
            SaveCorruptionError,
        );

        await adapter.restoreDefault("player.save");

        // 损坏键回到"不存在"，其它键不受影响
        expect(await adapter.get("player.save")).toBeNull();
        expect(await adapter.get("inventory.save")).toBe("items");
        expect(backend.entries()[backupKey("player.save")]).toBeUndefined();
    });

    test("the backup restore path recovers previously valid content", async () => {
        const createAdapter = await loadCreateAdapter();
        const backend = createInspectableLocalStorage();
        const adapter = createAdapter({ localStorage: backend });

        await adapter.set("player.save", "v1");
        await adapter.set("player.save", "v2");
        backend.setItem("player.save", "corrupted!");

        await expect(adapter.get("player.save")).rejects.toThrow(
            SaveCorruptionError,
        );

        await adapter.restoreBackup("player.save");

        expect(await adapter.get("player.save")).toBe("v1");
        // 恢复后清理备份键
        expect(backend.entries()[backupKey("player.save")]).toBeUndefined();
        expect(backend.entries()[tempKey("player.save")]).toBeUndefined();
    });

    test("restore backup with no usable backup is a diagnosable failure", async () => {
        const createAdapter = await loadCreateAdapter();
        const backend = createInspectableLocalStorage();
        const adapter = createAdapter({ localStorage: backend });

        // 首次写入无旧值，备份键不存在
        await adapter.set("player.save", "only");
        backend.setItem("player.save", "corrupted!");

        await expect(adapter.restoreBackup("player.save")).rejects.toThrow(
            SaveCorruptionError,
        );
    });

    test("keys ending with the temp/backup suffix do not collide with helper keys", async () => {
        const createAdapter = await loadCreateAdapter();
        const backend = createInspectableLocalStorage();
        const adapter = createAdapter({ localStorage: backend });

        // 若临时键/备份键用普通后缀（如 .tmp/.bak），会与以该后缀结尾的正式键
        // 冲突导致互相覆盖。当前实现用 %tmp/%bak 派生，二者互不干扰。
        await adapter.set("player.x.tmp", "A");
        await adapter.set("player.x", "B");

        expect(await adapter.get("player.x.tmp")).toBe("A");
        expect(await adapter.get("player.x")).toBe("B");

        await adapter.set("player.y.bak", "C");
        expect(await adapter.get("player.y.bak")).toBe("C");
    });

    test("a same-value rewrite does not create a backup for that value", async () => {
        const createAdapter = await loadCreateAdapter();
        const backend = createInspectableLocalStorage();
        const adapter = createAdapter({ localStorage: backend });

        // 首次写入后同值重复写：不发生替换，不创建备份（备份依赖跨值写入历史）
        await adapter.set("player.save", "v1");
        await adapter.set("player.save", "v1");
        expect(backend.entries()[backupKey("player.save")]).toBeUndefined();

        // 损坏正式键后无备份可恢复，以可诊断错误呈现
        backend.setItem("player.save", "corrupted!");
        await expect(adapter.restoreBackup("player.save")).rejects.toThrow(
            SaveCorruptionError,
        );

        // 跨值写入后备份才存在，损坏后可恢复
        await adapter.set("player.save", "v2");
        await adapter.set("player.save", "v3");
        backend.setItem("player.save", "corrupted!");
        await adapter.restoreBackup("player.save");
        expect(await adapter.get("player.save")).toBe("v2");
    });
});
