# Task 2 Report: TypeScript SourceScanner

## Status

DONE

## Implementation

- 新增 `SourceScanner`，使用 TypeScript Compiler API 扫描 class、function、interface、type alias 与 method 声明。
- 嵌套函数使用 `outer::inner`，class/interface 成员使用 `Owner::method`；记录稳定 ID、规范化路径、聚合后的起止行号与模块导出标记。
- 仅收集静态 `ImportDeclaration` 和带 module specifier 的 `ExportDeclaration`，不推断调用，不扫描 dynamic import 或 require。
- 相对模块按 `.ts/.tsx/.mts/.cts`、显式扩展名和目录 `index.*` 解析；外部包保留 specifier 且不伪造 `toFile`。
- 忽略 declaration files、`.meta`、`node_modules`、`third-party` 与 `assets/framework/libs/fairygui`。
- 文件、声明与依赖均确定性排序；实现未新增依赖。

## TDD Evidence

- RED: `bun test tools/arch-viewer/test/source-scanner.test.ts`
  - 结果：失败，原因是 `../lib/analysis/source-scanner` 尚不存在。
- GREEN: `bun test tools/arch-viewer/test/source-scanner.test.ts`
  - 结果：1 pass，0 fail，4 assertions。
- Review RED: 增加显式 `./direct.mts` 相对导入后测试失败，实际结果缺少 `toFile`。
- Review GREEN: 修复显式扩展名候选后测试恢复为 1 pass，0 fail，4 assertions。
- Review RED 2: 同时存在 `target.tsx` 与 `target/index.ts` 时，测试暴露解析器错误优先选择目录 index。
- Review GREEN 2: 候选顺序改为先尝试全部同名文件扩展，再尝试目录 `index.*`。

## Verification

- `bun test ./tools/arch-viewer/test`
  - 结果：30 pass，0 fail，82 assertions。
- `bun x tsc --noEmit -p tools/arch-viewer/tsconfig.json`
  - 结果：通过，无输出。
- `bun x eslint tools/arch-viewer/lib/analysis/module-resolver.ts tools/arch-viewer/lib/analysis/source-scanner.ts tools/arch-viewer/test/source-scanner.test.ts`
  - 结果：通过，无输出。
- `git diff --check`
  - 结果：通过。
- 新文件行数：`module-resolver.ts`、`source-scanner.ts`、`source-scanner.test.ts` 均小于 300 行。

## Concerns

- `exported` 表示顶层声明是否由当前模块导出，支持 modifier、本地 export list、alias 与 `export default Identifier`；仍不传播到 class/interface 成员。
- 未解析到文件的相对 specifier 保持 `external: false` 且省略 `toFile`，供后续分析层区分“仓库内引用但目标缺失”和外部包。

## Fix Round 1/5

### Findings Addressed

- 声明遍历改为语句容器白名单，不再递归 object literal、class/function/arrow expression 等表达式子树；class/function declaration 及其方法体中的命名 function declaration 仍保留完整 scope。
- 顶层 `exported` 改为模块导出语义：合并 direct export modifier、本地 `export { Local }`、alias export 的本地名与 `export default Local`。
- 相同 `kind/file/qualifiedName` 的 overload 与 declaration merging 聚合为一个声明，范围取 `start=min/end=max`，`exported` 取 any，稳定 ID 保持唯一。
- 输入路径先规范化再用 `Set` 去重，避免重复扫描同一文件并产生重复 declaration/import。

### TDD Evidence

- RED: `bun test tools/arch-viewer/test/source-scanner.test.ts`
  - 结果：1 pass，4 fail；分别复现表达式子树泄漏、模块导出漏标、overload/merging 重复、输入文件重复扫描。
- GREEN: `bun test tools/arch-viewer/test/source-scanner.test.ts`
  - 结果：5 pass，0 fail，11 assertions。

### Verification

- `bun test ./tools/arch-viewer/test`
  - 结果：34 pass，0 fail，89 assertions。
- `bun x tsc --noEmit -p tools/arch-viewer/tsconfig.json`
  - 结果：通过，无输出。
- `bun x eslint tools/arch-viewer/lib/analysis/module-resolver.ts tools/arch-viewer/lib/analysis/source-scanner.ts tools/arch-viewer/test/source-scanner.test.ts`
  - 结果：通过，无输出。
- `git diff --check`
  - 结果：通过。
- 文件行数：`source-scanner.ts` 245 行，`source-scanner.test.ts` 232 行，均小于 300 行。

### Concerns

- 本轮发现的 block 级聚合冲突已在 Fix Round 2 通过内部 scope key 解决。
- `export = Identifier` 不属于本轮要求的 ES module 导出形式，当前不标记为 `exported`。

## Fix Round 2/5

### Findings Addressed

- 新增内部词法作用域（lexical scope）key 与稳定 block ordinal；公开 `qualifiedName` 保持 `outer::run`，内部 key 只用于声明 ID 和聚合边界。
- 不同词法块中的同名 function declaration 生成独立声明、独立 ID 和各自源码范围，不再跨块聚合。
- class method 按 static/instance 与 method/get/set 类别区分聚合；同容器、同类别的 overload 仍聚合，interface merging 仍按模块 scope 聚合。
- constructor、getter、setter 与 class static block 的语句体纳入白名单遍历，内部命名 function declaration 保留语义 scope；任意 expression 子树仍不进入。
- 声明扫描职责拆到 `declaration-scanner.ts`，`source-scanner.ts` 保留文件与 import/export 编排，所有文件继续小于 300 行。

### TDD Evidence

- RED: `bun test tools/arch-viewer/test/source-scanner-scope.test.ts`
  - 结果：0 pass，3 fail；分别复现 class 特殊容器漏扫、跨 block 同名函数错误聚合、static/instance method 错误聚合。
- GREEN: `bun test tools/arch-viewer/test/source-scanner-scope.test.ts tools/arch-viewer/test/source-scanner.test.ts`
  - 结果：8 pass，0 fail，17 assertions。

### Verification

- `bun test ./tools/arch-viewer/test`
  - 结果：37 pass，0 fail，95 assertions。
- `bun x tsc --noEmit -p tools/arch-viewer/tsconfig.json`
  - 结果：通过，无输出。
- `bun x eslint tools/arch-viewer/lib/analysis/declaration-scanner.ts tools/arch-viewer/lib/analysis/module-resolver.ts tools/arch-viewer/lib/analysis/source-scanner.ts tools/arch-viewer/lib/graph/ids.ts tools/arch-viewer/test/source-scanner.test.ts tools/arch-viewer/test/source-scanner-scope.test.ts`
  - 结果：通过，无输出。
- `git diff --check`
  - 结果：通过。
- 文件行数：`declaration-scanner.ts` 184 行，`source-scanner.ts` 104 行，`source-scanner.test.ts` 232 行，`source-scanner-scope.test.ts` 92 行。

### Concerns

- block ordinal 对同一父 scope 内相同类别容器的源码顺序敏感；这是确定性的词法身份，但在前方插入同类 block 会改变后续 block 内声明 ID。
- accessor 的 get/set 使用不同内部类别，因此同名 getter 与 setter 是两个 `SourceDeclaration`；公开 `qualifiedName` 相同，ID 不同。
- `export = Identifier` 仍不在当前 ES module 导出范围内。
