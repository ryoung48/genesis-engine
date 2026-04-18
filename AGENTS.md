# AGENTS.md

Before finishing any code change in this repository, verify it with:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`

If `pnpm lint` changes files, rerun `pnpm lint` and then `pnpm typecheck` and `pnpm test` before handing the work back. If either command fails, fix the reported issues and rerun the verification steps in that order.

Unless the user explicitly asks for backwards compatibility, never preserve or optimize for backwards compatibility.

## Testing Requirements

* **Every code change must include tests or updates to existing tests.**
* Changes without tests are considered incomplete.
* Plans must include tests that will be created.

### Acceptable exceptions (must be explicitly justified in comments):

* Pure refactors with no behavior change (tests must still pass)
* Non-functional changes (e.g., comments, formatting, config)

### Testing Guidelines
* **Keep tests focused:** one behavior per test
* **Use descriptive names:** scenario + expected outcome
* **Follow AAA:** Arrange, Act, Assert
* **Test behavior, not implementation**
* **Use specific assertions**
* Prefer meaningful coverage over superficial tests
* Avoid brittle tests that depend on incidental structure
* Co-locate tests where appropriate or follow project conventions

Keep this file and `CLAUDE.md` in sync. If you update one, update the other to match.
