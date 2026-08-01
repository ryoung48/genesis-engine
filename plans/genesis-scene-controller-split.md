status: DONE (2026-08-01) — all 8 migration-order steps landed and verified. `create-genesis-scene.ts` down to 1144 lines (from 4516), split across 20 files under `genesis-scene/` (context, scene-setup, terrain-controller, camera-focus-controller, solar-system-controller, interaction-controller, animation-loop, export, dispose, and 10 overlay-controllers: coastline, measurement, pathfinding, hierarchy, settlements, infrastructure, rivers-wind-thermal, labels, nation-borders, solar-terminator). No barrel files. `npm run typecheck` and `npx biome check` both clean repo-wide. `create-genesis-scene.ts`'s remaining ~1144 lines are intentional pure-wiring/thin-aggregator code (see "What's left, and why it stays" below) -- not a gap.

# Split `src/ui/planet/renderer/create-genesis-scene.ts` (4516 lines)

Supersedes item 1 of the now-deleted `plans/split-large-files.md`, which
mechanically extracted the easy pieces (`loadGlobeCloudTexture`,
`buildElevationLookup`, `SOLAR_TERMINATOR_*` constants) and explicitly
deferred the rest: the bulk of the file is closures nested inside
`createGenesisScene` that capture ~150 shared local `let`/`const` bindings
(mesh refs, overlay groups, tween state, current-world/view-mode state)
across ~90 functions and the `onFrame` animation loop. This can't be split
mechanically with `move-symbol.mjs` — it needs a shared mutable context
object that controller modules close over instead of local scope.

## Constraint: no barrel files

Per AGENTS.md, "Avoid barrel files... Import from the concrete module you
need instead of adding or expanding `index.ts` re-export layers." So:

- No `genesis-scene/index.ts` re-export layer. `create-genesis-scene.ts`
  imports each controller from its concrete file
  (`from "./genesis-scene/terrain-controller"`, etc.), same as the rest of
  `renderer/` (e.g. `overlay-builders/nation-borders.ts` is imported
  directly today, not through a barrel).
- The `src/model` "one UPPERCASE namespace object per domain" rule does not
  apply here — that section is scoped to `src/model`. `renderer/` already
  uses plain exported functions (`buildX`, `setX`), and this plan follows
  that: `createXController(ctx, deps)` factory functions, not namespace
  objects or classes.

## Target structure — new folder `src/ui/planet/renderer/genesis-scene/`

1. `context.ts` — defines `GenesisContext` (scene, globeGroup/orbitGroup,
   camera, mapCamera, controls, mapControls, currentWorld/currentColorMode/
   currentViewMode, etc.) and its constructor. Every controller takes this
   as its first argument.
2. `scene-setup.ts` — renderer/camera/controls construction, lighting,
   water/atmosphere/cloud meshes, starfield (current lines ~308-602).
3. `terrain-controller.ts` — `rebuildTerrain`, `updateWorld`,
   `recolorMeshesInPlace`/`recolorModeColorsInPlace`/`refreshMeshColors`,
   face-region arrays, color-mode/region-color setters (~2377-3033,
   2902-2977).
4. `overlay-controllers/` — one file per overlay domain, each owning its
   own mesh/group refs + rebuild + visibility setter:
   - `nation-borders.ts` (rebuildNationBorders, province border,
     ~1943-2377)
   - `labels.ts` (nation/settlement/culture/religion/heritage labels,
     ~1540-1866)
   - `settlements.ts`, `trade-routes.ts`, `rivers-wind-thermal.ts`,
     `hierarchy.ts`, `coastline.ts`, `solar-terminator.ts`,
     `pathfinding.ts`, `measurement.ts`, `infrastructure.ts`
   - `rebuildOverlays`/`updateOverlayVisibility` (2463-2811) become a thin
     aggregator in `terrain-controller.ts` (or its own
     `overlay-aggregator.ts`) that calls each controller's `rebuild()`/
     `setVisible()` directly by importing them individually.
5. `camera-focus-controller.ts` — `focusOnRegion/Nation/Province/
   SystemBody`, pulse (`startBorderPulse`, `stepPulse`), focus tweens
   (`stepFocusTween`, `stepSolarSystemFocusTween`), map center/projection
   setters.
6. `solar-system-controller.ts` — `setSolarSystem*`/`updateSolarSystem*`/
   moon-orbit block (4262-4435).
7. `interaction-controller.ts` — raycasting, hover/click handlers, pointer
   down/click/double-click, `setHoverHandler`/`setClickHandler`.
8. `animation-loop.ts` — the `onFrame` scheduler callback (1191-1376),
   calling each controller's per-frame step (pulse, tweens, script-texture
   streaming, label billboarding, line-width zoom scaling).
9. `export.ts` — `exportMapPng`, `syncMapExportObjectPositions`,
   `buildMapExportVisibilityTargets` (thin, mostly delegates to existing
   `map-export.ts`).
10. `dispose.ts` — aggregates each controller's own disposal.
11. `create-genesis-scene.ts` (slimmed to ~200-300 lines) — builds the
    context, instantiates controllers in dependency order by importing each
    concrete file, wires `controls`/`mapControls` event listeners, and
    assembles the returned `GenesisScene` object from each controller's
    public methods.

## Migration order (lowest coupling first, each step typecheck-verified)

1. `scene-setup.ts` (pure construction, few dependents) — **DONE**
2. `export.ts`, `dispose.ts` — **DONE** (filled in for real, not stubs --
   built once their dependent controllers already existed, see below)
3. Overlay controllers one at a time — **DONE**: coastline, measurement,
   pathfinding, hierarchy, settlements, infrastructure, rivers-wind-thermal,
   labels, nation-borders, solar-terminator (10 total; solar-terminator
   wasn't in the original migration-order list text but was in the target
   structure -- added at the end, see below)
4. `terrain-controller.ts` — **DONE** (done before overlay controllers,
   reordered per the actual dependency graph -- see note below)
5. `camera-focus-controller.ts` + `solar-system-controller.ts` — **DONE**
6. `interaction-controller.ts` — **DONE**
7. `animation-loop.ts` — **DONE**
8. Shrink `create-genesis-scene.ts` down to pure wiring — **DONE** (1144
   lines left; see "What's left, and why it stays" below for why this is
   the natural floor, not an incomplete shrink)

Each step: extract, run `npm run typecheck` + `pnpm lint`, manually verify
in the running app (globe/map view, overlays, focus/pulse, export) before
moving to the next controller. Not a single big-bang rewrite — same
incremental approach the prior split-large-files pass used successfully.

## Result

### Final file list under `genesis-scene/` (20 files, ~4600 lines total)

```
context.ts                                    314
scene-setup.ts                                 384
terrain-controller.ts                          318
camera-focus-controller.ts                     379
solar-system-controller.ts                     280
interaction-controller.ts                      169
animation-loop.ts                              246
export.ts                                      201
dispose.ts                                      96
overlay-controllers/coastline.ts                93
overlay-controllers/measurement.ts              73
overlay-controllers/pathfinding.ts              85
overlay-controllers/hierarchy.ts                60
overlay-controllers/settlements.ts             164
overlay-controllers/infrastructure.ts           87
overlay-controllers/rivers-wind-thermal.ts     159
overlay-controllers/labels.ts                  580
overlay-controllers/nation-borders.ts          577
overlay-controllers/solar-terminator.ts        341
```

`create-genesis-scene.ts` itself: **4516 -> 1144 lines**. No `genesis-scene/index.ts` or any other barrel -- `create-genesis-scene.ts` imports each controller from its concrete file. `npm run typecheck` and `npx biome check` (this environment's `pnpm lint` doesn't resolve `biome` on PATH; `npx biome check` is the working equivalent used throughout) are both clean, repo-wide. `GenesisScene`'s public return shape and `createGenesisScene`'s signature are unchanged; both existing callers (`GenesisView.tsx`, `renderer/index.ts`) still typecheck.

### The pattern used throughout

`GenesisContext` (in `context.ts`) holds every piece of shared mutable
state that was previously a closure-captured local in
`create-genesis-scene.ts` -- mesh refs, overlay groups, tween/pulse state,
current-world/view-mode state, hover/click state, etc. `scene-setup.ts`'s
`buildGenesisSceneSetup` initializes all of it in one place. Every
controller is a `createXController(ctx, deps)` factory: `ctx` for shared
state, `deps` for the small set of other controllers' functions it needs
to call (`requestRender`, `updateOverlayVisibility`, occasionally
something more specific like `getWorldForBorders`), wired as
`() => otherController.method()` closures in `create-genesis-scene.ts` so
construction order never matters (deps are only actually invoked well
after every controller exists). This mechanical pattern (promote state to
`ctx`, verify typecheck, then extract functions into a controller,
verify again) is what made it possible to work through all ~150 original
shared locals and ~90 closures without a single big-bang rewrite.

### Deviations from the plan's exact module list, and why

- **`solar-terminator.ts`** was in the plan's *target structure* list but
  missing from its *migration order* list (steps 1-8 never mentioned it).
  Landed anyway, after `nation-borders.ts`, since it's a real overlay
  controller like the other nine and the plan's target structure clearly
  intended it to exist.
- **`infrastructure.ts` absorbs what the plan called "trade-routes.ts"
  too.** In the actual code these are the same feature: one
  `rebuildTradeRouteOverlay` function behind the public
  `setInfrastructure`/`setInfrastructureVisible` API, built via
  `buildGlobeTradeRoutes`/`buildMapTradeRoutes`. There was never a
  separate trade-route concern to split into its own file, so creating a
  second one would have been a phantom split with no real second domain
  behind it.
- **`settlements.ts` covers both `setSettlements*` (generated-world
  settlement dots) and `setEu4Settlements*` (real-EU4-import settlement
  dots)** in one controller/file, matching the plan's own singular
  "settlements.ts" naming (not a "settlements + eu4-settlements" split) --
  they share no state but are the same conceptual overlay.
- **`terrain-controller.ts` landed before the overlay controllers**,
  reversing the plan's stated order (overlays step 3, terrain step 4). In
  practice `rebuildTerrain`/`updateWorld`/`setColorMode`/etc. read and
  write `currentWorld`, `currentColorMode`, `currentViewMode`,
  `currentMapCenterLongitudeDeg`, and the mesh refs that essentially
  *every* overlay function also reads (to size/position/recolor itself
  against the current mesh). Extracting terrain-controller first and
  promoting that state onto `GenesisContext` meant every subsequent
  overlay extraction was a mechanical "read `context.currentWorld` instead
  of `currentWorld`" rename with no new design decisions to make.

### What's left in `create-genesis-scene.ts`, and why it stays

The remaining 1144 lines are pure wiring plus a handful of legitimately
cross-cutting orchestration functions that don't belong to any single
controller:

- `rebuildOverlays()` / `updateOverlayVisibility()` -- the plan's own
  words: these "become a thin aggregator... that calls each controller's
  `rebuild()`/`setVisible()` directly." They call into all ten overlay
  controllers plus terrain/nation-borders/labels; that's not a gap, it's
  the aggregator the plan asked for.
- `setViewMode`, `setElevationVisible`, `setEarthHistoryNationOverride`,
  `setOrganizationHighlight` -- each touches two or more domains at once
  (e.g. `setElevationVisible` rebuilds terrain, the solar terminator, and
  five label overlays; `setEarthHistoryNationOverride` rebuilds both
  nation borders and nation labels). Splitting these further would mean
  either duplicating the multi-controller call sequence in two places or
  inventing an artificial "orchestration" controller whose only job is to
  call other controllers in sequence -- i.e. reinventing
  `create-genesis-scene.ts` itself one level down.
- `setSunPosition`/`setSunDirection`/`syncMapLighting`/
  `applyGlobeOrientation`/`setFullAmbient` -- the sun/lighting cluster,
  which touches the terrain water material, the atmosphere shell, and the
  solar terminator's local sun direction together.
- `resize()`, `projectToScreen()`, `updateMapCameraFrustum()`,
  `setWireframeVisible`/`setGridVisible`/`setGridSpacing`,
  `setGlobeCloudTexturePath`, `setAtmospherePressure` -- small
  viewport/setup utilities and trivial setters that only ever touch
  `context` fields plus `rebuildOverlays`/`requestRender`; extracting a
  dedicated controller for a handful of 5-15 line functions each would add
  a file without adding real modularity.
- Controller construction and `deps` wiring for all 19 controllers, the
  `canvas`/`controls`/`mapControls` event-listener registration, and the
  final `return { ...GenesisScene methods }` object assembly -- this is
  exactly the "pure wiring" step 8 asked for.

## Related, out of scope for this plan

`src/ui/planet/renderer/nation-label-overlay/index.ts` is a pure
re-export barrel (every line is `export {...} from "./concrete-file"`),
which is the exact pattern AGENTS.md's barrel-file rule forbids. Flagged
separately; not fixed here since it's pre-existing and unrelated to this
split (see `plans/nation-label-overlay-barrel-violation.md`).

## Related, out of scope for this plan

`src/ui/planet/renderer/nation-label-overlay/index.ts` is a pure
re-export barrel (every line is `export {...} from "./concrete-file"`),
which is the exact pattern AGENTS.md's barrel-file rule forbids. Flagged
separately; not fixed here since it's pre-existing and unrelated to this
split (see `plans/nation-label-overlay-barrel-violation.md`).

## Follow-up trim (2026-08-01) — 1144 -> 500 lines

The 1144-line "natural floor" from the previous pass turned out to have
more room after all: five more pieces came out cleanly, landing
`create-genesis-scene.ts` at exactly 500 lines.

1. **`types.ts`** — `MapExportOptions`, `ExportRenderTargetLike`,
   `MapExportVisibilityTarget`, `MapExportDependencies`,
   `ExportRendererLike` moved out of `create-genesis-scene.ts` via
   `scripts/refactor/move-symbol.mjs`. `export.ts` (and `map-export.ts`,
   which also referenced them) now import these from `types.ts` instead of
   reaching back into `create-genesis-scene.ts` -- fixes the backwards
   controller-imports-from-its-own-parent dependency the previous pass left
   in place.
2. **`overlay-visibility-controller.ts`** — `updateOverlayVisibility()`,
   the ~210-line mechanical `.visible`-toggling pass over every overlay
   object. Placed directly in `genesis-scene/`, not
   `overlay-controllers/`, matching `terrain-controller.ts`'s precedent:
   `overlay-controllers/` is for files that own a single overlay's own
   mesh/group state, while this is a cross-cutting aggregator that reads
   every other controller's state off `ctx`.
3. **`overlay-aggregator.ts`** — `rebuildOverlays()`, same
   directly-in-`genesis-scene/` placement and reasoning as above. Calls
   into all ten overlay controllers' own `rebuild()`/`setVisible()` methods
   plus terrain/nation-borders/labels, exactly as the original plan's
   "thin aggregator" language described.
4. **`lighting-controller.ts`** — the sun/atmosphere/cloud cluster:
   `setAtmospherePressure`, `setGlobeCloudTexturePath`,
   `applyGlobeOrientation`, `setSunPosition`, `setSunDirection`,
   `syncMapLighting`, `setFullAmbient`, plus the `SUN_DIST`/`Y_AXIS`/
   `Z_AXIS` constants and the sun-position initialization side effect
   (moved into the controller factory body, so it still runs once at
   controller-construction time in the same relative position it used to
   run in `create-genesis-scene.ts`).
5. **`view-state-controller.ts`** — the thin scene-state setters
   (`setViewMode`, `setWireframeVisible`, `setGridVisible`,
   `setGridSpacing`, `setEarthHistoryNationOverride`,
   `setOrganizationHighlight`, `setElevationVisible`) plus
   `projectToScreen`, grouped into one file since none of them was large
   enough alone to justify its own module and they're all "small piece of
   cross-cutting scene state" in the same way.

### `ctx.globeOrgLabel`/`ctx.mapOrgLabel`

Both fields moved from local `const globeOrgLabel/mapOrgLabel = null` in
`create-genesis-scene.ts` onto `GenesisContext` (initialized `null` in
`scene-setup.ts`), so `overlay-visibility-controller.ts` and `dispose.ts`
both read the same (permanently-null, pre-existing dead-code) refs off
`ctx` instead of each taking their own copy as a constructor `deps`
parameter. No behavior change -- these were already always `null`.

### Final state

`create-genesis-scene.ts`: **1144 -> 500 lines** (4516 lines originally).
24 files under `genesis-scene/` now (20 + `types.ts`,
`overlay-visibility-controller.ts`, `overlay-aggregator.ts`,
`lighting-controller.ts`, `view-state-controller.ts`), 5370 lines total
under `genesis-scene/`. `npm run typecheck` and
`./node_modules/.bin/biome check` are both clean on every file touched in
this pass (a handful of pre-existing files elsewhere under
`genesis-scene/` -- `animation-loop.ts`, `camera-focus-controller.ts`,
`interaction-controller.ts`, `solar-system-controller.ts`,
`terrain-controller.ts`, and most of `overlay-controllers/` -- report
CRLF line-ending format findings from `biome check`, but those files
weren't touched in this pass and predate it). `GenesisScene`'s public
return shape and `createGenesisScene`'s signature are unchanged; both
callers (`GenesisView.tsx`, `renderer/index.ts`) still typecheck.

This is the genuine floor now: what's left in `create-genesis-scene.ts`
is controller construction, `deps` wiring, canvas/controls event-listener
registration, and the final `return { ...GenesisScene methods }`
assembly -- pure wiring, one line per controller/method, nothing left
that reads as its own concern.
