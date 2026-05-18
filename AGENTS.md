# AGENTS.md

Before finishing any code change in this repository, verify it with:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`

`pnpm test` is the required final automated verification command. Use narrower commands like `pnpm test:unit` while iterating when useful, but do not treat them as a substitute for the final `pnpm test` pass.

For model-generation changes, also run `pnpm gen:world` before handing the work back. Prefer the dedicated generation runtime path over rebuilding broad fixture coverage for heavyweight model validation.

If `pnpm lint` changes files, rerun `pnpm lint` and then `pnpm typecheck` and `pnpm test` before handing the work back. If any verification command fails, fix the reported issues and rerun the verification steps in that order.

**All changes must have an accompanying unit test.** Remember that these tests are to help you prevent regressions and verify expected behaviors, therefore it is in your best interest to make them meaningful. Another word of advice, sometimes you can avoid unit tests by reusing already made functions. Therefore it is in your best interest to centralize common utilities and avoid duplicated behavior.

Unless the user explicitly asks for backwards compatibility, never preserve or optimize for backwards compatibility.

Always check for duplicated logic before adding new code. Reuse or extract shared logic instead of copying behavior into another file.

Avoid barrel files. Import from the concrete module you need instead of adding or expanding `index.ts` re-export layers.

## References

- For any UI or UX work, follow `src/ui/components/UI.md`.
- For testing requirements and test-writing guidance, follow `testing.md`. 
