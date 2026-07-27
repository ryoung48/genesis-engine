# Extend max-parameter enforcer coverage

- [x] Discover arrow/function-expression callbacks declared as object properties.
- [x] Rewrite direct property call sites when converting those callbacks to a params object.
- [x] Add documented Biome suppressions for multi-parameter callbacks imposed by native APIs.
- [ ] Verify the enforcer dry runs, then run repository lint and type checks. Blocked by unrelated, existing diagnostics in the ongoing repository migration.
