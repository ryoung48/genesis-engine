# Exporting terrain to local WebGCM

For an export that preserves the existing cells and land/water labels, see [the native-grid GCM integration](webgcm-native-grid.md). This page describes the separate raster format.

In the world viewer's **Export** controls, choose **WebGCM**, then **Export WebGCM terrain**. The download is named `chaos-world-<seed>.bin`.

With the local WebGCM server running, open [Load terrain](http://localhost:8766/terrain.html), choose the exported file and a climate resolution. The existing WebGCM app opens below the picker with the elevation overlay. Other overlays, including the local Köppen overlay, remain available.

The export contains geography only. WebGCM retains its Earth-like physical parameters; radius, atmosphere, orbit, temperatures, vegetation, rivers, settlements and history are not transferred. The imported world starts at simulated day zero. Keep the loader page open: its embedded app reads the selected file through a temporary URL. Changing resolution starts a fresh run on the selected terrain. Reloading the loader requires selecting the file again.

## Terrain format

The exporter samples the world's physical `elevation_km` using the existing mesh spatial index. The raster is 1440 columns by 720 rows, with pixel centres spanning longitude −180° to +180° and latitude +90° to −90°. Values are signed, little-endian 16-bit elevations in metres, positive above sea level and negative below it. The file is exactly 2,073,600 bytes.

These dimensions and coordinates match the local WebGCM `js/geography.module.js` loader's default format. Heights are rounded to whole metres while preserving the sign of nonzero elevations. Non-finite elevations or values outside −32,768 to +32,767 metres produce an export error instead of wrapping or clipping. The export uses physical elevation, not the displayed PNG colors or longitude offset. Inland lakes above sea level are represented as terrain; this format does not describe separate lake surfaces.

## Custom geography behavior

The local WebGCM worker detects the custom topography input and disables Earth-specific Panama/strait corrections, Greenland/Antarctic ice-sheet presets, bundled Earth subgrid terrain statistics and World Ocean Atlas initialization. Terrain statistics fall back to the imported raster, and the ocean uses the model's analytic initialization. This does not remove every Earth-specific physics assumption.

The local app and loader live in the ignored `webgcm-playground.local` checkout. They must be preserved separately from the tracked exporter if moving to another machine. The Köppen overlay begins collecting a new seasonal record and needs 365 simulated days before land classifications appear.

## Verification

`pnpm exec vitest run --project smoke src/test/earth/webgcm-export.smoke.test.ts` checks the binary size, coordinate orientation, metre conversion, endianness, coastline sign preservation and invalid input errors. Run `pnpm lint` and `pnpm typecheck` for changes to the tracked exporter or its controls.
