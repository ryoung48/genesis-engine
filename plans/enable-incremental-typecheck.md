# Enable incremental typechecking

1. Record the baseline `pnpm typecheck` timing.
2. Enable persistent TypeScript build information for all referenced projects.
3. Measure the warm incremental timing and run the required verification commands.
