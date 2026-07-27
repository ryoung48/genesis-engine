interface CoastDensityOptions {
	/** Extra weight added right at the coastline, decaying with distance. */
	boost: number
	/** Baseline weight for open land, away from the coast. */
	landInteriorWeight?: number
	/**
	 * Baseline weight for open ocean, away from the coast. Kept low by
	 * default — deep ocean rarely needs the same resolution as land terrain,
	 * so starving it frees up point budget for the coast and land interior
	 * without changing the total point count.
	 */
	oceanInteriorWeight?: number
	/**
	 * Optional lake mask (255 = lake, 0 = not-lake), same convention and
	 * resolution as `mask`. When provided, lake shorelines are treated as a
	 * coastline for density purposes — a mesh cell right next to a real lake
	 * gets the same boost real ocean coastline gets — and lake interiors get
	 * the sparse ocean-interior baseline rather than the dense land baseline.
	 */
	lakeMask?: Uint8Array
	/**
	 * Optional province-id raster (same resolution as `mask`). Pixels
	 * adjacent to a differently-numbered province are treated as an extra
	 * density-boosting boundary alongside the coastline, so province borders
	 * get dense mesh coverage even deep inland, away from any coast.
	 */
	provinceRaster?: Int16Array
}

export interface ComputeBoundaryDistancePxParams {
	mask: Uint8Array
	width: number
	height: number
	provinceRaster?: Int16Array
}

export interface MergeLandLakeMaskParams {
	mask: Uint8Array
	lakeMask?: Uint8Array
}

export interface BuildCoastDensityWeightParams {
	mask: Uint8Array
	width: number
	height: number
	options: CoastDensityOptions
}
