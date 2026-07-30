status: DONE (2026-07-29). All 13 numbered items below completed or
intentionally left as-is where mechanical extraction wasn't safe/beneficial
(see notes per item). `npm run typecheck` and `npx biome check` are clean for
every file this plan touched. Remaining 500-1000 line files are listed at the
bottom for a future pass.

# Split large files (AGENTS.md size rule)

AGENTS.md (Module conventions, src/model): "Split a domain once its `index.ts`
mixes multiple sub-concerns or grows past ~250-500 lines." This plan targets
the worst offenders at 500+ lines, largest first, as of 2026-07-28. It
supersedes the prior version of this plan — most of that plan's items
(nations/index.ts, import-heightmap/index.ts, GenesisView.tsx folder split)
are already done. Non-`src/model` files aren't covered by the literal rule
(UI has its own `src/ui/components/UI.md`), but the same mixed-concern smell
applies and they're included since they're among the largest files in the
repo.

Use `scripts/refactor/move-symbol.mjs <fromFile> <toFile> <symbol...>` to do
the actual extraction (moves declarations, resolves imports both ends, drops
dead imports, repoints importers) and `scripts/refactor/move-module.mjs` for
whole-file/folder moves.

## Not a target: `src/model/society/infrastructure/trade/trade-goods-table/index.ts` (4883 lines)

Almost entirely one big literal data table (`TRADE_GOODS_TABLE`) plus a
label array — no mixed logic concerns to separate. Leave as-is; line count
here doesn't indicate a real complexity problem.

## 1. `src/ui/planet/renderer/create-genesis-scene.ts` (4535 lines) — highest priority

**DONE (partial, by design):** extracted `loadGlobeCloudTexture` →
`renderer/textures.ts`, `buildElevationLookup` →
`screen/display/region-colors.ts`, `SOLAR_TERMINATOR_*` constants →
`renderer/solar-terminator.ts`. File is now 4492 lines (was 4535/4524).
The remaining bulk is closures nested inside `createGenesisScene`
(`buildSolarTerminatorGroup`, `rebuildSolarTerminator`,
`updateSolarTerminatorLabels`, etc.) that capture dozens of local variables
(`camera`, `globeGroup`, `mapMesh`, mutable overlay-visibility state). These
aren't mechanically extractable with `move-symbol.mjs` — pulling them out
would require re-architecting into a stateful controller/class taking
explicit params, which is a real design task, not a split. Left for a future,
deliberate pass rather than forced here.

Still the single largest logic file. Visible sub-concerns:
- Solar terminator band/label/ring building (`reapplyMeshOverlayState`
  section, `SOLAR_TERMINATOR_*` constants, terminator helpers) →
  `src/ui/planet/renderer/solar-terminator.ts`
- Cloud/texture loading (`loadGlobeCloudTexture`) →
  `src/ui/planet/renderer/textures.ts` (or fold into an existing texture
  helper module if one already exists)
- `buildElevationLookup` — check whether this belongs with the
  elevation/coloring code in `region-colors.ts` instead of the scene builder
- Keep `createGenesisScene` itself (the ~322+ entry point) as the composing
  shell in this file
This is a re-scope of the file since the last plan pass (helper extraction
already happened once, file dropped from 4908 to 4535 lines, but the same
grab-bag shape remains) — read the current file fresh rather than assuming
the old function list still applies.

## 2. `src/ui/planet/controls/OverlayControls.tsx` (1710 lines)

**DONE:** split into `src/ui/planet/controls/OverlayControls/` folder,
by overlay category, each section component taking only the props it needs
(`index.tsx` composing shell 469 lines, plus `MeasureSection.tsx`,
`GridSection.tsx`, `ClockSection.tsx`, `GeographySection.tsx`,
`PoliticalSection.tsx`, `LabelsSection.tsx`, `ClimateToggleSection.tsx`,
`DangerSection.tsx`, `ElevationModeSection.tsx`, `TopographyModeSection.tsx`,
`VegetationModeSection.tsx`, `ClimateModeSection.tsx`,
`ViewExportSection.tsx`, `types.ts`). Existing importers unaffected — the
folder re-exports the same public surface as the old
`@/ui/planet/controls/OverlayControls` path.

Not inspected in detail beyond two top-level formatting helpers
(`formatTravelTime`, `formatTravelRateLabel`) — the bulk of the file is
presumably the component body/JSX. Needs a closer read to find the actual
seams, but the likely split (per the original plan) is by overlay category
(climate overlays, political overlays, terrain overlays) into separate
control sub-components, with `OverlayControls.tsx` becoming a composing
shell. Do this pass properly rather than guessing boundaries from grep.

## 3. `src/ui/planet/GenesisView/useNationWikiData.tsx` (1666 lines)

**DONE:** extracted pure helpers that didn't need per-render hook state into
`GenesisView/nation-wiki-timeline-format.ts` (formatting/merging helpers) and
`GenesisView/nation-wiki-mentions.ts` (mention-object builders), taking
`earthHistory`/`title` as explicit params instead of closing over them.
Hook file now 1393 lines. Remaining logic (`resolveNationName`,
`resolveNationColor`, the main event-loop/useMemo body) stayed in place —
too tightly coupled to per-render state to extract without larger surgery.

Single large exported hook (`useNationWikiData`) with presumably a lot of
inline logic/effects. Needs a read-through to find internal seams (e.g.
data-fetching vs. formatting vs. memoization groups) and extract private
helpers, similar treatment to `elevation/index.ts` below rather than a
sub-folder split, unless multiple independent concerns are found.

## 4. `src/ui/planet/renderer/overlay-builders.ts` (1521 lines)

**DONE** (completed in an earlier pass, before this plan run): now a 22-line
barrel; `overlay-builders/` folder has `nation-borders.ts`, `grid.ts`,
`thermal-equator.ts`, `rivers.ts`, `hierarchy.ts`, `shared.ts`, plus
`wind-arrows.ts`.

Clear sub-concerns visible in the function list:
- `overlay-builders/nation-borders.ts` — `forEachNationBoundarySide`,
  `forEachNationBorderSide`, `collectNationBorderGlobePositions`,
  `collectAllNationBorderGlobePositions`, `collectNationBorderMapPositions`,
  `collectAllNationBorderMapPositions`
- `overlay-builders/grid.ts` — `buildGlobeGrid`, `buildMapGrid`
- `overlay-builders/thermal-equator.ts` — `buildThermalEquatorLine`,
  `buildGlobeThermalEquator`, `buildMapThermalEquator`
- `overlay-builders/rivers.ts` — `buildRiverGroup` and neighbors
- `overlay-builders/hierarchy.ts` — `collectHierarchyNodes`, `depthColor`,
  `rankColor`
- Shared small helpers (`createCircleTexture`, `createLineSegments`,
  `repeatMapPositions`, `appendProjectedSegment`, `unwrapLongitudeSequence`)
  → `overlay-builders/shared.ts`, imported by the above

## 5. `src/ui/planet/screen/display/region-colors.ts` (1501 lines)

**DONE** (completed in an earlier pass): color-mapping helpers
(`basinColor`, `getDynastyColor`, `toPastelNationColor`,
`getTerrainFeatureColor`, `getTopographyColor`) extracted to
`region-colors/palette.ts` (one combined file rather than 4 separate ones —
fine, they're small and related). `computeRegionColors` (the orchestrator)
kept in `index.ts`, which is now ~1410 lines — still large, but that's one
big function (the orchestrator itself), not a mixed-concern grab-bag.

Function list suggests coloring logic split by domain:
- `region-colors/dynasty.ts` — `getDynastyColor`
- `region-colors/basin.ts` — `basinColor`
- `region-colors/nation.ts` — `toPastelNationColor`
- `region-colors/terrain.ts` — `getTerrainFeatureColor`, `getTopographyColor`,
  `hasPartitionElevationBump`, `darkenPartitionAtElevation`
- Keep `computeRegionColors` (the orchestrator) in `index.ts`

## 6. `src/ui/planet/hover/InfoPanel.tsx` (1491 lines)

**DONE** (completed in an earlier pass): `hover/info-panel-rows.tsx` (`Row`,
`SwatchRow`, `MultiSwatchRow`) and `hover/info-panel-labels.ts`
(build*/color helpers) extracted, plus `hover/info-panel-format.ts`. Main
`InfoPanel` component remains in `InfoPanel.tsx` (~1322 lines) — it's one
cohesive JSX component, matches the plan's intent to keep it as-is.

Mix of small presentational components (`Row`, `SwatchRow`,
`MultiSwatchRow`) and label/summary builder functions
(`buildSummary`, `computeLakeAverageAnnualPrecipitation`,
`buildHoverRouteLabel`, `buildHoverPortLabel`, `windSpeedColorCss`). Split:
- `hover/info-panel-rows.tsx` — `Row`, `SwatchRow`, `MultiSwatchRow`
- `hover/info-panel-labels.ts` — the build*/color helper functions
- Keep the main `InfoPanel` component in `InfoPanel.tsx`

## 7. `src/ui/wiki/navigator/GenerationPlanetNavigator.tsx` (1441 lines)

**DONE:** split into `GenerationPlanetNavigator/` folder:
`GenerationPlanetNavigator.tsx` (composing shell, 1136 lines),
`OrbitHeader.tsx` (210), `OrbitChildCard.tsx` (61),
`label-orbit-bodies.ts` (35), `OrbitInsertPlaceholder.tsx` (7). Sole
importer (`src/ui/wiki/GenerationPanel.tsx`) repointed.

Sub-components already named distinctly: `OrbitHeader`, `OrbitChildCard`,
`OrbitInsertPlaceholder`, plus a `labelOrbitBodies` helper and the main
`GenerationPlanetNavigator` export. Split each sub-component into its own
file under a `GenerationPlanetNavigator/` folder (matching the
`GenesisView/` pattern already used elsewhere), keep the top-level export as
the composing shell.

## 8. `src/model/geography/terrain/elevation/index.ts` (1441 lines)

**DONE:** decomposed `_computeLandRegionElevation` (275→72 lines) and
`blendElevation` (330→225 lines) into named `_`-prefixed steps
(`_applyRiftValley`, `_applyPullApartBasin`, `_applyBackArcBasin` — now
shared with `_computeOceanRegionElevation`, deduplicating what had been an
identical block — `_computeTectonicActivity`, `_applyFoldRidges`,
`_applyLandNoise`, `_applyMountainDetail`,
`_applyInteriorAndPlateauUplift`, `_computeTectonicBfsFields`,
`_runMainElevationLoop`, `_applyPostProcessingArcs`), matching the file's
existing helper-decomposition convention. Param/result types added to
`types.ts`. File grew (1441→1626 lines total across index.ts+types.ts more
than that, since this was function decomposition with doc comments, not
concern-splitting across files) — net line count isn't the goal here, named
steps replacing giant functions is. `npm run gen:world` smoke test verified
no behavior change (one unrelated pre-existing failure in
`society/urbanization/index.ts`, untouched by this change).

Same shape of problem as the last plan pass: a handful of huge functions
(`_computeLandRegionElevation` ~275 lines, `_computeOceanRegionElevation`
~128 lines, `_applyCoastalRoughening` ~134 lines, `_computeIslandArcs` ~80
lines, `blendElevation` ~330 lines) rather than many mixed concerns. Already
has good `_`-prefixed private helper decomposition for the BFS passes —
continue that pattern by pulling further self-contained steps out of
`blendElevation` and `_computeLandRegionElevation` specifically, since those
two are now the largest remaining blocks.

## 9. `src/ui/planet/renderer/solar-system-overlay.ts` (1260 lines)

**DONE** (completed in an earlier pass): `solar-system-overlay/textures.ts`
and `solar-system-overlay/asteroid-field.ts` extracted.
`buildSolarSystemOverlay` (the entry point, intentionally kept per plan) and
sizing helpers remain in `index.ts`, ~1066 lines.

Visible seams:
- `solar-system-overlay/textures.ts` — `loadGrayscaleSunTexture`,
  `createStarGlowTexture`, `loadBodyTexture`, `withAlpha`
- `solar-system-overlay/asteroid-field.ts` — `buildAsteroidField`,
  `updateAsteroidField`
- Keep `buildSolarSystemOverlay` (entry point) and body-sizing helpers
  (`bodyDisplayName`, `bodySceneRadius`, `measureBodyMoonSystemOuterRadius`)
  in `index.ts`

## 10. `src/ui/planet/colors.ts` (1208 lines)

**DONE** (completed in an earlier pass): `colors/elevation.ts`,
`colors/temperature.ts`, `colors/precipitation.ts`, `colors/vegetation.ts`,
`colors/misc.ts` extracted. `colors.ts` is now 622 lines — the remainder is
hazard/stat color functions (`dangerColor`, `tornadoLandColor`,
`tidalTierColor`, `cycloneLandColor`, `earthquakeLandColor`,
`volcanicLandColor`, `hotspotColor`, `populationColor`, `migrationColor`,
`developmentColor`, `dtrColor`, `humidityColor`, `miseryColor`,
`slopeColor`, `windSpeedColor`, `getColor`) that weren't in this plan's
original scope — reasonable to leave as-is at this size.

Large flat set of independent color-mapping functions (temperature,
precipitation, climate zone, vegetation, ocean current, elevation). Split by
domain rather than keeping one grab-bag file:
- `colors/elevation.ts` — `hex`, `elevationToColor`, `grayscaleColor`
- `colors/temperature.ts` — `temperatureColor`, `temperatureDeltaColor`,
  `temperatureDifferenceColor`, `climateTempColor`
- `colors/precipitation.ts` — `interpolatePrecipitationStops`,
  `precipitationMonthlyColor`, `precipitationAnnualColor`,
  `precipitationColor`, `precipitationDifferenceColor`,
  `moistureDirectionalColor`
- `colors/vegetation.ts` — `vegetationColor`, `vegetationMapColor`,
  `vegetationSatelliteColor`
- `colors/misc.ts` — `daylightColor`, `climateZoneColor`, `oceanCurrentColor`,
  `midpoint`
- `colors.ts` becomes a barrel re-exporting the above (or callers get
  repointed directly per AGENTS.md import-alias conventions — check which
  pattern the rest of `src/ui/planet` uses before choosing)

## 11. `src/ui/planet/renderer/nation-label-overlay.ts` (1076 lines)

**DONE** (completed in an earlier pass): `nation-label-overlay/pool.ts`,
`nation-label-overlay/positioning.ts`, `nation-label-overlay/nation-lookup.ts`
extracted. `index.ts` now 845 lines — styling helpers and the various
`build*NationLabels`/`build*PartitionLabels`/`build*HeritageLabels`/
`build*SettlementLabels` entry points remain (no single "main entry",
multiple related label builders — acceptable at this size).

Split:
- `nation-label-overlay/pool.ts` — `createLabelPool`,
  `createNationLabelPools`, `ensurePoolSize`, `hideUnusedPool`,
  `disposePool`, `createLabelLeaderLine`, `prepareLabelGroup`
- `nation-label-overlay/positioning.ts` — `labelPositionGlobe`,
  `labelPositionMap`, `orientGlobeLabel`, `globeLabelStubLength`,
  `globeLabelTangentOffset`, `localCameraQuaternion`, `computeLabelScale`,
  `updateLabelLeaderLine`
- `nation-label-overlay/nation-lookup.ts` — `nationCapitalRegion`,
  `nationCapitalProvince`, `nationProvinceCount`
- Keep styling (`applyGlobeLabelStyle`, `applyMapLabelStyle`) and the main
  overlay entry point in `index.ts`

## 12. `src/model/society/script/runegen/rune/index.ts` (1039 lines)

**DONE:** confirmed no `class Rune` exists — already namespace-style, so
this was a pure line-count split. Extracted `rune/geometry.ts` (455 lines:
`_coin`, `_countNeighbours`, `_canPlaceDot`, `_placeDots`,
`_countInkBlobs`, `_isConnected`, `_isSymmetric`, `_buildStrokes`) and
`rune/templates.ts` (366 lines: `_random1`/`_random2`/`_random4`/`_random5`,
`_cursive`, `_selectRandomTemplate`, `_resolveTemplate`, `_applyTemplate`,
`_applyMotif`). `index.ts` now 246 lines: `generate`, `diff`, `_getWeight`,
mirror/rotate transforms, and the `RUNE` export.

Carried over from the last plan unresolved: `class Rune` (if still present)
needs a `[JUSTIFICATION]` comment per AGENTS.md's class-usage rule, or
conversion to a `RUNE` namespace object — check current file state, this may
already be a namespace object now given the visible `_random1`..`_random5`,
`_cursive` function style. If it's already namespace-style, this item is
just a line-count split:
- `rune/templates.ts` — `_random1`..`_random5`, `_cursive`,
  `_selectRandomTemplate`, `_resolveTemplate`, `_applyTemplate`, `_applyMotif`
- `rune/geometry.ts` — `_coin`, `_countNeighbours`, `_canPlaceDot`,
  `_placeDots`, `_countInkBlobs`, `_isConnected`, `_isSymmetric`,
  `_buildStrokes`
- Keep `generate`, `diff`, `_getWeight` in `index.ts`

## 13. `src/model/history/generated/state/index.ts` (1028 lines)

**DONE:** split into `state/relations.ts` (38 lines), `state/hierarchy.ts`
(98 lines), `state/wealth.ts` (23 lines), `state/time.ts` (19 lines), per
the plan's function grouping (verified against current file, unchanged from
plan). `index.ts` now 876 lines: state-construction entry points
(`createHistoryState`, `spawnLeader`, `initDynasties`), war lifecycle
(`startWar`, `createActiveWar`, `resolveWar`, etc.), and the `STATE`
namespace export.

Function list shows clear sub-domains already implicit in naming:
- `state/relations.ts` — `getRelation`, `setRelation`, `getRulerRelation`,
  `getSovereign`, `isSovereign`
- `state/hierarchy.ts` — `getChildren`, `getNationProvinces`,
  `getNationNeighbors`, `getProvinceNeighbors`, `validateParentArray`,
  `validateLiveHierarchy`, `rebuildAssignment`
- `state/wealth.ts` — `wealthOptimal`, `wealthCurrent` and any other
  wealth-prefixed functions further down the file (re-check past line 248)
- `state/time.ts` — `deltaYear`, `deltaMonth`, `diffYears`,
  `makeTimelineArray`
- Keep the state-construction entry points in `index.ts`

## Files at 500-1000 lines (lower priority, not detailed here)

Flagged for a later pass once the above are done — re-run the line-count
survey at that point since several will shrink or shift from splits above:
`post-elevation/index.ts` (931), `body-stat-cards.tsx` (907), `hover.ts`
(900), `tidal-schedule/index.ts` (878), `ocean-currents/index.ts` (843),
`pasta/index.ts` (826), `terrain/erosion/index.ts` (820),
`GenerationPanel.tsx` (804), `WikiTimeline.tsx` (756),
`languages/clusters/index.ts` (750), `generate-world/index.ts` (741),
`tectonics/plates/index.ts` (737), `sol-system/data/index.ts` (731),
`genesis.worker.ts` (728), `useMapColoring.ts` (669),
`useSolarSystemBodies.ts` (668), `terrain/provinces/index.ts` (665),
`eu4-nation-fill-overlay.ts` (624), `import-heightmap/index.ts` (615),
`climate/rain/index.ts` (608), `mesh-builders.ts` (607),
`eu4-nation-border-overlay.ts` (603), `PlanetDetailTabs.tsx` (597),
`builder/consonants/index.ts` (595), `event-description.ts` (586),
`useWorldGeneration.ts` (586), `settlement-overlay.ts` (578),
`generate-default-world.smoke.test.ts` (572, a test file — likely fine to
leave large since tests don't carry the same mixed-concern cost),
`nations/index.ts` (562, already once-split — re-check what grew back),
`useOrganizationWikiData.ts` (561), `names/index.ts` (550),
`hotspots/index.ts` (539), `info-panel-model.ts` (535),
`moon-orbit-overlay.ts` (516), `earth-assets.ts` (515),
`useWorldDisplayData.ts` (505).

## Suggested order (historical — all items above are now done)

1. `create-genesis-scene.ts` (#1) — largest, highest impact
2. `overlay-builders.ts` (#4) and `region-colors.ts` (#5) — clean sub-folder
   splits, do together since they're related (both feed the renderer)
3. `nation-label-overlay.ts` (#11) and `solar-system-overlay.ts` (#9) —
   same renderer folder, similar shape
4. `colors.ts` (#10) — independent, low risk
5. `InfoPanel.tsx` (#6) and `GenerationPlanetNavigator.tsx` (#7) — UI
   component splits
6. `state/index.ts` (#13) — model layer, do before touching more UI
7. `Rune` class/namespace check (#12) — small, isolated
8. `elevation/index.ts` internal decomposition (#8)
9. `OverlayControls.tsx` (#2) and `useNationWikiData.tsx` (#3) — need a
   closer read first to find real seams, so scope these last
10. Re-run the 500+ line survey and revisit the 500-1000 line list
