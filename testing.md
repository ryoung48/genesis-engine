# testing.md

Use this as the baseline reference for testing in this repository.

## Requirements

- Every code change must include tests or updates to existing tests.
- Changes without tests are incomplete unless they are a documented non-functional exception.
- Plans must include the tests that will be created or updated.
- For heavyweight model-generation changes, prefer `pnpm gen:world` as the runtime validation path instead of adding broad fixture-style coverage.
- `pnpm test` enforces the current unit-coverage baseline, and `pnpm test:coverage` is an alias for the same gate.

## Acceptable exceptions

- Pure refactors with no behavior change, as long as existing tests still pass.
- Non-functional changes such as comments, formatting, or config-only updates.

Any exception should be explicit in the work and justified by the nature of the change.

## Guidelines

- Keep tests focused: one behavior per test.
- Use descriptive names: scenario + expected outcome.
- Follow AAA: Arrange, Act, Assert.
- Test behavior, not implementation details.
- Use specific assertions.
- Prefer meaningful coverage over superficial coverage.
- Coverage thresholds are a ratchet: raise them to match new covered baseline when adding files or testable lines, and never lower them.
- Avoid brittle tests that depend on incidental structure.
- Co-locate tests where appropriate or follow existing project conventions.
