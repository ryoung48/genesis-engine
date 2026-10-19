# WebGCM on existing Chaos Machine cells

The local native-grid integration provides world export, a WebGPU simulation worker, map overlays, hover information, run/pause controls and downloadable checkpoints. It retains cell IDs, centers, polygon vertices, adjacency, land/water labels and elevations. It does not regularize, retriangulate or rasterize the world.

**The numerical port has a known instability on a tested procedural world with terrain.** The 3,001-cell run develops excessive upper-atmosphere winds and non-finite state within six simulated hours. It is an integration prototype, not a reliable climate predictor. Some unported diffusion and drag closures are disabled. See [numerical implementation and limitations](webgcm-native-numerics.md).

An alternative [geodesic-atmosphere/native-island experiment](webgcm-island-coupling.md) tests preserving the original land cells through conservative polygon overlaps and separate surface columns. It is a standalone experiment, not an enabled simulation backend.

## Run a world

1. In the Chaos Machine world viewer, expand **Export**, select **Native GCM**, then choose **Export native GCM world**. The file ends in `.gcmworld`.
2. From the repository root, start the local viewer:

   ```powershell
   node scripts/webgcm-native/server.mjs
   ```

3. Open [the native GCM viewer](http://localhost:8767). Choose the world file. The model initializes in a worker and starts paused.
4. Use **Advance one minute** or **Run**. **Pause** takes effect after the current batch. Overlays show the original land mask, surface skin temperature, lowest-layer wind speed, rain rate, ocean temperature or surface current speed. Hover shows the native cell ID and basic climate fields.

**Test procedural fixture** starts a small mesh without exporting a world. Physics and calendar remain Earth-like. Exported radius and rotation affect geometry and Coriolis; other planetary physics is not generalized by this integration.

## Water depths and coastlines

The explicit cell mask is passed directly to the model. Water flows across an edge only when both cells are water. Earth land-bridge, strait and ice-sheet presets are not applied.

Sea depth comes from negative physical elevation, with WebGCM's existing 50 m minimum. Water cells above sea level have no ocean bathymetry in this export: choose their **Inland water depth** before loading. The displayed default is 50 m. This changes the assumed water-column depth, not the cell's land/water label. Closed inland basins retain their existing connectivity; a separate freshwater-lake physical model is not implemented.

## Checkpoints

Pause, then choose **Download checkpoint**. Load the resulting `.gcmcheckpoint` through the same file picker to resume. It includes native geometry, geography, depths, time, GPU state, land state and scheduling counters. It uses mesh/configuration identity and buffer-layout checks rather than a geodesic subdivision number. Files can be large because the state includes all vertical layers and GPU buffers.

Checkpoint compatibility is limited to the current implementation and matching GPU layout. The test checks restored fields and the next advancement against an uninterrupted run.

## Files

- `src/model/climate/export/webgcm/native/`: tracked export and shared typed-array packet format.
- `src/ui/genesis/view/useMapExport.ts` and `src/ui/genesis/controls/OverlayControls/ViewExportSection.tsx`: export controls.
- `scripts/webgcm-native/`: tracked adapter, CPU/GPU sessions, shader transformations, worker, viewer and checks.

The installed WebGCM checkout is ignored by Git; the custom integration is tracked under `scripts/webgcm-native`. Preserve the installed dependency separately when moving machines. This port was developed against checkout `ddd18f37c076e9f465ba36e52bb59789b6319b1b` plus its local modifications; source-anchor checks reject incompatible versions. The existing [raster terrain export](webgcm-terrain-export.md) remains a separate option.

## Verification

From the repository root:

```powershell
pnpm exec vitest run --project smoke src/test/earth/webgcm-native-export.smoke.test.ts src/test/earth/webgcm-export.smoke.test.ts
node --test scripts/webgcm-native/native-grid.test.mjs scripts/webgcm-native/session.test.mjs scripts/webgcm-native/packet.test.mjs
node --test scripts/webgcm-native/state-health.test.mjs
node scripts/webgcm-native/browser-check.mjs
pnpm typecheck
```

The browser check requires the native server, Playwright and installed Chrome at the path in that script. It checks actual GPU operators against CPU references, model advancement, checkpoint restore/resume, polar rendering and, when available, a saved procedural-world cache. Reports and screenshots are saved under `stats/climate/<timestamp>-native-gcm/`.

For longer diagnostics, run `node scripts/webgcm-native/validate.mjs 24` for the small fixture, or append a `.gcmworld` file or cached serialized world path. Add `--flat` for a control that removes atmospheric terrain while retaining the cell mesh, labels and original ocean depths. This flag applies only to the diagnostic run, not to exports or the viewer. Reports include hourly fields, fastest-wind location, model diagnostics, timing and adapter source hashes under `stats/climate/<timestamp>-native-validation/`. A completed report means the finite-state checks passed for that run; it does not certify realistic weather or energy conservation.

TypeScript changes also require `pnpm lint`. During concurrent repository work, scope that rewriting command to the changed native-export and UI files so it does not alter another agent's files.
