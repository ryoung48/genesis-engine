# WebGCM on existing Chaos Machine cells

The local native-grid integration provides world export, a WebGPU simulation worker, map overlays, hover information, run/pause controls and downloadable checkpoints. It retains cell IDs, centers, polygon vertices, adjacency, land/water labels and elevations. It does not regularize, retriangulate or rasterize the world.

**The numerical port remains experimental.** Short execution and conservation checks do not establish realistic climate or long-term energy balance. Some unported diffusion and drag closures are disabled. See [numerical implementation and limitations](webgcm-native-numerics.md).

## Run a world

1. In the Chaos Machine world viewer, expand **Export**, select **Native GCM**, then choose **Export native GCM world**. The file ends in `.gcmworld`.
2. From the repository root, start the local viewer:

   ```powershell
   node webgcm-playground.local/experiments/native-grid/server.mjs
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
- `webgcm-playground.local/experiments/native-grid/`: local adapter, CPU/GPU sessions, shader transformations, worker, viewer and checks.

The WebGCM checkout and its native runtime are ignored by Git. Preserve that directory separately when moving machines. The tracked exporter alone does not include the installed GCM. The existing [raster terrain export](webgcm-terrain-export.md) remains a separate option.

## Verification

From the repository root:

```powershell
pnpm exec vitest run --project smoke src/test/earth/webgcm-native-export.smoke.test.ts src/test/earth/webgcm-export.smoke.test.ts
node --test webgcm-playground.local/experiments/native-grid/native-grid.test.mjs webgcm-playground.local/experiments/native-grid/session.test.mjs webgcm-playground.local/experiments/native-grid/packet.test.mjs
node webgcm-playground.local/experiments/native-grid/browser-check.mjs
pnpm typecheck
```

The browser check requires the native server, Playwright and installed Chrome at the path in that script. It checks actual GPU operators against CPU references, model advancement, checkpoint restore/resume, polar rendering and, when available, a saved procedural-world cache. Reports and screenshots are saved under `stats/climate/<timestamp>-native-gcm/`.

TypeScript changes also require `pnpm lint`. During concurrent repository work, scope that rewriting command to the changed native-export and UI files so it does not alter another agent's files.
