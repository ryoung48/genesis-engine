import { createMapProjection } from "@/ui/genesis/renderer/map-projection"

export function getRegionFocusTargets(params: {
	meshXYZ: Float32Array
	numRegions: number
	region: number
	centerLongitudeDeg: number
	projectionLatitudeDeg: number
	mapOffsetX: number
	mapOffsetY: number
	minDistance: number
	/** Multiplies the globe camera distance and divides the map zoom, so
	 * callers can size the view to whatever they're focusing on (e.g. a
	 * nation's geographic extent) rather than always using the single-point
	 * default. 1 = unchanged, <1 = closer/tighter, >1 = further/wider. */
	distanceScale?: number
}) {
	const {
		meshXYZ,
		numRegions,
		region,
		centerLongitudeDeg,
		projectionLatitudeDeg,
		mapOffsetX,
		mapOffsetY,
		minDistance,
		distanceScale = 1,
	} = params
	if (region < 0 || region >= numRegions || region * 3 + 2 >= meshXYZ.length) {
		return null
	}

	const x = meshXYZ[region * 3]
	const y = meshXYZ[region * 3 + 1]
	const z = meshXYZ[region * 3 + 2]
	const length = Math.hypot(x, y, z)
	if (length <= 0) return null

	const nx = x / length
	const ny = y / length
	const nz = z / length
	const mapProjection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	const projected = mapProjection.projectCartesian(nx, ny, nz)
	const [mapX, mapY] = mapProjection.projectRadians(
		projected.lon,
		projected.lat,
	)

	const globeDistance = Math.max(minDistance, 1.8) * distanceScale
	return {
		globeTarget: [
			nx * globeDistance,
			ny * globeDistance,
			nz * globeDistance,
		] as const,
		mapToX: mapX + mapOffsetX,
		mapToY: mapY + mapOffsetY,
		mapToZoom: 6 / distanceScale,
	}
}

// "coming from" convention: negate u/v to get the source direction
// Nation focus is anchored on a representative seed province, so province
// count is only a rough proxy for framing. Use a slow logarithmic curve:
// single-province minors need a much tighter view than the default point
// focus, while large nations should pull back only moderately instead of
// hitting the far-out cap early.
export function nationFocusDistanceScale(provinceCount: number): number {
	if (provinceCount <= 0) return 1
	const minScale = 0.18
	const maxScale = 1.0
	const referenceProvinceCount = 400
	const t = Math.min(
		1,
		Math.log2(Math.max(1, provinceCount)) / Math.log2(referenceProvinceCount),
	)
	return minScale + (maxScale - minScale) * t
}

// Focusing on a single province (as opposed to a whole nation) should use
// the same tight framing as a single-province nation -- the unscaled
// default (distanceScale 1) is tuned for the far-out nation case and looks
// much too zoomed-out for one province.
export const SINGLE_PROVINCE_FOCUS_DISTANCE_SCALE = nationFocusDistanceScale(1)
