import type { Galaxy } from "@/model/celestial/galaxy/types"

/** Recenters a worker-generated Galaxy's system positions from dimensions-
 * space (0..w, 0..h) to origin-centered world coordinates, matching the
 * ported density-wave renderer's own coordinate system (galaxy center at
 * (0,0)) -- see PortedGalaxyView.tsx, which feeds this straight into
 * renderer/galaxy-scene/points.ts + lanes.ts alongside that renderer's own
 * scene/camera. Mutates and returns the same object -- safe since its typed
 * arrays were just transferred from the worker, so nothing else aliases
 * them yet. */
export function recenterGalaxy(galaxy: Galaxy): Galaxy {
	const offsetX = galaxy.dimensions.w / 2
	const offsetY = galaxy.dimensions.h / 2
	for (let i = 0; i < galaxy.r_xy.length; i += 2) {
		galaxy.r_xy[i]! -= offsetX
		galaxy.r_xy[i + 1]! -= offsetY
	}
	return galaxy
}
