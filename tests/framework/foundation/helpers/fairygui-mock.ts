/**
 * 共享的 fairygui-cc mock fixture。
 *
 * bun 的 mock.module 在同一进程内全局共享且首个注册生效（仓库多处以实测为准），
 * 因此所有 mock 了 fairygui-cc 的测试文件必须注册相同内容，避免某个文件先注册
 * 了缺符号的桩导致其它文件在全量运行时解析失败。本 fixture 统一四类符号：
 * - GRoot：忠实模拟真实语义（inst 未 create 时抛错、create 返回实例）
 * - UIPackage：静态注册表 API 桩
 * - GComponent：可实例化容器类（name 可写）
 *
 * 测试文件只依赖本 fixture 的符号存在性与形态，不依赖具体行为；真实 GRoot/
 * UIPackage 行为由注入的接缝 mock（如 getRoot / uiPackage / createView）承载。
 */
export function createFairyGuiMock(): {
  GRoot: {
    get inst(): never;
    create(): { readonly name: string };
  };
  UIPackage: {
    addPackage(path: string): { readonly name: string; readonly path: string };
    removePackage(_name: string): void;
    createObject(_pkg: string, _res: string): null;
  };
  GComponent: new () => { name: string };
} {
  return {
    GRoot: {
      get inst(): never {
        throw new Error("Call GRoot.create first!");
      },
      create() {
        return { name: "GRoot" };
      },
    },
    UIPackage: {
      addPackage(path: string) {
        return { name: path, path };
      },
      removePackage(_name: string) {},
      createObject(_pkg: string, _res: string) {
        return null;
      },
    },
    GComponent: class {
      name = "";
    },
  };
}
