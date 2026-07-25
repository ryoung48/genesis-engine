# AGENTS.md

NEVER git stash without asking for permission first.

Before finishing any TypeScript or TSX code change in this repository, verify it with:

- `pnpm lint`
- `pnpm typecheck`

Unless the user explicitly asks for backwards compatibility, never preserve or optimize for backwards compatibility.

Always check for duplicated logic before adding new code. Reuse or extract shared logic instead of copying behavior into another file.

Avoid barrel files. Import from the concrete module you need instead of adding or expanding `index.ts` re-export layers.

## References

- For any UI or UX work, follow `src/ui/components/UI.md`.
