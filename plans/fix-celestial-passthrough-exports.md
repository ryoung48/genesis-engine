# Fix celestial pass-through exports

- Run `pnpm check:passthrough-exports src/model/celestial`.
- Replace pure shims and raw re-exports in `src/model/celestial` with concrete public declarations.
- Re-run the scoped checker, lint, and typecheck.
