/**
 * 共享的 cc mock fixture。
 *
 * bun 的 mock.module 在同一进程内全局共享且首个注册生效，因此所有 mock 了 cc 的
 * 测试文件必须注册**相同且完整**的符号，避免某个文件先注册了缺符号的桩导致其它
 * 文件在全量运行时解析失败（对齐 fairygui-mock 约定）。本 fixture 覆盖 AppRoot
 * 链（game/director/_decorator/Component/profiler/sys.isNative）与 CocosDeviceInfo
 * 链（sys.os/platform/language），多出字段无妨。
 */
export function createCcMock(): Record<string, unknown> {
    return {
        game: {
            on() { },
            off() { },
        },
        director: {
            addPersistRootNode() { },
        },
        Game: {
            EVENT_HIDE: "game_hide",
            EVENT_SHOW: "game_show",
        },
        _decorator: {
            ccclass(_name: string) {
                return <TFunction extends (...args: unknown[]) => unknown>(target: TFunction): TFunction =>
                    target;
            },
        },
        Component: class { },
        Node: class {
            static EventType: Record<string, string> = {};
        },
        EventTouch: class { },
        Touch: class { },
        Vec3: class { },
        profiler: { stats: null },
        sys: { isNative: false, os: "Windows", platform: "WINDOWS", language: "en" },
    };
}
