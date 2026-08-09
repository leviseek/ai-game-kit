# ADR-022 跨 Bundle 模块注册桥（Bundle Module Bridge）

## 状态

Accepted

## 背景

bundle-split + fairygui relocation change 把 `game`/`samples` 拆分为独立 Asset Bundle、把 fairygui 迁入 `assets/framework/libs/`，并使 boot 组合根不再静态 import 任何 game 代码。跨 bundle 共享模块描述符（catalog/fixtures/smokes/list flow）需要持久运行时契约：framework 提供全局注册桥（`core/module/BundleModuleRegistry`），game/samples bundle 在脚本副作用中一次性自注册，boot 经注册桥动态取用。Task-3 spike 实证了 Cocos 打包的关键构建事实：**bundle→main 静态 import 共享同一份实现；bundle→bundle 静态 import 会把实现体重复打进两个 chunk**。这决定了跨 bundle 共享的运行时 helper 必须由 framework=main 统一承载（如 `createGameFixture` 迁入 `framework/application/GameFixture`），samples 与 game 之间的引用只能以 `import type` 形式存在（编译期擦除，不产生运行时重复）。

## 决策

### 1. register 幂等：`registerBundle` 重复登记覆盖旧描述符

bundle 重载（如热更、二次进入）会再次执行脚本副作用，`registerBundle` 必须幂等——按 bundle 名覆盖登记，避免残留上一次会话的旧描述符。实现即 `BundleModuleRegistry` 的 `Map.set` 语义，无需额外去重状态。

### 2. lookup 只能在 bundle 加载后调用

`lookupBundle` 返回的是该 bundle 已登记的描述符；bundle 未加载（脚本未执行）时返回 `undefined`。调用方（boot 组合根）必须在"加载该 bundle 之后"再 lookup，不得假定 bundle 恒已加载——不引入隐式时序耦合，缺描述符时按 `undefined` 显式降级（如 `GameModule?.createListFlow` 空值守卫）。

### 3. 哨兵资源触发 bundle 脚本执行

Cocos Asset Bundle 的脚本在包加载时执行；boot 需要触发某 bundle 脚本副作用（完成注册桥登记）时，经 `provider.load` 加载该 bundle 内一个哨兵资源：game bundle 用同名场景资源 `"game"`（无 placeholder.json），其余 bundle 用 `"placeholder"`。加载协调器按 key 缓存终态，调用幂等。

### 4. 构建事实：bundle→main 共享、bundle→bundle 重复（Task-3 spike 结论）

- 子 bundle 静态 import **main bundle**（framework）的实现：打包后共享唯一实现体，main 侧持有，子 bundle 侧仅引用。
- 两个子 bundle 之间静态 import 实现：打包后把实现体**重复打进**两个 chunk（如 `createGameFixture` 曾同时出现在 `game/index.js` 与 `samples/index.js`），是惰性 chunk 的无效膨胀。
- 推论：需要跨 bundle 运行时共享的 helper MUST 放在 framework=main 并经 framework 根入口导出；sibling bundle 之间禁止静态 import 彼此的实现值。

### 5. samples 契约边界：只能以 `import type` 引用 game 契约

samples 是独立 bundle，与 game 同属游戏层但按包隔离。samples 对 game 的引用只能是类型级（`import type`，编译期擦除）；需要运行时能力的部分（如 `createGameFixture`）由 framework=main 承载并经根入口消费。类型级引用不产生运行时依赖边，不会把 game chunk 拖入 samples 的加载路径。

## 理由

- 注册桥是 boot 无 game 静态依赖（ADR-021 决策 1 的延续）的基础设施：boot 只在运行时经桥读取，framework 作为唯一共享 bundle 承载桥与共享 helper。
- 幂等登记与"lookup 在加载后"两个约束直接来自跨 bundle 时序：重载、二次进入、加载失败都必须可自愈，不能依赖一次性假设。
- 哨兵资源机制把"触发脚本执行"收敛为宿主原语（`GameLobbyHost.loadBundle`），boot 无需知道各 bundle 内部脚本结构。
- Task-3 spike 的打包事实（共享 vs 重复）是本 change 的量化依据：把 `createGameFixture` 从 game 迁入 framework 后，samples/index.js 不再含其实现体，膨胀消除。

## 影响

- 新增跨 bundle 共享 helper 时：实现放 `assets/framework/` 内合适分层（实例化 `Application` 的装配 helper 放 `application/`），经 `framework/index.ts` 根入口导出，并同步 `public-boundary.test.ts` 的 `expectedRootExports` 白名单。
- `assets/game/fixture/GameFixture.ts` 改为薄重导出（实现迁至 `framework/application/GameFixture`），game bundle 内部与测试保持既有导入路径兼容。
- boot 的 `loadBundle` 必须经 `bundleSentinel` 映射哨兵资源（game→"game"，其余→"placeholder"），不得恒加载 placeholder。
- samples 的品类 assembly 只能经 framework 根入口取运行时 helper，不得直接 import 游戏包实现值。
