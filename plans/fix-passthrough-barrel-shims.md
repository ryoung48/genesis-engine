# Fix pass-through barrel shims in celestial

Per AGENTS.md: "The barrel is the entry point, not a pass-through — `index.ts`
should export the domain's namespace object, not just re-export free
functions/constants pulled in from sibling files with no namespace wrapping
them." A scan of `src/model/celestial` for flat files that are pure
re-export layers (no namespace object, no logic of their own) found two
violations.

## 1. `planet/environment/classification.ts`

```ts
export type { ClassifiedEnvironment } from "./classification/dice-table"
export { rollClassificationAssignment } from "./classification/dice-table"
export {
	buildHydrosphereProfile,
	hydrosphereCodeFromWaterPct,
	hydrosphereWaterFraction,
} from "./classification/hydrosphere"
```

This sits as a flat file *sibling* to the `classification/` folder it
re-exports from — the same folder-vs-flat-file collision pattern flagged for
`sol-system.ts` below. Consumers (`planet/environment.ts`,
`planet/index.ts`) import from `"./environment/classification"`.

**Fix:** move this file's content into `classification/index.ts` (currently
only `classification/types.ts` exists there, holding `ClampInput`). The new
`classification/index.ts` becomes the real barrel:
- Re-export `ClassifiedEnvironment` type and `rollClassificationAssignment`
  from `./dice-table`.
- Re-export `buildHydrosphereProfile`, `hydrosphereCodeFromWaterPct`,
  `hydrosphereWaterFraction` from `./hydrosphere`.
- Delete the flat `classification.ts`.
- Update `environment.ts` and `planet/index.ts` to import from
  `"./environment/classification"` (unchanged import path — now resolves to
  the folder instead of the flat file, since sub-100-line function count
  doesn't warrant a namespace object here; this module has no logic of its
  own to wrap, only sub-barrel re-exports, so a plain re-export barrel is
  correct once it's *the* `classification/index.ts` rather than a shadow
  sibling).

## 2. `planet/types.ts`'s `TemperatureHydrosphereLossInput`

`TemperatureHydrosphereLossInput` is defined in `planet/types.ts` but its
only consumer is the private `applyTemperatureHydrosphereLoss` function
inside `planet/environment.ts` (`environment.ts:41-50`), which degrades
`hydrosphereCode` based on temperature (via `deviationToCelsius` from the
`environment/temperature` submodule). `split-planet-types.md` originally
left this type in `planet/types.ts` on the reasoning that `environment.ts`
is a barrel/entry file, not a submodule — but the type is single-use and
its owning logic is a private helper, not barrel plumbing, so per the
"single-consumer type belongs with its owning submodule" rule it shouldn't
sit in the parent `types.ts` either.

**Fix:** move `applyTemperatureHydrosphereLoss` itself (not just the type)
into `environment/classification/hydrosphere/index.ts` — its concern
(degrading a hydrosphere code) matches that submodule's existing exports
(`buildHydrosphereProfile`, `hydrosphereCodeFromWaterPct`,
`hydrosphereWaterFraction`) more closely than `temperature`'s. Export it
from there, move `TemperatureHydrosphereLossInput` into
`hydrosphere/types.ts` alongside `BuildHydrosphereInput` etc., and update
`environment.ts` to import and call it from
`"./environment/classification/hydrosphere"` instead of defining it
inline. Remove the now-empty `TemperatureHydrosphereLossInput` export from
`planet/types.ts` (only `Zone` remains there).

## 3. `system/sol-system.ts`

```ts
export * from "./sol-system/index"
```

This is a flat file with the same name as the sibling `sol-system/` folder
it re-exports — a one-line shadow shim. Consumers (`system/index.ts`) import
from `"./sol-system"`, which TS resolves to this flat file in preference to
the folder, silently intercepting the barrel.

**Fix:** delete `system/sol-system.ts`. `system/index.ts`'s existing
`from "./sol-system"` import will then resolve directly to
`sol-system/index.ts`, which is already the real barrel (298 lines, has its
own exports) — no consumer changes needed beyond removing the dead file.

## Scan results — no other violations found

Checked every flat `.ts` file under `src/model/celestial` (excluding
`types.ts` files and test files) for pure re-export-only content with no
namespace object:

- `moons/index.ts`, `orbit-body/index.ts`, `star/index.ts`,
  `system/generation/index.ts`, `system/sol-system/index.ts` — all export a
  real namespace object (`MOON`, `ORBIT_BODY`, `STAR`, etc.) or substantial
  logic. Not shims.
- `planet/index.ts`, `system/index.ts` — both wrap a namespace object
  (`PLANET`, `SYSTEM`) even though they also re-export types; the
  `SYSTEM`/`PLANET` wrapping is the deciding factor that makes these real
  barrels rather than shims. (`system/index.ts` was flagged in
  `split-planet-types.md` as "pass-through" but it does define `SYSTEM` —
  worth re-confirming that concern is satisfied once `sol-system.ts` is
  removed, but no further action needed here.)
- `planet/environment.ts`, `planet/seismology.ts`, `planet/tide-lock.ts`,
  `system/generation/rolls.ts`, `system/generation/star-identity.ts`,
  `system/generation/texture.ts`, `system/sol-system/data.ts` — all contain
  real logic, not pure re-export shims.

No other flat-file-shadows-sibling-folder collisions like `sol-system.ts`
were found (`size-class.ts`, `seismology/heating.ts`, etc. from the earlier
split were already fully removed, not left as shadow shims).
