# Cocos 转译 Object.assign 固化顶层 getter（speed 挡位卡 x1）

> 状态：已修复并归档（commit `a9664b3`）。本文沉淀根因、规避写法与检测方式，供后续在 Cocos Creator 3.8.8 转译运行时排查同类问题复用。

## 现象

自动战斗观战加速：点击速度按钮循环切换挡位，`cycleSpeed` 内部日志显示 `speed 1->2`、`clock.timeScale 2`，但 presenter 随后读取 `fixture.speed` 仍为 1，导致 `vm.speed` 与按钮标题始终为 x1。

关键日志证据（截取）：

```text
[debug-presenter] speed descriptor: data        # presenter 看到的 speed 是普通数据属性，不是 getter
[cycleSpeed] speed 1->2 / clock.timeScale 2     # 闭包内部状态已正确更新
```

## 根因

Cocos Creator 预览构建把源码：

```ts
return { ...base, get speed() { return speed; }, cycleSpeed, ... };
```

转译为（`temp/programming/packer-driver/targets/preview/chunks/67/674f9068309e82d18cb1d354c234f62a87089bcb.js`）：

```js
return _extends({}, base, { get speed() { return speed; }, ... });
```

其中 `_extends` 基于 `Object.assign` 实现。`Object.assign` 只读取 getter 的**当前值**并创建普通数据属性（descriptor 为 `data`），不复制 accessor descriptor；且读取发生在返回对象构造瞬间，此时 `speed` 闭包变量尚未被任何 `cycleSpeed` 修改，getter 被求值并固化为初始值 1。此后对象上的 `speed` 是静态数据，闭包内挡位再变化也不再反映到该属性上。

## 为何 Bun 测试漏检

Bun 直接执行现代对象字面量语义：`{ ...base, get speed() {...} }` 会**保留**顶层 getter 为 accessor descriptor，运行时每次读取都取最新闭包值。因此：

- Bun / 纯 TS 单测下 `fixture.speed` 行为正确、测试全绿；
- Cocos Creator 转译运行时 getter 被固化，行为不一致。

结论：**Bun 单测通过不能证明 Cocos 预览运行正确**，这是转译层行为差异，不是业务逻辑差异。

## 危险代码模式

- 同一对象字面量**顶层**同时出现对象展开 `...base`（或任意会触发 `Object.assign`/`_extends` 的组合）和动态 getter / accessor。
- 典型形态：`return { ...base, get speed() { return speed; }, ... }`。
- 嵌套对象内部的 getter（如 `battle.state` 的 `get state()`）不受该特定转换影响——`Object.assign` 只处理展开层级的可枚举自有属性，展开源对象内部的 getter 属于该对象的自有 accessor，不会被外层展开固化（但也请勿依赖此点做跨运行时语义，见预防规则）。

## 正确写法

按优先级选择：

1. **闭包方法（推荐，本仓库已采用）**：暴露 `getSpeed(): AutoBattleSpeed` 而非 `get speed()`。方法引用不会被 `Object.assign` 固化，跨 Bun / Cocos 语义一致：

    ```ts
    let speed: AutoBattleSpeed = clock.timeScale as AutoBattleSpeed;
    const cycleSpeed = (): void => {
        /* 更新 speed + clock */
    };
    // ...
    return {
        ...base,
        getSpeed: (): AutoBattleSpeed => speed, // 方法，非 accessor
        cycleSpeed,
        // ...
    };
    ```

2. **显式定义 descriptor**：先创建对象，再用 `Object.defineProperty` 定义 getter。`Object.defineProperty` 复制的是 accessor descriptor 本身，不受 `Object.assign` 固化问题影响：

    ```ts
    const fixture = { ...base, cycleSpeed };
    Object.defineProperty(fixture, "speed", { get: () => speed, enumerable: true });
    ```

**禁止**：依赖"含对象展开的对象字面量 getter"跨 Cocos 转译保持 descriptor。

## 错误排查方向（避免重蹈）

以下方向在本案中被排除，不要作为首选：

- 认为 VM 应原地修改对象 —— 问题在 descriptor 固化，不在渲染链路。
- 认为 FGUI `GButton.text` 无法更新 —— 标题不更新只是现象，根因在上游 `vm.speed` 恒为 1。
- 认为是旧缓存 / 多 fixture 实例 —— 检查过实例唯一性，排除。
- 仅靠 Bun 测试判定 Cocos 运行正确 —— 转译差异正是漏检点。

## 检测清单

排查"跨 Bun/Cocos 行为不一致"时依次执行：

1. 运行时检查 descriptor：`Object.getOwnPropertyDescriptor(obj, "speed")`。返回 `{ get, set }` 为 accessor；返回 `{ value, writable }` 即为被固化，且 `value` 是初始值。
2. 检查转译产物：在 `temp/programming/packer-driver/targets/preview/chunks/**/*.js` 中搜索 `_extends` 或 `Object.assign`，确认对象展开被转译。
3. 对照源码与转译产物：确认 getter 是否出现在 `_extends` 参数列表中被 `Object.assign` 消费。
4. 加入 Cocos 预览级冒烟验证：`?smoke=auto-battle` 在预览中人工/CI 核对按钮标题随点击变化，不能只跑 Bun 单测。

## 预防规则

- 框架 / 游戏层对外暴露**动态派生状态**（挡位、进度、选中项等）时，优先闭包方法（`getX()`）或 `Object.defineProperty`，不用"含对象展开的字面量顶层 getter"。
- 静态不变的状态才允许顶层 getter（如常量、来自不可变配置的字段）。
- 涉及 Cocos 运行时行为的修改，验证必须包含预览级冒烟，Bun 单测只作为逻辑层第一道门禁。

## 证据路径

- 修复 commit：`a9664b3 fix(auto-battle): 顶层 speed getter 改为 getSpeed() 闭包方法，规避 Cocos Object.assign 固化`（改动 `assets/samples/game_auto_battle/assembly.ts`、`smoke.ts`、`view/presenter.ts` 及对应测试）。
- 源码现状：`assets/samples/game_auto_battle/assembly.ts` 中 `getSpeed(): AutoBattleSpeed` 与 `let speed` 闭包，注释已记录取舍。
- 转译证据：`temp/programming/packer-driver/targets/preview/chunks/67/674f9068309e82d18cb1d354c234f62a87089bcb.js`。
- 运行时日志：`[debug-presenter] speed descriptor: data`（presenter 视角）、`[cycleSpeed] speed 1->2 / clock.timeScale 2`（闭包视角）。

> `temp/` 是 Cocos 生成目录，其中的转译产物**仅作为诊断证据**，禁止手改，且不在仓库提交范围内（已被 `.gitignore` 排除）。
