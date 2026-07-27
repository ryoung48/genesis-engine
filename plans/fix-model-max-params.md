# Fix model max-parameter diagnostics

- [ ] Classify the model diagnostics into domain functions and native callbacks.
- [ ] Refactor domain functions to accept one object parameter and update call sites.
- [ ] Add precise suppressions for callback signatures owned by native APIs.
- [ ] Run Biome on `src/model` and `pnpm typecheck`.
