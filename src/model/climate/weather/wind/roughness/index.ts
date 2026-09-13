import type { SurfaceFactorFieldInput } from "@/model/climate/weather/wind/roughness/types"
import type { WindSurface } from "@/model/climate/weather/wind/types"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"

// Surface drag on the near-ground wind, shared by every wind model (the
// pressure-gradient model, its "simple" variant, and the tidal-locked model).
// The returned factor multiplies the balanced wind speed.

function vegetationDragFactor(biomeCode: number | undefined): number {
	switch (biomeCode) {
		case 1:
			return 1.03 // desert — bare sand/rock, low roughness
		case 2:
			return 1.0 // sparse
		case 3:
			return 0.93 // grasslands
		case 4:
			return 0.84 // woods
		case 5:
			return 0.75 // forest
		case 6:
			return 0.66 // jungle — dense multi-layer canopy
		default:
			return 1.0
	}
}

function topographyWindFactor({
	topoCode,
	slope,
}: {
	topoCode: number | undefined
	slope: number
}): number {
	let base: number
	switch (topoCode) {
		case CLASSIFICATION.topoFlat:
			base = 1.0
			break
		case CLASSIFICATION.topoMarsh:
			base = 0.93
			break
		case CLASSIFICATION.topoHill:
			base = 0.88
			break
		case CLASSIFICATION.topoPlateau:
			base = 0.93
			break
		case CLASSIFICATION.topoMountain:
			base = 0.58
			break
		case CLASSIFICATION.topoOcean:
			base = 1.1
			break
		case CLASSIFICATION.topoLake:
			base = 1.08
			break
		default:
			base = 1.0
			break
	}
	return base * (1.0 - 0.12 * slope)
}

function surfaceFactorAt({
	r,
	surface,
}: {
	r: number
	surface: WindSurface
}): number {
	const topoCode = surface.topography?.[r]
	const isWater =
		topoCode === CLASSIFICATION.topoOcean ||
		topoCode === CLASSIFICATION.topoLake
	const slope = surface.slopeScore?.[r] ?? 0

	const vegFactor = isWater
		? 1.0
		: vegetationDragFactor(surface.vegetation?.[r])
	const topoFactor = topographyWindFactor({ topoCode, slope })
	// Sea-breeze / fetch bonus: up to +12 % at coast, decaying over ~800 km inland.
	const coastalFactor = isWater
		? 1.0
		: 1.0 + 0.12 * Math.exp(-(surface.oceanDist?.[r] ?? 0) / 800.0)

	return vegFactor * topoFactor * coastalFactor
}

// Terrain-only, so it never changes across the months of a single world --
// every wind model calls this once per cell per month, so caching per
// `surface` object (the same reference is reused all year) turns 12 redundant
// full-field computations into 1.
const surfaceFactorFieldCache = new WeakMap<WindSurface, Float32Array>()

function surfaceFactorField({
	N,
	surface,
}: SurfaceFactorFieldInput): Float32Array {
	const cached = surfaceFactorFieldCache.get(surface)
	if (cached) return cached
	const factors = new Float32Array(N)
	for (let r = 0; r < N; r++) factors[r] = surfaceFactorAt({ r, surface })
	surfaceFactorFieldCache.set(surface, factors)
	return factors
}

export const ROUGHNESS = {
	surfaceFactorField,
}
