# Terrain contours

Planet generation builds globe and map geometry without contour smoothing or control buffers. Each geometry records its source mesh side per face; map seam duplicates retain the same source side.

See [terrain generation and preview](terrain-generation.md) for the parallel geometry worker and early terrain display.

Enabling contours starts `src/ui/genesis/renderer/contours/worker/contours.worker.ts`. One worker per world receives only the mesh arrays and elevations needed for contours. It computes and caches the smoothed surface, then expands control buffers for the globe and map face order. Results transfer back without copying their control buffers.

Terrain renders normally while the worker runs. Contour shader attributes and shader code are installed when each result arrives. Turning contours off during computation keeps the result hidden; subsequent toggles reuse the installed attributes. Disposed geometries ignore pending results, and disposing the last registered geometry terminates the worker.

Regression checks live in `src/test/contour-worker.smoke.test.ts` and `src/test/contour-surface.smoke.test.ts`.
