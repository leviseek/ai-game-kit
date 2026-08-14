## Purpose

加载协调器支持可选终态缓存容量上限：超过上限按插入序驱逐最早进入终态（ready/failed）的条目，loading 条目永不驱逐——长生命周期 Provider 的缓存有界增长，共享加载语义不受影响。

## ADDED Requirements

### Requirement: 终态缓存容量上限

加载协调器 SHALL 支持可选 `maxEntries` 上限：终态（ready/failed）条目数超过上限时 SHALL 按插入序驱逐最早进入终态的条目，使缓存有界；loading 中条目 SHALL NOT 被驱逐（并发共享加载语义不变）；已 resolved 的 handle 持有其资源引用，驱逐只影响未来 load（重新触发底层加载）；未提供上限时 SHALL 保持无界行为不变。

#### Scenario: 超上限驱逐最早终态并可重载

- **WHEN** 协调器上限为 2，三个不同 key 依次落定
- **THEN** 最早的终态条目被驱逐，再次 load 该 key 触发新的底层加载而非返回陈旧缓存

#### Scenario: loading 条目不被驱逐

- **WHEN** 并发加载条目数超过上限且全部仍在加载
- **THEN** 无条目被驱逐、不抛错，全部落定后按插入序驱逐最早终态
