/**
 * 共享的 fairygui-cc mock fixture。
 *
 * bun 的 mock.module 在同一进程内全局共享且首个注册生效（仓库多处以实测为准），
 * 因此所有 mock 了 fairygui-cc 的测试文件必须注册相同内容，避免某个文件先注册
 * 了缺符号的桩导致其它文件在全量运行时解析失败。本 fixture 统一符号：
 * - GRoot：忠实模拟真实语义（inst 未 create 时抛错、create 返回实例）
 * - UIPackage：静态注册表 API 桩
 * - GComponent：可实例化容器类（name/setSize/touchable/opaque 可写，对齐 4.2 遮罩语义）
 * - GGraph：可实例化图形类（对齐 GRoot._modalLayer 模式，记录 drawRect 的填充色）
 * - UIConfig：提供 modalLayerColor（半透明黑），遮罩可见性来源于此
 *
 * 测试文件只依赖本 fixture 的符号存在性与形态，不依赖具体行为；真实 GRoot/
 * UIPackage 行为由注入的接缝 mock（如 getRoot / uiPackage / createView / createMask）承载。
 */
export function createFairyGuiMock(): {
  GRoot: {
    get inst(): never;
    create(): FairyGuiGRootMock;
  };
  UIPackage: {
    addPackage(path: string): { readonly name: string; readonly path: string };
    removePackage(_name: string): void;
    createObject(_pkg: string, _res: string): null;
  };
  GComponent: new () => FairyGuiGComponentMock;
  GGraph: new () => FairyGuiGGraphMock;
  UIConfig: {
    modalLayerColor: FairyGuiColorMock;
  };
  Event: {
    CLICK: string;
    TOUCH_BEGIN: string;
    TOUCH_END: string;
  };
} {
  return {
    GRoot: {
      get inst(): never {
        throw new Error("Call GRoot.create first!");
      },
      create() {
        // 对齐 GRootLike 容器形状：页面适配器 init 会经 root.addChild 建立七层容器，
        // 且把 addChild 返回值作为该层容器持有（真实 GRoot.addChild 返回 GComponent）。
        // 此处返回具备容器能力的 GComponent mock，使七层容器可被容器级调用消费。
        let rootWidth = 1280;
        let rootHeight = 720;
        const rootChildren: unknown[] = [];
        return {
          name: "GRoot",
          get width() {
            return rootWidth;
          },
          get height() {
            return rootHeight;
          },
          setSize(width: number, height: number) {
            rootWidth = width;
            rootHeight = height;
          },
          addChild(child: unknown) {
            rootChildren.push(child);
            const name = (child as { name?: string } | undefined)?.name ?? "container";
            const children: unknown[] = [];
            return {
              name,
              width: 1280,
              height: 720,
              addChild(c: unknown) {
                children.push(c);
                return c;
              },
              removeChild(c: unknown, _dispose = false) {
                const index = children.indexOf(c);
                if (index >= 0) children.splice(index, 1);
                return c;
              },
              removeChildren() {
                children.length = 0;
              },
              getChildAt(index: number) {
                return children[index];
              },
              get numChildren() {
                return children.length;
              },
            };
          },
          removeChild(child: unknown) {
            const index = rootChildren.indexOf(child);
            if (index >= 0) rootChildren.splice(index, 1);
            return child;
          },
          removeChildren() {
            rootChildren.length = 0;
          },
          getChildAt(index: number) {
            return rootChildren[index];
          },
          get numChildren() {
            return rootChildren.length;
          },
        };
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
      width = 0;
      height = 0;
      touchable = false;
      opaque = false;
      node = {
        activeInHierarchy: true,
        on() {},
        off() {},
        emit() {},
      };
      setSize(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
      on(_type: string, _callback: () => void, _target?: unknown) {}
      off(_type: string, _callback: () => void, _target?: unknown) {}
      addChild(_child: unknown): unknown {
        return _child;
      }
      removeChild(_child: unknown): unknown {
        return _child;
      }
      removeChildren() {}
    },
    GGraph: class {
      name = "";
      width = 0;
      height = 0;
      touchable = false;
      opaque = false;
      lineSize = 0;
      lineColor: FairyGuiColorMock | undefined;
      fillColor: FairyGuiColorMock | undefined;
      setSize(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
      drawRect(lineSize: number, lineColor: FairyGuiColorMock, fillColor: FairyGuiColorMock) {
        this.lineSize = lineSize;
        this.lineColor = lineColor;
        this.fillColor = fillColor;
      }
    },
    UIConfig: {
      modalLayerColor: { r: 0x33, g: 0x33, b: 0x33, a: 0x33 },
    },
    Event: {
      CLICK: "fui_click",
      TOUCH_BEGIN: "fui_touch_begin",
      TOUCH_END: "fui_touch_end",
    },
  };
}

export interface FairyGuiGComponentMock {
  name: string;
  width: number;
  height: number;
  touchable: boolean;
  opaque: boolean;
  node: {
    activeInHierarchy: boolean;
    on(type: string, callback: () => void, target?: unknown): void;
    off(type: string, callback: () => void, target?: unknown): void;
    emit(type: string, arg?: unknown): void;
  };
  setSize(width: number, height: number): void;
  on(type: string, callback: () => void, target?: unknown): void;
  off(type: string, callback: () => void, target?: unknown): void;
  addChild(child: unknown): unknown;
  removeChild(child: unknown): unknown;
  removeChildren(): void;
}

export interface FairyGuiColorMock {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface FairyGuiGGraphMock {
  name: string;
  width: number;
  height: number;
  touchable: boolean;
  opaque: boolean;
  lineSize: number;
  lineColor?: FairyGuiColorMock;
  fillColor?: FairyGuiColorMock;
  setSize(width: number, height: number): void;
  drawRect(
    lineSize: number,
    lineColor: FairyGuiColorMock,
    fillColor: FairyGuiColorMock,
  ): void;
}

export interface FairyGuiGRootMock {
  name: string;
  readonly width: number;
  readonly height: number;
  setSize(width: number, height: number): void;
  addChild(child: unknown): unknown;
  removeChild(child: unknown, dispose?: boolean): unknown;
  removeChildren(beginIndex?: number, endIndex?: number, dispose?: boolean): void;
  getChildAt(index: number): unknown;
  readonly numChildren: number;
}
