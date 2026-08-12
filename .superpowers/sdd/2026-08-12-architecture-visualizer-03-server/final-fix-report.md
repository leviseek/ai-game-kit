# Final Review Fix Report

## Status

- Fixed Important 1: missing `pendingChanges` is treated as CodeGraph not ready in scheduler and CLI readiness checks.
- Fixed Important 2: CLI default mode disposes the started server if watcher startup throws.
- Fixed Important 3: `/api/source` only reads files present in current snapshot node locations.
- Deferred minor: static symlink realpath hardening was not changed; source endpoint hardening was kept scoped to the review requirement.

## Verification

- `bun test tools/arch-viewer/test/watcher.test.ts tools/arch-viewer/test/cli.test.ts tools/arch-viewer/test/http-server.test.ts`: passed, 28 tests.
- `bun x tsc --noEmit -p tools/arch-viewer/tsconfig.json`: passed.
- `git diff --check`: passed.
- `bun run arch --once --no-open`: failed as expected in this worktree because CodeGraph reports `worktree mismatch` (`indexRoot=D:\ai-work\ai-game-kit`, `worktreeRoot=D:\ai-work\ai-game-kit\.worktrees\architecture-visualizer`).

## Concerns

- Actual once analysis remains blocked until CodeGraph is indexed for this worktree or the matching worktree is used.
