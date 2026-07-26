# Fix missing namespace objects in celestial sub-domains

Audit pass over `src/model/celestial/` against AGENTS.md's module conventions
found a recurring violation distinct from (and in addition to) the shims
already covered in `fix-passthrough-barrel-shims.md`: real sub-domains (own
folder + `types.ts`) whose `index.ts` exports raw free functions instead of
an UPPERCASE namespace object. Per AGENTS.md: "The barrel is the entry
point, not a pass-through — `index.ts` should export the domain's namespace
object, not just re-export free functions/constants... with no namespace
wrapping them."

## Violations — missing namespace object

Each of these is a folder with its own `types.ts`, so each qualifies as a
real sub-domain per rule 39/32, but its `index.ts` exports bare functions:

1. `planet/environment/atmosphere/index.ts` — exports `atmosphereCodeToProfile`.
   Should export `ATMOSPHERE = { codeToProfile: ... }` (or similar).
2. `planet/environment/density/index.ts` — exports `buildDensityProfile`, `rollAlbedo`.
   Should export `DENSITY`.
3. `planet/environment/temperature/index.ts` — exports `deviationToCelsius`,
   `auFromTemperature`, and 3 more. Should export `TEMPERATURE`.
4. `planet/environment/classification/dice-table/index.ts` — exports
   `rollClassificationAssignment`. Should export `DICE_TABLE` (or fold into
   parent `classification` namespace — see `fix-passthrough-barrel-shims.md`
   which is already restructuring this folder).
5. `planet/environment/classification/hydrosphere/index.ts` — exports
   `hydrosphereCodeFromWaterPct`, `buildHydrosphereProfile`,
   `hydrosphereWaterFraction`. Should export `HYDROSPHERE`.
6. `planet/seismology/heating/index.ts` — exports `computeResidualHeating`,
   `computeMoonTidalHeating`, `computeMoonTidalHeatingRaw`. Should export `HEATING`.
7. `planet/seismology/reclassify/index.ts` — exports `describeRegime`,
   `pickHeatedClass`, `nextSeismologyClass`. Should export `RECLASSIFY`.
8. `planet/size-class/index.ts` — exports `estimateRockySizeClass`,
   `estimateGasGiantSizeClass`, `estimatePlanetarySizeClass`. Should export
   `SIZE_CLASS`.
9. `moons/mechanics/index.ts` — exports 9 raw functions. Should export
   `MECHANICS`. Also violates the types.ts/index.ts split (rule 34):
   `interface MoonPeriodBounds` and `OrbitalPosition` are declared inline in
   `index.ts` (lines ~104, ~110) instead of `types.ts`.

**Fix for each:** wrap the existing exported functions in a single
UPPERCASE namespace object matching the folder name, update all call sites
(`FOLDER.fn(...)` instead of bare `fn(...)`), and keep only the namespace
object exported (per rule 37 — no destructured re-export alongside it). For
`moons/mechanics/index.ts`, additionally move `MoonPeriodBounds` and
`OrbitalPosition` into `mechanics/types.ts`.

## Compounding structural smell — flat file shadows folder of same name

`planet/` has three flat files sitting beside folders of the same name,
each itself a re-export shim with no namespace — the same
flat-file-shadows-sibling-folder pattern already flagged and being fixed for
`system/sol-system.ts` in `fix-passthrough-barrel-shims.md`:

- `planet/environment.ts` beside `planet/environment/` — re-exports plus adds
  free functions `classifyGroup`, `classifyBody`, `buildClassificationEnvironment`
  (lines 29-39 re-export, no `ENVIRONMENT` namespace).
- `planet/seismology.ts` beside `planet/seismology/` — re-exports free
  functions (lines 8-11), no `SEISMOLOGY` namespace.
- `planet/environment/classification.ts` beside
  `planet/environment/classification/` — pure 4-line re-export shim. (Already
  scheduled for removal in `fix-passthrough-barrel-shims.md` item 1.)

**Fix:** once the sub-folder namespaces above exist (`ATMOSPHERE`,
`DENSITY`, `TEMPERATURE`, `HYDROSPHERE`, `HEATING`, `RECLASSIFY`), fold
`environment.ts` and `seismology.ts`'s own logic into `ENVIRONMENT` and
`SEISMOLOGY` namespace objects respectively, delegating to the sub-domain
namespaces rather than re-exporting their members directly — matching the
pattern rule 40 describes for a split domain's parent file. `tide-lock.ts`
has no sibling folder yet but is a real sub-concern per rule 39 and should
be promoted to `planet/tide-lock/{index.ts,types.ts}` with a `TIDE_LOCK`
namespace at the same time, for consistency.

## `SystemBody` re-declares fields already on `OrbitBody` (types.ts/index.ts split smell)

`system/types.ts`'s `SystemBody extends OrbitBody` (`orbit-body/types.ts`)
re-declares ~10 fields that already exist on `OrbitBody` — `sizeClass`,
`density`, `group`, `classification`, `atmosphere`, `siderealDayHours`,
`longitudeOfPerihelionDeg`, `axialTiltDeg`, `inclinationDeg`,
`longitudeOfAscendingNodeDeg`, `diameterKm`, `massKg` — purely to narrow them
from optional (on the shared leaf type) to required (once a body is fully
generated). This isn't a barrel/namespace rule violation, but it's the same
kind of smell rule 34 is aimed at: a field's shape and its doc comments end
up split across two files, so knowing a `SystemBody`'s actual required shape
means checking both `orbit-body/types.ts` and `system/types.ts`.

Contrast with `moons/types.ts`'s `MoonBody extends OrbitBody`, which adds
only its 3 moon-specific fields (`meanAnomalyAtEpochDeg`, `orbitRange`,
`semiMajorAxisPlanetDiameters`) and inherits everything else from
`OrbitBody` untouched — no re-declaration. `MoonBody` is the clean version
of the same "planet/moon extends the shared leaf" pattern; `SystemBody`'s
extra required-narrowing is the odd one out.

**Before fixing:** confirm each of the ~10 narrowed fields is actually
always populated by the time a `SystemBody` exists (i.e. the narrowing is
doing real work) rather than being copied along for no reason.

**Fix, if confirmed:** stop re-declaring already-required-in-practice
fields on `SystemBody`. Either leave them optional on `OrbitBody` and don't
repeat them on `SystemBody` at all (relying on call-site knowledge that a
fully-generated `SystemBody` has them), or express the narrowing
structurally instead of by hand — e.g.
`type SystemBody = Omit<OrbitBody, typeof narrowedFieldNames[number]> & Required<Pick<OrbitBody, typeof narrowedFieldNames[number]>> & { seed: string; rings?: RingProfile; ... }`
— so the field list and its doc comments live in exactly one place
(`orbit-body/types.ts`), and `system/types.ts` only adds what's genuinely
planet-only (`seed`, `rings`, `isMainWorld`, `orbitalDistanceAU`, `gravityG`,
`moons`, `internalHeatTempK`).

## Multi-param functions (rule 27) — 12 real call sites to convert

`biome-ignore lint/nursery/useMaxParams: pending domain params-object
conversion` marks these as already-known debt, but AGENTS.md rule 27 has no
exemption for lint-ignored code — the ignore comment just silences the
linter, it doesn't satisfy the rule. (The *other* `useMaxParams` ignores in
these files, tagged `native Array callback signature`, are the genuine rule
27 exception for `sort`/`reduce`/`map` callbacks — those are correctly out
of scope and are not listed below.)

Convert each to a single object parameter, typed in that file's (or
domain's) `types.ts`:

1. `system/sol-system/index.ts:30` `estimateGasGiantInternalHeatTempK(massEarths, ageGyr)`
   → `estimateGasGiantInternalHeatTempK({ massEarths, ageGyr })`.
2. `system/sol-system/index.ts:52` `buildMoon(seed, idx, seedTag)`
   → `buildMoon({ seed, idx, seedTag })`. Update the call site at line 142
   (`(moonSeed, i) => buildMoon(moonSeed, i + 1, seedTag * 100 + i + 1)`).
3. `system/sol-system/index.ts:117` `buildPlanet(seed, seedTag, idx, options?)`
   → `buildPlanet({ seed, seedTag, idx, options? })`. Update the call site at
   line 244 (`(seed, i) => buildPlanet(seed, i + 1, seed.isMainWorld ? -1 : i)`).
4. `system/generation/rolls.ts:9` `rollOrbitGroup(rng, zone)`
   → `rollOrbitGroup({ rng, zone })`.
5. `system/generation/rolls.ts:57` `rollSizeClass(rng, group)`
   → `rollSizeClass({ rng, group })`.
6. `system/generation/rolls.ts:69` `rollDiameterKmFromSizeClass(rng, sizeClass)`
   → `rollDiameterKmFromSizeClass({ rng, sizeClass })`.
7. `system/generation/rolls.ts:137` `rollDensityFromComposition(rng, composition)`
   (private helper) → `rollDensityFromComposition({ rng, composition })`.
8. `system/generation/rolls.ts:157` `pickDensityEarthRelative(rng, group, classification, composition?)`
   → `pickDensityEarthRelative({ rng, group, classification, composition? })`.
9. `system/generation/rolls.ts:241` `rollSiderealDayHours(rng, isJovian, starAgeGyr)`
   → `rollSiderealDayHours({ rng, isJovian, starAgeGyr })`.
10. `system/generation/texture.ts:32` `pickGeneratedTexturePath(rng, classification)`
    → `pickGeneratedTexturePath({ rng, classification })`.
11. `system/generation/star-identity.ts:14` `getStarAgeGyr(seed, massSol)`
    → `getStarAgeGyr({ seed, massSol })`.
12. `system/generation/environment/index.ts:237` `enforceMoonTidalSafety(rng, parentMassKg, parentDiameterKm, moon)`
    → `enforceMoonTidalSafety({ rng, parentMassKg, parentDiameterKm, moon })`.

All 12 are called from `system/generation/index.ts` (directly or via the
`rolls.ts`/`texture.ts`/`star-identity.ts`/`environment/index.ts` imports it
pulls in) — update every call site there in the same pass so the file never
sits with a mix of converted/unconverted signatures. Delete the
`// biome-ignore ... pending domain params-object conversion` comments once
converted; the `native Array callback signature` ignores stay as-is.

## `system/generation/index.ts` split (rule 40, 587 lines)

Currently one file mixing four sub-concerns:
- **Sol-seed path** (lines 78-169): `buildMainWorldSeed`, the `seed === SOL_SEED`
  branch of `generateSystemBodies`.
- **Procedural system/body generation** (lines 171-460ish): slot rolling,
  per-body classification/density/rotation, the big `slots.map(...)` body.
- **Moon generation within that map** (lines 360-441): moon environment,
  tide-lock, tidal-safety enforcement per moon — nested inside the body loop.
- **Sol-system re-exports** (line 39): `export { generateStarName, getStarAgeGyr } from "./star-identity"`,
  unrelated plumbing riding along in the same file.

**Fix:** split into sub-folders under `system/generation/`, each with its own
`{index.ts,types.ts}` and namespace object, with `generation/index.ts` kept
as the thin entry point re-exporting/delegating:
- `generation/sol-seed/` — `buildMainWorldSeed` and the Sol-seed branch,
  namespace `SOL_SEED_BODIES` (or fold into the existing `sol-system` domain
  if that's a closer fit — decide during implementation).
- `generation/body/` — the slot-rolling and per-body generation loop,
  namespace `BODY_GENERATION`.
- `generation/moon-placement/` — the moon-environment/tide-lock/tidal-safety
  block currently nested in the body loop, namespace `MOON_PLACEMENT`,
  called from `BODY_GENERATION`.
- Drop the `export { generateStarName, getStarAgeGyr } from "./star-identity"`
  re-export shim from `generation/index.ts`; callers should import
  `star-identity`'s (future) namespace directly per the barrel-only rule,
  not through `generation`.

Do this split *after* the params-object conversion above, so call sites
aren't touched twice.

## Suggested order of work

1. Land `fix-passthrough-barrel-shims.md` first (removes/relocates the pure
   shim files this plan builds on top of).
2. Add namespace objects to the 9 sub-folder barrels listed above, updating
   call sites domain-by-domain (atmosphere → density → temperature →
   classification/dice-table + hydrosphere → seismology/heating →
   reclassify → size-class → moons/mechanics).
3. Fold `planet/environment.ts` and `planet/seismology.ts` into
   `ENVIRONMENT`/`SEISMOLOGY` namespaces delegating to the new sub-namespaces.
4. Promote `planet/tide-lock.ts` to a `tide-lock/` submodule with a
   `TIDE_LOCK` namespace.
5. Convert the 12 multi-param functions above to single object parameters.
6. Split `system/generation/index.ts` into `sol-seed/`, `body/`, and
   `moon-placement/` sub-folders as described above.
7. Investigate and, if confirmed, fix the `SystemBody`/`OrbitBody`
   field-redeclaration smell above.
8. Run `pnpm lint` and `pnpm typecheck` after each domain's conversion, not
   just at the end.
