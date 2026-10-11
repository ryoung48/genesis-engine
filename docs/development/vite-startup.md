# Vite startup and browser imports

`pnpm dev` starts Vite. Server readiness and first-page readiness are separate measurements: the server can listen while dependency optimization and source transformations continue.

## Scan boundaries

- `vite.config.ts` sets `optimizeDeps.entries` to `index.html`. Vite follows the application's imports from that entry instead of scanning generated HTML reports in `stats/`.
- `src/index.css` limits Tailwind sources to `src/ui/` and `src/App.tsx`. Simulation files and generated data do not contribute application CSS classes.
- Vite's watcher ignores nested worktrees, tool installations, reports, logs, scripts and coverage output. Application source and public assets remain watched.
- React Compiler runs for production builds. Development uses the native TypeScript/JSX transform instead of compiling every source file through Babel.

## Lightweight model dependencies

UI and record translation code should import the smallest domain API that provides their required behavior:

- `STATE_CLOCK` in `src/model/history/sim/engine/state/clock/index.ts` owns the existing start year and time conversions.
- `WAR_GOAL` in `src/model/history/sim/engine/state/war-goal/index.ts` owns the rebel-goal predicate.
- `RELATION_CODE` in `src/model/history/sim/engine/fields/relation-code/index.ts` owns the relation-code mapping.

Importing the simulation state or mutable fields API merely to read these values brings engine, military and event modules into the browser's startup graph. The engine uses the same extracted definitions, so callers do not duplicate values or rules.

The galaxy view loads when galaxy mode first opens and remains mounted afterward. The planet-renderer experiment loads when its route opens. These boundaries defer unused screens without moving simulation work onto the main thread.

## Verification

Measure a fresh development server with a populated dependency cache separately from dependency-cache creation. Check first-page rendering and browser errors, and confirm that the galaxy and experiment still load when opened. Avoid timing browser startup concurrently with history smoke tests or benchmarks.

Run `pnpm lint` and `pnpm typecheck`. Model extractions also require the related and full history smoke suites and an equivalent saved history report comparison, as specified in `AGENTS.md`.
