---
name: refactor-symbols
description: Rename or move TypeScript symbols and modules in this repo using the project's ts-morph refactor scripts, which rewrite every importer (relative and @/... alias) automatically. Use whenever renaming an exported symbol, moving a file/folder, or extracting exports into another file, instead of hand-editing imports.
---

# Refactor symbols and modules

This repo has three ts-morph-powered scripts under `scripts/refactor/` for
structural refactors. Always prefer these over manual find-and-replace or
hand-editing import statements — they rewrite every importer project-wide
(both relative imports and the `@/...` alias) and keep things type-correct.

## Rename a top-level exported symbol

```
node scripts/refactor/rename-symbol.mjs <file> <oldName> <newName>
```

- `<file>` is the repo-relative path where the symbol is declared.
- Renames a function/const/interface/type/class and every reference to it
  project-wide, including property-access usages like `OLD_NAME.someMethod`.

Example:
```
node scripts/refactor/rename-symbol.mjs src/model/history/generated/eu4-days/index.ts EU4_DAYS HISTORY_DAYS
```

## Move or rename a file/folder (module)

```
node scripts/refactor/move-module.mjs <from> <to> [<from> <to> ...]
```

- `<from>`/`<to>` are repo-relative paths. If `<from>` is a directory, its
  full contents move to `<to>`, preserving structure.
- Rewrites every importer (relative and `@/...` alias) across the project.
- Accepts multiple `<from> <to>` pairs in one invocation.

Example:
```
node scripts/refactor/move-module.mjs src/model/climate/locked src/model/climate/tidal-locked
```

## Extract/move named exports into another file

```
node scripts/refactor/move-symbol.mjs <fromFile> <toFile> <symbol> [<symbol> ...]
```

- Moves the named declarations (function/const/interface/type/class) from
  `<fromFile>` to `<toFile>` (created with dirs if missing).
- Repoints every project-wide importer of those symbols to the new module.
- Resolves transitive import fallout on both ends: symbols the moved code
  depends on get imported into the destination file, and imports no longer
  used in the source file after the move are dropped.

Example:
```
node scripts/refactor/move-symbol.mjs src/model/transport/types.ts src/model/worker-protocol/types.ts SerializedGenesisWorld GenesisWorkerRequest
```

## After running any of these

Run `pnpm lint` and `pnpm typecheck` to verify the refactor left the repo
clean, per this repo's standard change-verification step (see AGENTS.md).
