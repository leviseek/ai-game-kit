# Final Review Fix Report

## Status

- Fixed Important 1: `resolveSymbol` now applies `SymbolRef.file` to qualified-name matches before returning a node.
- Fixed Important 2: `QueryService` now defensively copies node, edge, and group `metadata`, including array and plain-object values.
- Added ledger minor coverage for getter/setter member aggregation.

## Red Tests

- `resolveSymbol 不返回 file 不匹配的唯一 qualifiedName 命中` failed because the previous qualified-name fast path returned a node from another file.
- `query service copies metadata arrays and objects from non-frozen snapshots` failed because returned `group.metadata.patterns` shared the original mutable array.
- Getter/setter aggregation coverage already passed on the current scanner implementation and was retained as regression coverage.

## Verification

- `bun test tools/arch-viewer/test/codegraph-gateway.test.ts tools/arch-viewer/test/analyzer.test.ts tools/arch-viewer/test/source-scanner-scope.test.ts` passed: 26 pass, 0 fail.
- `bun x tsc --noEmit -p tools/arch-viewer/tsconfig.json` passed.
- `git diff --check` passed.

## Concerns

- None remaining.
