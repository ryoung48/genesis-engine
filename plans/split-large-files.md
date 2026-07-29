# Split large files (AGENTS.md size rule)

AGENTS.md (Module conventions, src/model): "Split a domain once its `index.ts`
mixes multiple sub-concerns or grows past ~250-500 lines." This plan targets
the worst offenders, largest first. Non-`src/model` files aren't covered by
that literal rule (UI has its own `src/ui/components/UI.md`), but the same
mixed-concern smell applies and they're included since they're the largest
files in the repo by a wide margin.

Use `scripts/refactor/move-symbol.mjs <fromFile> <toFile> <symbol...>` to do
the actual extraction (moves declarations, resolves imports both ends, drops
dead imports, repoints importers) and `scripts/refactor/move-module.mjs` for
whole-file/folder moves.

## 1. `src/ui/planet/GenesisView.tsx` (8566 lines) — highest priority

Two distinct problems:
- Lines ~254-1200: ~35 free helper functions (timeline formatting, rebel/ruler
  label formatting, export-filename building, EU4 date bracket lookup, color
  helpers) sitting above the component with no grouping. These aren't
  component-specific — extract into focused modules, e.g.:
  - `src/ui/wiki/nation/timeline-formatting.ts` (formatRebel*, subjectType*,
    joinWithAnd, pluralize*, timelineTypeColor, eventComment)
  - `src/ui/planet/export/map-export-naming.ts` (sanitizeExportIdentity,
    buildMapExportFilename, buildExportTimestamp)
  - `src/ui/planet/export/eu4-date.ts` (hydeTimeToEu4Days, findSortedTimeBracket)
- Line 1204 onward (~7300 lines): a single `GenesisView` component. Needs to
  be broken into sub-components/hooks by concern (map/scene wiring, overlay
  state, playback/timeline state, export flow, wiki panel wiring). This is
  the biggest single effort in this plan — do it after the helper extraction
  above shrinks the file, then split the component itself into a
  `GenesisView/` folder with one file per concern and `GenesisView.tsx` left
  as the composing shell.

## 2. `src/ui/planet/renderer/create-genesis-scene.ts` (4908 lines)

Grab-bag of scene-building concerns already visible in its function list:
solar terminator band/label/ring (`createSolarTerminatorBand`,
`createSolarTerminatorLabelSprite`, `getSolarTerminatorLabelText`,
`buildSolarTerminatorRingPoints`, `projectSolarTerminatorPointsToMap`), map
PNG export (`renderMapExportPng`, `applyMapExportVisibility`,
`addMapSlideClones`, `linearChannelToSrgb8`), texture loading
(`loadGlobeCloudTexture`), and general canvas drawing (`drawRoundedRect`).
Split into:
- `src/ui/planet/renderer/solar-terminator.ts`
- `src/ui/planet/renderer/map-export.ts`
- keep scene assembly itself in `create-genesis-scene.ts`

## 3. `src/model/society/nations/index.ts` (1416 lines)

Clear sub-concerns visible in the function list, matching AGENTS.md's
"split into sub-folder/{index.ts,types.ts}, parent delegates" pattern:
- `nations/placement/` — `nationPlacementScore`, `continentPlacementBonus`,
  `bestClaim`, `claimProvinceDynamic`, `selectSeed`, `provinceSeedDistance`,
  `buildOpenComponents`, `markBlocked`
- `nations/colonial/` — `assignColonialRelations`
- `nations/government/` — `getGovIdx`, `govFamilyOfIndex`,
  `assignGovernmentType`, `refineGovernmentSubtype`
- `nations/coloring/` — `groupByNation`, `nationColorsFromProvinces`,
  `buildNationColorCandidates`, `colorDistance`
- Keep `computeNations`, `printNationDistribution`, `buildNationPlan`,
  `spreadBucketSizes`, `integerMass`, `emptyPartition` in `nations/index.ts`
  as the orchestrating entry point (`NATIONS` namespace object), delegating
  to the sub-domain namespace objects above.
- Also: `computeNations`'s inline `params: {...}` object (line 40) has ~9
  optional fields with no `[JUSTIFICATION]` comments — fix while touching it.

## 4. `src/model/pipelines/import-heightmap/index.ts` (1135 lines)

Sub-concerns visible in the function list:
- `import-heightmap/sampling/` — `sampleBilinear`, `grayscaleToElevation`,
  `sampleHeightmap`, `sampleSingleBandFloatRaster`, `sampleCoastlineMask`,
  `sampleCategoricalRaster`
- `import-heightmap/real-earth-data/` — `attachObservedEarthHumidity`,
  `buildRealRiversData`, `matchRealLakeNames`, `resolveRealProvinceSeeds`,
  `pointInRing`, `mergeEu4LandMask`, `reconcileElevationWithMask`
- Keep `importGenesisWorld` (the orchestrating pipeline function) and
  `createTimingRecorder` in `index.ts` as the entry point.

## 5. `src/model/geography/terrain/elevation/index.ts` (1052 lines, only 4 functions)

Different shape of problem: not many mixed concerns, just two enormous
functions (`computeDistanceFields`, `blendElevation`). Needs internal
decomposition (extract named helper steps out of each function body) rather
than a sub-folder split — read both functions and pull out any
self-contained steps (e.g. BFS distance-field passes, blend-weight
calculation) into private `_`-prefixed helpers or, if reused elsewhere, a
`shared/` module.

## 6. `src/model/society/script/runegen/rune/index.ts` (1032 lines)

`class Rune` (line 46) has no comment justifying why it's a class instead of
the standard UPPERCASE namespace object — AGENTS.md requires this for every
class. Either add a `[JUSTIFICATION]`-style doc comment explaining the
need for instance state/methods, or convert to a `RUNE` namespace object
operating on a plain data type. Resolve this before/independent of any line-
count split.

## 7. `src/ui/planet/controls/OverlayControls.tsx` (1710 lines)

Not inspected in detail yet — flag for a follow-up pass once the above are
done, likely splittable by overlay category (climate overlays, political
overlays, terrain overlays) into separate control sub-components.

## Suggested order

1. `nations/index.ts` split (clearest concern boundaries, moderate size)
2. `import-heightmap/index.ts` split (clear boundaries)
3. `Rune` class justification/conversion (small, isolated fix)
4. `elevation/index.ts` internal decomposition
5. `GenesisView.tsx` helper extraction, then component split (largest effort)
6. `create-genesis-scene.ts` split
7. `OverlayControls.tsx` — scope after the above
