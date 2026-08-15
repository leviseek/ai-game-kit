## Purpose

FGUI 工具链校验加固：跨包引用反向校验目标包资源存在性（断裂即 error，有效引用消除噪音警告），gen-constants 产物受 freshness 保护（与 gen-types 对称）。

## ADDED Requirements

### Requirement: 跨包引用反向校验

`fgui validate` SHALL 对跨包引用（`ui://<pkgid><resid>`）解析目标包并校验 `resid` 在目标包 resources 中存在：命中 SHALL 无问题（不再发"请人工确认"噪音警告）；缺失 SHALL 报 error（引用断裂）；目标包不可解析（官方库或工程外包）SHALL 保留人工确认警告。

#### Scenario: 有效跨包引用通过

- **WHEN** 业务包引用 Common 包内已登记的资源 id
- **THEN** 校验通过，不产生任何 issue（引用可解析）

#### Scenario: 目标包内缺失资源报错

- **WHEN** 跨包引用指向目标包未登记的资源 id
- **THEN** 校验报 error，指出目标包与缺失 id

### Requirement: gen-constants 产物 freshness

`fgui validate` SHALL 校验 gen-constants 产物与源 XML 一致：exported 组件增删后未重跑 `gen-constants` 时，`ui-<包>.ts` 常量表 SHALL 被标记过期并报 error；产物缺失 SHALL 提示先运行；磁盘多余常量产物 SHALL 报 error。gen-types 产物由既有 freshness 检查覆盖。

#### Scenario: exported 组件增删后未重跑即失败

- **WHEN** package.xml 新增 exported 组件但 `ui-<包>.ts` 未更新
- **THEN** validate 报 gen-constants 产物过期 error，阻断通过
