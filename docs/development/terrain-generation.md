# Terrain generation and preview

Procedural planet generation emits a read-only terrain snapshot after terrain shaping and sea-level adjustment, before climate, society, and history initialization. The snapshot contains mesh coordinates, face topology, and elevations. Later land-mask changes do not change these geometry inputs.

The UI starts a separate geometry worker alongside the generation worker. The geometry worker is warmed when generation begins and receives the terrain snapshot as soon as it arrives. It builds globe and map arrays while the generation worker continues. The two workers do not transfer ownership of inputs still needed by generation; finished geometry buffers transfer to the UI.

The scene shows an elevation-colored terrain preview when geometry arrives. Camera controls work while the completed world remains unavailable to selection, climate, and society consumers. The full world replaces the preview when generation finishes, using the prepared arrays. Imported heightmaps currently start geometry preparation after their world arrives rather than emitting an early preview snapshot.

One generation owns one geometry worker. Starting another generation, leaving the scene, or failing either worker cancels pending geometry work. Results from superseded generations are ignored. Worker computation timings travel with the prepared geometry; the world timing tree records only the residual `Geometry wait` to avoid counting overlapping work twice.

Globe normals accumulate by mesh vertex identity rather than rounded-coordinate strings. Map projection caches each mesh point, counts seam duplicates, and allocates exact output buffers before writing faces. [Contours](terrain-contours.md) remain separately generated on demand.

Regression checks live in `src/test/geometry-preparation.smoke.test.ts`, `src/test/contour-worker.smoke.test.ts`, and `src/test/contour-surface.smoke.test.ts`.
