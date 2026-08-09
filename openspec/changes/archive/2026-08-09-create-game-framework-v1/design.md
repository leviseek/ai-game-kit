## Context

工程当前是 Cocos Creator 3.8.8、strict TypeScript 的空白 2D 项目，只有 `startup.scene` 和 `boot`、`framework`、`game`、`resources` 四个资源目录。没有历史业务代码或兼容包袱，FairyGUI Runtime 尚未引入，因此可以在任何游戏页面产生之前固定单一 UI 技术栈和依赖边界。

五类目标游戏共享启动、资源、UI、音频、输入、配置、存档、时间和平台适配等基础问题，但它们的核心业务模型差异很大：RPG 偏角色与世界状态，卡牌偏确定性回合，挂机依赖离线时间，经营依赖生产调度，格斗依赖低延迟输入和逐帧模拟。框架必须复用基础设施，同时拒绝把这些业务强行统一成一个继承体系。

游戏 UI 统一使用 FairyGUI。Framework UI Layer 负责导航、分层和生命周期，FairyGUI Adapter 负责渲染技术集成，Game 逻辑与 FairyGUI View 之间通过 ViewModel 隔离。Cocos 原生 UI 只承担启动宿主和必要的引擎集成，不作为页面、弹窗、HUD 或业务组件方案。

本 change 按用户要求只形成 proposal、design 和 tasks，`skip_specs: true` 表示不在本 change 中创建行为 delta specs。后续实施具体能力前，应为对应能力建立独立 OpenSpec change 和可验收行为规格。

## Goals / Non-Goals

**Goals:**

- 建立稳定、可解释、可测试的依赖方向，使框架基础设施与游戏规则独立演进。
- 通过轻量内核和可选模块组合支持五类游戏，而不是让所有项目承担全部系统和初始化成本。
- 为 Cocos 场景、节点、资源和生命周期提供适配边界，使大部分规则逻辑不依赖 `cc`。
- 明确模块初始化、失败回滚、暂停恢复、资源释放和应用关闭顺序。
- 建立 Framework UI Layer、FairyGUI Adapter 和 ViewModel 三层边界，使导航规则、渲染实现和游戏状态可以独立测试与替换。
- 为 Asset Bundle、FairyGUI package、View、输入、时间和存档等跨品类高频问题建立一致的所有权模型。
- 建立可执行的测试分层和五类组合验证，证明“可支持”而不仅是目录命名上的声明。

**Non-Goals:**

- 不设计统一的角色、属性、技能、卡牌、Buff、掉落、任务、经济、生产或关卡数据模型。
- 除 FairyGUI Runtime 及其官方资源导出流程外，不在 v1 引入 ECS、反射式 IoC 容器、装饰器扫描、框架级代码生成或其他第三方架构框架。
- 不使用 Cocos 原生 UI 实现游戏页面、弹窗、HUD 或可复用业务组件；原生 Canvas/Node 只允许作为启动和 FairyGUI 宿主。
- 不实现反射式、自动双向绑定的通用 MVVM 框架；ViewModel 使用显式状态、命令和订阅生命周期。
- 不处理联网同步、服务端权威、热更新、Mod、编辑器插件和跨项目 npm 发布。
- 不承诺确定性网络回放；v1 只提供可替换时钟、输入动作和模拟步进边界。
- 不为未知性能问题预先池化所有对象或缓存所有资源。

## Decisions

### 1. 采用轻量内核、可选能力模块和游戏组合清单

**决定：** 框架只规定模块协议、生命周期、服务契约和组合方式。资源、UI、音频、输入、存档等作为可选能力模块；具体项目通过显式组合清单选择模块，并在 `game` 层补充品类能力。

**理由：** 五类游戏的稳定交集是基础设施，不是业务对象。显式组合既能复用通用能力，也能避免卡牌项目加载格斗输入缓冲、挂机项目依赖 RPG 世界模型。

**未采用方案：** 不采用“包含所有功能的 GameFramework 基类”，因为它会产生空实现、条件分支和隐式耦合；不采用独立插件/npm 包优先，因为当前单工程没有版本治理收益，却会增加构建和调试成本。

**结果：** v1 必须验证模块可独立启停、依赖缺失能及早报错，并为五类游戏各提供一份组合样例或测试夹具。

### 2. 固定单向分层和依赖规则

**决定：** 使用以下逻辑层次：

```text
boot/composition
        ↓
game/features ───────→ game/presentation/viewmodels
        ↓                         ↓
framework/contracts ←── framework/ui-layer
        ↑                         ↓
framework/application      framework/fairygui-adapter ─→ FairyGUI Runtime
        ↓                         ↓
framework/core       framework/cocos-adapters ─────────→ cc
```

- `core` 是纯 TypeScript，不导入 `cc`。
- `contracts` 暴露稳定接口和数据边界，不了解具体游戏。
- `ui-layer` 提供不依赖 FairyGUI 或 Cocos 原生 UI 的导航、分层和 View 生命周期契约。
- `fairygui-adapter` 封装 FairyGUI package、`GRoot`、`GComponent`、事件与 View 实例，不向 Game 逻辑泄漏 FairyGUI 类型。
- `cocos-adapters` 封装场景、节点宿主、Asset Bundle、音频、游戏输入和平台生命周期。
- `game/presentation/viewmodels` 把 Game 状态和命令转换为 UI 可消费的稳定模型，不导入 `fgui` 或 `cc`。
- `application` 负责模块装配与生命周期编排。
- `game` 可以依赖框架契约，框架不得导入 `game`。
- `boot` 是组合根，允许同时了解框架模块和游戏入口，但不承载业务规则。

**理由：** 将 Cocos 与 FairyGUI 都隔离到适配层后，回合规则、离线收益计算、经营调度、ViewModel 和 UI 导航可以脱离编辑器测试；组合根是唯一允许“知道所有具体实现”的位置，可防止依赖反转失效。

**未采用方案：** 不按 `manager/model/view/utils` 做横向目录，因为这种结构会让一个功能散落在全工程；不让 Game 直接依赖 FairyGUI；也不要求所有代码都无引擎依赖，因为 FairyGUI Adapter、资源和节点宿主天然需要运行时 API。

**结果：** 通过 lint/依赖检查或最小化的架构测试防止 `core` 导入 `cc`/`fgui`、`framework` 导入 `game`、ViewModel 导入 UI 运行时类型以及跨模块深层导入。

### 3. 只保留一个应用根并使用显式生命周期状态机

**决定：** `startup.scene` 只承载一个 `AppRoot` 组合入口。应用按 `created -> initializing -> running -> paused -> stopping -> disposed` 状态流转；模块按依赖拓扑顺序初始化和启动，按逆序停止和释放。重复调用必须安全，非法状态转换必须报错。

**理由：** Cocos 项目常见的多个常驻 Manager 会竞争初始化顺序并在换场景后留下重复节点。单一应用根让启动、暂停恢复、异常回滚和测试装配都有确定入口。

**未采用方案：** 不让每个服务自行调用 `director.addPersistRootNode`；不依赖脚本组件 `onLoad` 的隐式先后顺序完成跨模块初始化。

**结果：** 必需模块初始化失败时，应用停止启动并逆序清理已成功模块；可选模块失败时可以按声明降级，但必须记录结构化错误。

### 4. 使用小型类型化服务注册表，不引入通用 IoC 容器

**决定：** 组合根显式创建模块；模块通过类型化 token 注册服务，通过 `ApplicationContext` 获取其声明依赖。Cocos Component 不进行构造函数注入，而由 `AppRoot` 或所属控制器在绑定阶段注入上下文。

**理由：** 显式注册足以支持替换适配器和测试替身，同时能直接看到依赖图。Cocos 组件由引擎实例化，强行构造函数注入会与序列化生命周期冲突。

**未采用方案：** 不使用反射、装饰器扫描和自动单例，因为它们隐藏依赖、增加启动魔法，并使循环依赖只能在运行时暴露。

**结果：** 注册重复、token 缺失和依赖循环必须在应用进入 `running` 前失败；业务对象不允许把服务注册表保存为随处查询的全局 Service Locator。

### 5. 模块内优先直接调用，跨模块使用契约和类型化事件

**决定：** 同一模块内使用普通函数或对象调用；需要返回值的跨模块交互依赖服务契约；一对多的事实通知使用类型化事件。事件通道按应用或功能作用域创建，订阅返回可释放句柄，模块停止时统一取消。

**理由：** 直接调用最易追踪，服务接口适合请求/响应，事件适合解耦通知。三者分工可以避免所有交互都变成无法追踪的广播。

**未采用方案：** 不提供全局字符串 EventBus，不用事件模拟查询，也不让 FairyGUI View 直接监听任意底层 Cocos 节点或 Game 领域事件作为业务协议。

**结果：** 事件名称和载荷必须有 TypeScript 类型；事件处理失败由发布边界收集并记录，不能中断其他订阅者或被静默吞掉。

### 6. Asset Bundle 与 FairyGUI package 共享资源作用域

**决定：** `resources` 仅保留启动所需的最小配置或诊断资源。通用资源、FairyGUI package、音频和具体游戏内容放入独立 Asset Bundle。资源系统同时管理 Bundle handle 与 FairyGUI package handle，并执行固定顺序：加载 Bundle 及依赖资源、注册 FairyGUI package、创建 View；释放时先销毁 View，再卸载 package，最后在无其他所有者时释放 Bundle。

UI Bundle 需要提供显式清单，描述 Bundle 标识、FairyGUI package ID/名称、依赖 package、入口组件和版本。页面、场景或功能作用域持有 handle；并发请求共享加载结果，package 只有在所有 View 和依赖作用域释放后才能从 FairyGUI 全局注册表移除。

**理由：** FairyGUI package 不是普通单文件资源，它包含描述文件、图集、字体、声音和跨 package 引用。若 Bundle 与 package 各自管理生命周期，容易出现 Bundle 已卸载但 `GComponent` 仍在使用纹理，或 package 全局注册残留导致同名冲突。

**未采用方案：** 不把 FairyGUI 导出内容全部放入 `resources`；不允许页面自行调用 FairyGUI package 加载/移除 API；不只封装一个 `load(path)`，因为它无法表达 Bundle、package、View 和依赖 package 的所有权关系。

**结果：** 资源模块必须覆盖加载、预加载、取消、失败重试、并发去重、package 依赖排序、重复 ID/名称冲突、作用域释放和 Bundle 卸载判断。不得释放仍被 FairyGUI View 或其他 Cocos Asset 使用的底层资源。

### 7. 游戏 UI 固定为 Framework UI Layer + FairyGUI Adapter

**决定：** Framework UI Layer 不依赖 `cc` 或 `fgui`，负责 route、页面栈、层级、模态、焦点、返回策略、加载状态和页面作用域。FairyGUI Adapter 实现 View 创建、挂载、卸载、转场和销毁，并将框架层级映射到 `GRoot` 下的 `scene/normal/popup/guide/toast/loading/system` 容器。

Cocos 场景只提供 `AppRoot`、FairyGUI 运行时宿主和必要相机/渲染环境。业务页面、弹窗、HUD 和通用控件全部由 FairyGUI Editor 制作并通过 FairyGUI Runtime 呈现，禁止使用 Cocos `Widget`、`Button`、`Label`、`Sprite` 等原生 UI 组件另建第二套游戏 UI。

**理由：** Framework UI Layer 保持导航和生命周期可测试，FairyGUI Adapter 集中处理第三方 API 与导出资源差异。固定单一游戏 UI 栈可以避免层级、输入、适配、资源和页面规范在两套系统之间分裂。

**未采用方案：** 不让 UI Layer 直接返回 `GComponent`；不让每个业务模块自行管理 `GRoot`；不保留“简单页面用 Cocos UI、复杂页面用 FairyGUI”的双轨策略。启动失败时只允许最小诊断宿主，不构建原生 UI 业务回退页面。

**结果：** Game 和 Framework UI Layer 只能依赖 View/route/层级契约，FairyGUI 类型限制在 Adapter 和具体 View 内。FairyGUI Runtime 版本必须固定并记录与 Cocos Creator 3.8.8 的兼容矩阵。页面关闭必须按顺序解除绑定、移除 View、释放 package handle 和页面资源作用域。

### 8. 使用 ViewModel 隔离 FairyGUI View 与 Game 逻辑

**决定：** 每个业务 UI route 由组合根或页面工厂创建 ViewModel 与 FairyGUI View。ViewModel 位于 Game presentation 边界，只暴露只读展示状态、显式命令和可释放订阅，不导入 `fgui`、`cc`、具体 `GComponent` 或页面类。FairyGUI View 只负责组件查找、渲染、动画和输入事件转发。

数据流固定为：

```text
FairyGUI 输入
  → View 转换为意图
  → ViewModel 命令
  → Game use case/domain
  → ViewModel 生成新展示状态
  → View 单向渲染
```

**理由：** ViewModel 将 Game 数据转换为 UI 友好格式，使业务规则和页面渲染可以分别单测。显式单向数据流比自动双向绑定更容易定位状态来源，也能防止 FairyGUI 事件直接修改领域对象。

**未采用方案：** 不让 Game service 返回 FairyGUI 对象；不让 View 直接访问存档、资源或领域仓库；不引入反射式 MVVM、字符串属性路径和隐式双向绑定；不把 ViewModel 扩展为包含导航、资源加载和所有业务规则的万能 Presenter。

**结果：** Framework UI Layer 管理 View/ViewModel 的创建和释放顺序；ViewModel 订阅必须随页面作用域释放。导航由 ViewModel 发出类型化意图或调用导航契约，不能直接操作 `GRoot`。

### 9. 将时间划分为墙上时间、单调时间和模拟时间

**决定：** 时间模块至少区分：用于存档时间戳和离线计算的 wall clock、用于超时和耗时测量的 monotonic clock、受暂停和倍率控制的 simulation clock。调度器显式绑定某个时钟，游戏规则不得直接散落调用系统时间。

**理由：** 回合制关注可控推进，挂机需要离线时间，经营需要调度，格斗需要稳定模拟步进；单一 `Date.now()` 或 Cocos `deltaTime` 无法正确覆盖这些语义。

**未采用方案：** 不在 v1 承诺服务端可信时间或跨设备防作弊；不把所有计时器都绑定 Cocos Component 的 `schedule`。

**结果：** 暂停只影响声明使用 simulation clock 的任务；离线收益公式属于 `game` 层，框架只提供可测试的时间来源与时间跨度。

### 10. 区分 FairyGUI UI 输入与游戏动作输入

**决定：** FairyGUI View 通过 FairyGUI 事件系统接收 UI 点击、拖拽、滚动、焦点和键盘导航，并将用户意图转发给 ViewModel。Cocos 游戏输入适配器只负责把触摸、鼠标、键盘和手柄转换为类型化 gameplay action。Framework UI Layer 统一控制模态、焦点和 UI 输入阻断，防止同一次输入穿透到玩法上下文。

**理由：** FairyGUI 已提供成熟的 UI 命中、焦点和手势语义，而格斗等玩法需要独立、带时间戳的动作输入。明确分流能复用 FairyGUI 能力，同时保留可测试的玩法输入和统一的 UI/玩法上下文切换。

**未采用方案：** 不让玩法代码直接散落监听 `input` 全局对象；不让 View 绕过 ViewModel 直接调用 Game service；不把 FairyGUI UI 事件重新包装成所有业务都必须使用的全局输入总线；不在通用层定义“攻击”“出牌”等固定业务动作。

**结果：** 具体项目定义 gameplay action 标识；UI route 激活时声明其输入阻断策略；横板格斗的输入缓冲、优先级、招式识别和回放属于后续游戏模块。

### 11. 配置与存档使用版本化、引擎无关的数据边界

**决定：** 静态配置和玩家存档分开管理。存档只包含可序列化 DTO，带 schema version，并通过迁移链升级；底层持久化由平台适配器提供。写入采用临时值/校验/替换或平台可提供的等价原子策略。

**理由：** 配置随版本发布，存档随玩家变化，两者生命周期和错误处理不同。版本化 DTO 可以支持 RPG 长期档案、挂机离线数据和经营状态演进，而不会把 Node、Component 或 Asset 写入存档。

**未采用方案：** 不直接序列化运行时对象图，不允许任意模块使用本地存储键，也不把云存档或加密伪装成 v1 本地存档能力。

**结果：** 每个存档域拥有命名空间和迁移责任；损坏存档必须产生可诊断错误，并由游戏策略决定恢复默认、选择备份或中止进入。

### 12. 平台差异通过窄适配接口隔离

**决定：** 平台层只抽象已经存在替换需求的能力，例如应用前后台、存储、设备信息、时钟和输入来源。Web、原生或小游戏平台实现适配器，核心与游戏规则不直接调用平台全局 API。

**理由：** 目标发布平台尚未锁定，窄接口能隔离 Cocos 和平台差异，同时避免设计一个包含所有渠道 SDK 的超大 PlatformManager。

**未采用方案：** 不为未确定的支付、广告、账号、分享预建空接口；这些属于后续平台能力 change。

**结果：** v1 先提供当前开发平台所需实现和内存测试替身；新增平台能力时扩展独立契约，而不是扩大基础接口。

### 13. 错误按生命周期和可恢复性分类

**决定：** 错误至少区分配置/编程错误、初始化失败、可重试 IO 失败、用户数据损坏和可选能力不可用。生命周期边界负责捕获、补充上下文、回滚并上报；底层模块不静默吞错。只在调用者确实需要分支处理时返回显式结果，否则抛出带 cause 的类型化错误。

**理由：** 全部抛异常会让预期失败难以处理，全部返回 Result 又会污染简单内部调用。以边界和可恢复性决定策略更符合游戏启动与资源加载流程。

**未采用方案：** 不使用空 `catch`、布尔成功标志或只打印字符串日志；也不因一个可选音频模块失败就必然终止整个应用。

**结果：** 诊断记录包含模块、阶段、资源/场景、UI route、FairyGUI package 和 ViewModel 标识及 cause，但不得写入凭据或完整玩家隐私数据。

### 14. 状态机、对象池和调度器是可选工具，不是业务总模型

**决定：** 提供纯 TypeScript 的有限状态机、调度器和通用池协议，但由具体功能自行实例化和拥有。只有经过性能数据证明的高频对象才接入池。

**理由：** 五类游戏都会用到这些工具，但状态图、对象重置和调度语义属于使用方。保持工具小而无业务含义，才能避免框架演变成万能基类。

**未采用方案：** 不提供全局状态机、不把所有 Node 自动池化，也不采用 ECS 作为 v1 核心。

**结果：** 池化对象必须有明确 reset/dispose 契约；状态机必须显式拒绝非法转换；调度任务必须随所属作用域释放。

### 15. 公开 API 采用最小导出面并限制深层导入

**决定：** 每个能力模块通过公开入口导出契约和稳定类型，内部实现默认不导出。跨模块只能依赖公开入口；破坏性公共接口调整需要独立 change 和迁移说明。

**理由：** 即使框架暂时只在本仓库使用，任意深层导入也会快速固化内部目录，使后续重构困难。

**未采用方案：** 不建立一个导出所有实现的巨型 barrel，也不在 v1 承诺独立 npm 包的语义化版本发布。

**结果：** 测试可以通过公开契约或同模块测试入口访问；其他模块不能依赖内部具体类。FairyGUI Runtime 类型不得从 Framework UI Layer 或 ViewModel 公共入口导出，只能出现在 FairyGUI Adapter 和具体 View 的实现边界。

### 16. 以分层测试和五类组合证明架构成立

**决定：** 测试分为四层：纯 TypeScript 内核与 ViewModel 单元测试、Framework UI Layer 契约测试、FairyGUI Adapter/package 集成测试、Cocos 启动场景冒烟测试。另建立五类组合验证，只装配该品类需要的模块并运行最小生命周期与一个代表性 FairyGUI route。

**理由：** 只测试某个 RPG 示例无法证明框架没有品类偏置；只依赖 FairyGUI Editor 或 Cocos 编辑器手测又无法稳定验证 ViewModel 隔离、package 生命周期、初始化顺序、暂停恢复和失败回滚。

**未采用方案：** 不要求所有测试启动 Cocos，也不以完整示例游戏作为 v1 验收条件。

**结果：** 五类组合关注基础设施适配点：

| 品类 | v1 重点验证 | 明确留在游戏层 |
|---|---|---|
| RPG | 跨场景状态、FairyGUI route、ViewModel、资源作用域与存档组合 | 角色、技能、任务、战斗 |
| 回合制卡牌 | 可控时间、状态机、配置、ViewModel 与 FairyGUI 组合 | 卡组、回合、效果结算 |
| 放置挂机 | wall clock、暂停恢复、版本化存档、ViewModel 与 FairyGUI route | 离线收益和成长公式 |
| 模拟经营 | 调度器、配置、存档、复杂 FairyGUI 分层与 ViewModel | 生产链和经济模型 |
| 横板格斗 | gameplay action、FairyGUI HUD、模拟时钟、池和音频组合 | 判定盒、连招、帧数据 |

### 17. 使用 Bun 验证纯 TypeScript，使用 Cocos Web Desktop 验证引擎集成

**决定：** 纯 TypeScript 内核、Framework UI Layer、ViewModel、契约和测试替身使用 Bun 的测试与脚本能力；依赖 `cc` 或 FairyGUI Runtime 的适配器通过 Cocos Creator 3.8.8 的类型检查和 Web Desktop 构建/预览冒烟验证。原生和小游戏平台在对应适配器 change 中追加构建矩阵。

**理由：** Bun 符合项目开发者的既有工作流且无需增加运行时依赖，适合快速验证无引擎逻辑；Cocos 集成不能仅凭通用 TypeScript 工具证明，Web Desktop 是当前成本最低、可重复的引擎验证目标。

**未采用方案：** 不让所有单元测试启动 Cocos Editor；也不在 v1 同时维护 Web、原生和多个小游戏平台的完整构建矩阵。

**结果：** 质量门禁必须分别报告纯 TypeScript/ViewModel 测试、严格类型检查、FairyGUI package/Adapter 集成测试和 Cocos Web Desktop 结果，任何一项不能替代另一项。

## Risks / Trade-offs

- **[抽象早于真实需求]** → 每个通用能力必须由至少两个品类场景证明；无法证明复用价值的逻辑留在 `game`。
- **[模块化增加装配复杂度]** → 使用显式清单、依赖拓扑检查和少量预设组合，不引入自动扫描。
- **[服务注册表退化为全局 Service Locator]** → 只向模块初始化边界传递上下文，业务对象显式接收所需契约。
- **[事件系统隐藏控制流]** → 模块内优先直接调用，查询必须走服务接口，事件仅表达已发生事实。
- **[Bundle、FairyGUI package 与 View 生命周期不一致]** → 以页面/场景作用域为主、引用计数为辅，固定 View → package → Bundle 的逆序释放，并用集成测试覆盖跨 package 依赖。
- **[FairyGUI Runtime 与 Cocos Creator/目标平台不兼容]** → 固定版本，建立 Web Desktop 最小兼容矩阵；升级 FairyGUI 或 Cocos 时作为独立 change 验证，不进行隐式漂移。
- **[FairyGUI package ID 或名称冲突]** → 由资源清单在注册前校验唯一性，禁止页面自行注册 package。
- **[ViewModel 变成新的万能层]** → ViewModel 只负责展示状态转换和 UI 命令，领域规则留在 use case/domain，导航和资源生命周期留在 Framework UI Layer。
- **[FairyGUI 与 gameplay action 双输入通道产生穿透]** → Framework UI Layer 统一模态、焦点和阻断策略，并以同一帧输入测试验证不会双重响应。
- **[开发者重新引入 Cocos 原生业务 UI]** → 架构检查扫描游戏 UI 目录和公开依赖，禁止业务模块引用 Cocos UI 组件；只对白名单启动宿主开放。
- **[strict TypeScript 与 Cocos/FairyGUI 导出类型存在摩擦]** → 在 Adapter 和具体 View 内集中处理可空引用与生成绑定，核心、UI Layer 和 ViewModel 不放宽类型规则。
- **[格斗性能或确定性需求超出通用时钟]** → v1 只固定替换边界；逐帧战斗内核通过后续 change 单独设计。
- **[挂机时间被本地时钟篡改]** → v1 明确不提供可信时间；联网校时和防作弊属于后续平台/网络能力。
- **[一次实施范围过大]** → 按任务阶段逐项交付，每阶段都保持 `startup.scene` 可运行，并允许尚未实现的可选模块不参与装配。

## Migration Plan

1. 先建立目录、公开边界检查和纯 TypeScript 测试基线，不改变现有场景行为。
2. 引入应用生命周期、模块图、服务注册表和诊断模块，使空应用可以完整启动与释放。
3. 将 `startup.scene` 接入单一 `AppRoot` 和 FairyGUI 运行时宿主；初始化失败时只保留最小日志/诊断入口，不创建 Cocos 原生业务 UI 回退页面。
4. 先加入 Asset Bundle、FairyGUI package 清单和作用域资源机制，验证 package 依赖、注册和逆序释放，再允许创建第一个 FairyGUI View。
5. 建立 Framework UI Layer、FairyGUI Adapter 和 ViewModel 测试夹具，然后依次加入场景、音频、输入、配置/存档等可选模块。
6. 建立五类组合夹具和 Cocos/FairyGUI 冒烟场景，确认 Game 不依赖 FairyGUI 类型、框架不反向依赖具体游戏、业务 UI 不使用 Cocos 原生组件。
7. 最后收紧公开导出、FairyGUI Runtime 版本和 UI Bundle 目录规则，并记录后续能力 change 列表。

回滚以阶段为单位：在 FairyGUI 资源或 Adapter 未通过门禁时，从组合清单移除 UI 模块并保留无业务 UI 的启动诊断状态，而不是切换回 Cocos 原生 UI；其他可选能力同样通过移除模块回退。应用内核、现有 `.meta` UUID、Creator 版本和生成目录不做破坏性迁移。由于当前没有业务数据，v1 不需要玩家数据迁移；存档迁移机制本身通过测试夹具验证。

## Feature 架构规范

游戏业务功能采用垂直 Feature 模块化组织方式。

每一个 Feature 应该是一个相对独立的业务闭环，负责自身完整的业务能力。

一个 Feature 包含：

- Domain：
  领域模型和核心业务规则

- Application：
  业务流程编排和应用服务

- Presentation：
  UI展示逻辑、ViewModel以及用户交互适配

- Configuration：
  业务相关配置数据


Framework 只提供基础设施能力和通用接口契约。

Framework 不应该了解任何具体游戏业务，例如：

- 角色
- 装备
- 卡牌
- 建筑
- 任务
- 商店


示例结构：

game/features

├── inventory
│
│   ├── domain
│   ├── application
│   ├── presentation
│   └── config
│
├── battle
│
└── hero

Feature之间应该通过明确接口通信，避免直接访问其他Feature内部实现。

## ApplicationContext 使用限制

ApplicationContext 仅允许存在于：

- Composition Root（应用组合入口）
- Module 生命周期管理边界


ApplicationContext 的职责：

- 创建和装配 Framework 服务
- 管理模块生命周期
- 提供基础设施依赖


业务代码禁止直接依赖 ApplicationContext。


禁止：

```typescript
class InventoryService {

    constructor(
        private context: ApplicationContext
    ) {}

}


## MVP 第一阶段范围

为了保证 Framework 可以快速验证和持续演进，
第一阶段只实现经过验证的基础运行能力。


第一阶段包含：

### Application Runtime

- 应用生命周期管理
- Framework 初始化流程
- Module 管理


### Resource System

- 资源加载接口
- Asset Bundle 管理
- FairyGUI Package 加载支持


### UI Runtime

- FairyGUI Adapter
- UI Layer 管理
- Window 生命周期
- UI 路由


### Scene System

- 场景切换
- 场景生命周期管理


### Configuration System

- 配置加载接口
- 配置访问规范


### Save System

- 本地数据存储接口
- 存档生命周期


### Diagnostics

- Logger
- Debug信息输出


第一阶段暂不实现：

- ECS
- 战斗系统
- 背包系统
- 技能系统
- 卡牌系统
- 任务系统
- 经济系统
- 行为树
- 热更新


以上系统必须在具体游戏 Feature 验证需求后，再逐步引入。

避免为了假设需求提前设计复杂系统。
