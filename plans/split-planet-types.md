# Split planet/types.ts into owning submodules

Status: complete. The planet split and the rest-of-celestial audit below are
implemented.

`src/model/celestial/planet/types.ts` currently holds 19 exported types, but
most are single-use inputs for one specific piece of logic. Per AGENTS.md
("`types.ts` = shape, `index.ts` = behavior", "Nest sub-folders only for
real sub-domains", "Barrel-only"), the fix is not to inline these types into
their logic file — that violates the types/index split. Instead, each
currently-flat file that owns exclusive types becomes its own submodule
folder: `<name>/index.ts` (the existing logic, renamed) + `<name>/types.ts`
(its types moved out of `planet/types.ts`), consumed by callers only through
the folder's barrel.

## Convert to folders

- `size-class.ts` → `size-class/index.ts` + `size-class/types.ts` (`PlanetarySizeClassInput`)
- `environment/temperature.ts` → `environment/temperature/index.ts` + `environment/temperature/types.ts` (`OrbitalTemperatureInput`, `TemperatureInput`, `DeviationInput`)
- `environment/atmosphere.ts` → `environment/atmosphere/index.ts` + `environment/atmosphere/types.ts` (`RollAtmosphereInput`, `AtmosphereCodeInput`)
- `environment/density.ts` → `environment/density/index.ts` + `environment/density/types.ts` (`DensityDescriptionInput`, `DensityProfileInput`, `RollAlbedoInput`)
- `environment/classification/dice-table.ts` → `environment/classification/dice-table/index.ts` + `.../dice-table/types.ts` (`ChooseChemistryInput`, `ClassifiedEnvironment`)
- `environment/classification/hydrosphere.ts` → `environment/classification/hydrosphere/index.ts` + `.../hydrosphere/types.ts` (`BuildHydrosphereInput`, `CountBodiesInput`, `DistributeSurfaceInput`, `WaterPctInput`)
- `seismology/heating.ts` → `seismology/heating/index.ts` + `seismology/heating/types.ts` (`MoonTidalHeatingInput`)
- `seismology/reclassify.ts` → `seismology/reclassify/index.ts` + `seismology/reclassify/types.ts` (`HeatedClassInput`)

Existing barrels (`environment.ts`, `seismology.ts`, `environment/classification.ts`)
keep importing from these folders' `index.ts` only — never reach into the
new `types.ts` files directly except for type-only imports, per the
barrel-only rule.

## Shared ClampInput

Used by both `dice-table` and `hydrosphere` submodules. Since it's shared
across sibling submodules rather than owned by one, it goes in
`environment/classification/types.ts` (the classification barrel's own
types file), not duplicated in each.

## ClassifiedEnvironment

Produced by the `dice-table` submodule — define it in
`environment/classification/dice-table/types.ts` and re-export via the
`classification.ts` barrel so `environment.ts`'s `assignment?:
ClassifiedEnvironment` param can still import it from the barrel.

## TemperatureHydrosphereLossInput

Only used inside `environment.ts` itself (the barrel file, not a submodule).
Since `environment.ts` is a barrel/entry file rather than a logic module
with its own folder, this type stays in `planet/types.ts` (or moves to a
sibling `environment` types file if `environment.ts` itself gets split into
a folder later — out of scope here).

## Stays in planet/types.ts

- `Zone` — genuinely used across environment, seismology, and index; a true
  domain-level shared type.
- `RingProfile` — flagged as questionable (see below), left in place for now.

## Rule violation to flag

`RingProfile` is defined in `planet/types.ts` but is not consumed by any
file inside `planet/` — only by `system/generation/rolls.ts` and
`system/types.ts`. This type looks misplaced under `planet` and likely
belongs in `orbit-body` or `system` instead. Not fixed as part of this pass
— separate follow-up.

## Rest-of-celestial audit (moons/, orbit-body/, star/, system/)

Same rule set applied to the rest of `src/model/celestial` and implemented in
this pass.

### Convert to folders (flat files with single-consumer types stuck in a shared types.ts)

- `moons/mechanics.ts` → `moons/mechanics/index.ts` + `moons/mechanics/types.ts`
  (`HillSphereInput`, `KeplerEquationInput`, `MoonPositionVectorInput`,
  `MoonSemiMajorAxisInput`, `MoonPeriodFromAxisInput`, `RocheLimitInput`,
  `MoonPeriodBoundsInput` — all currently dumped in `moons/types.ts` but
  exclusive to `mechanics.ts`). `moons/index.ts` should import from the new
  `./mechanics` barrel instead of the flat file.
- `system/generation/environment.ts` → `system/generation/environment/index.ts`
  + `.../environment/types.ts` (`Slot`, currently defined inline and shared
  only with `system/generation.ts`).

### Cross-domain misplaced type

- `SeedForMoonInput` was moved to `planet/seismology/types.ts`, alongside its
  only consumer in `planet/seismology.ts`.

### Barrel-only violations (reaching past a sibling's index.ts into its types.ts)

- `system/types.ts:1` imports `MoonBody` from `"../moons/types"` instead of `"../moons"`.
- `system/types.ts:56` imports `MainSequenceClass` from `"../star/types"` instead of `"../star"`.
- `planet/types.ts:2` imports `MoonBody` from `"../moons/types"` instead of `"../moons"`.
- `planet/types.ts:9` and `planet/seismology.ts:24` import `SystemBody` /
  `SeedForMoonInput` from `"../system/types"` instead of `"../system"`.
  (`system/index.ts` re-exports `SystemBody`/`SolarSystemState` already;
  add `SeedForMoonInput`'s replacement once relocated per above.)

### Oversized / mixed-concern module

- `system/generation.ts` was ~645 lines and mixed body-generation
  orchestration (`HomeWorldParams`, `GenerateSystemBodiesParams`,
  `buildMainWorldSeed`, `generateSystemBodies`) with delegation to its
  `generation/{environment,rolls,star-identity,texture}.ts` siblings, well
  past the ~250-500 line split threshold. Fix: promote to its own
  `generation/index.ts` + `generation/types.ts` (folding in the existing
  sub-files), moving `HomeWorldParams`/`GenerateSystemBodiesParams` into the
  new `types.ts`.
- `system/generation.ts` is now `system/generation/index.ts` with its owning
  parameter types in `system/generation/types.ts`. `system/index.ts` now owns
  the `SYSTEM` namespace, including its generation and Sol-system API.

### Non-violation, but flagged for cleanup

- `moons/placement.ts` was dead code — `moons/index.ts` has the live
  implementations. The duplicate file was removed; its live input types
  remain with the moon domain because the entry point still uses them.

### Checked, no violation found

`orbit-body/types.ts`, `star/types.ts`, `sol-system/data.ts` +
`sol-system/index.ts`, and the genuinely multi-domain shared types
(`MoonBody`, `MoonOrbitRange`, `SystemBody`, `SolarSystemState`) all
already follow the shape/behavior split and barrel-only rules correctly.
