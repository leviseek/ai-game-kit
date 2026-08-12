# Task 2 Report: TypeScript SourceScanner

## Status

DONE

## Implementation

- 新增 `SourceScanner`，使用 TypeScript Compiler API 扫描 class、function、interface、type alias 与 method 声明。
- 嵌套函数使用 `outer::inner`，class/interface 成员使用 `Owner::method`；记录稳定 ID、规范化路径、起止行号与直接 `export` 标记。
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

- `exported` 只表示声明节点自身是否带 `export`，不会从已导出的 class/interface 传播到成员；这与当前静态声明边界一致。
- 未解析到文件的相对 specifier 保持 `external: false` 且省略 `toFile`，供后续分析层区分“仓库内引用但目标缺失”和外部包。
