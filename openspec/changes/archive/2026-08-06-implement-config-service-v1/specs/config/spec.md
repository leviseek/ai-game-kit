# config Specification

## Purpose

提供引擎无关的类型化配置服务与 Bundle 配置加载：按配置键读取类型化值，缺失与解析失败以类型化错误表达，支持默认值回退与只读快照，并与玩家存档严格分离。

## ADDED Requirements

### Requirement: Configuration reads are typed

配置服务 MUST 支持按配置键读取类型化配置值。键与值的类型 MUST 由调用方在读取时声明，读取结果 MUST 与声明类型一致；类型不匹配 MUST 以类型化错误表达，不得静默返回错误形状的数据。

#### Scenario: Reading a configured value returns its declared type

- **WHEN** 调用方以类型 `T` 读取已装载的配置键 `k`
- **THEN** 返回值为声明类型 `T` 的值，与配置内容一致

#### Scenario: Type mismatch fails with a typed error

- **WHEN** 配置键 `k` 的实际形状与调用方声明的类型不一致
- **THEN** 读取失败并抛出类型化错误，调用方可据此分支处理

### Requirement: Missing and malformed configuration are distinguished

缺失配置与解析失败 MUST 以不同类型化错误表达。缺失 MUST 表示该配置键不存在；解析失败 MUST 表示配置存在但内容无法按期望解析，并 MUST 携带可诊断信息。

#### Scenario: Missing key raises a distinct error

- **WHEN** 调用方读取一个未装载的配置键
- **THEN** 读取失败并抛出表示缺失的类型化错误

#### Scenario: Malformed config raises a distinct error

- **WHEN** 配置键存在但其内容无法按期望解析
- **THEN** 读取失败并抛出表示解析失败的类型化错误，且错误携带该配置键等诊断信息

### Requirement: Default values fall back on missing config

调用方为某配置键提供默认值时，配置缺失 MUST 回退到默认值而非报错。默认值仅在缺失时生效，配置存在时 MUST 返回实际配置值。

#### Scenario: Missing key falls back to default

- **WHEN** 调用方带默认值读取一个未装载的配置键
- **THEN** 返回该默认值，且不产生错误

#### Scenario: Present config overrides default

- **WHEN** 调用方带默认值读取一个已装载的配置键
- **THEN** 返回实际配置值而非默认值

### Requirement: Loaded configuration is a read-only snapshot

配置装载后 MUST 以只读快照暴露给读取方。快照内容在装载后 MUST 不被运行时修改；读取方尝试修改快照 MUST 不改变底层配置数据。

#### Scenario: Snapshot rejects runtime mutation

- **WHEN** 调用方对已装载配置的快照对象尝试赋值修改
- **THEN** 修改不生效（抛出或被忽略），后续读取仍返回原始配置内容

### Requirement: Configuration is loaded from bundles, separate from saves

配置 MUST 经资源读取路径加载（Bundle 配置），MUST NOT 使用玩家存档的键值存储后端，两者 MUST 互不混用。配置装载失败（如 Bundle 缺失、资源加载失败）MUST 以类型化错误表达，不得静默回退或产生部分配置状态。

#### Scenario: Config loads from a bundle resource

- **WHEN** 调用方从配置 Bundle 装载一个配置资源
- **THEN** 配置被装载并可按键读取，且不写入或读取任何玩家存档后端

#### Scenario: Bundle config load failure is a typed error

- **WHEN** 配置 Bundle 或配置资源加载失败
- **THEN** 装载失败并抛出类型化错误，保留底层原因，不产生部分配置状态
