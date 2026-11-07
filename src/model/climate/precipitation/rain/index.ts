import type {
	ClimateGeometry,
	ComputeMonthlyThermalEquatorsParams,
	ComputeThermalEquatorParams,
} from "@/model/climate/precipitation/rain/types"
import type { SphereMesh } from "@/model/mesh/types"
import { MATH } from "@/model/shared/math/core"

const HADLEY_WIDTH_CURVE = {
	domain: [6, 12, 24, 48, 96, 192, 384, 2000],
	range: [18, 25, 30, 40, 55, 65, 70, 88],
}
const hadleyWidth = (x: number) =>
	MATH.piecewise({
		domain: HADLEY_WIDTH_CURVE.domain,
		range: HADLEY_WIDTH_CURVE.range,
		x,
	})

const climateGeometryCache = new WeakMap<SphereMesh, ClimateGeometry>()

function getClimateGeometry(mesh: SphereMesh): ClimateGeometry {
	const cached = climateGeometryCache.get(mesh)
	if (cached) return cached

	const { latDeg, lonDeg } = MATH.getRegionLatLonDegrees(mesh)
	const N = mesh.numRegions
	const lonBinWidth = 360 / TEQ_NUM_BINS
	const regionBin = new Int32Array(N)

	for (let r = 0; r < N; r++) {
		regionBin[r] = Math.max(
			0,
			Math.min(TEQ_NUM_BINS - 1, Math.floor((lonDeg[r] + 180) / lonBinWidth)),
		)
	}

	const geometry = {
		latDeg,
		lonDeg,
		regionBin,
	}
	climateGeometryCache.set(mesh, geometry)
	return geometry
}

const TEQ_NUM_BINS = 120

// Wide enough (18 bins × 3° = ±54° of longitude) to reach past a large hot
// desert's own longitude span (e.g. the Sahara, ~50°+ wide) and pull in
// genuinely ocean-anchored ITCZ latitudes on either side, so a broad
// temperature-only hijack can't smooth itself with equally-hijacked
// neighbors. Still narrow enough to preserve real regional ITCZ asymmetry
// (e.g. the Indian monsoon trough sitting well north of the mid-Atlantic
// ITCZ at the same time of year).
const TEQ_HALF_WIN = 18

function computeTEQBins({
	mesh,
	temps,
	numBins,
	halfWindowBins,
}: Required<ComputeThermalEquatorParams>): {
	binMaxTemp: Float32Array
	smoothLat: Float32Array
} {
	const N = mesh.numRegions
	const { latDeg, lonDeg, regionBin } = getClimateGeometry(mesh)
	const binMaxTemp = new Float32Array(numBins).fill(-Infinity)
	const binMaxLat = new Float32Array(numBins)
	const useCachedBins = numBins === TEQ_NUM_BINS

	for (let r = 0; r < N; r++) {
		const bin = useCachedBins
			? regionBin[r]
			: Math.max(
					0,
					Math.min(
						numBins - 1,
						Math.floor(((lonDeg[r] + 180) / 360) * numBins),
					),
				)
		if (temps[r] > binMaxTemp[bin]) {
			binMaxTemp[bin] = temps[r]
			binMaxLat[bin] = latDeg[r]
		}
	}

	const smoothLat = new Float32Array(numBins)
	for (let i = 0; i < numBins; i++) {
		let sum = 0
		let count = 0
		for (let d = -halfWindowBins; d <= halfWindowBins; d++) {
			const j = (((i + d) % numBins) + numBins) % numBins
			if (binMaxTemp[j] !== -Infinity) {
				sum += binMaxLat[j]
				count++
			}
		}
		smoothLat[i] = count > 0 ? sum / count : 0
	}

	return { binMaxTemp, smoothLat }
}

function computeThermalEquator({
	mesh,
	temps,
	numBins = TEQ_NUM_BINS,
	halfWindowBins = TEQ_HALF_WIN,
}: ComputeThermalEquatorParams): Float32Array {
	return computeTEQBins({ mesh, temps, numBins, halfWindowBins }).smoothLat
}

function computeThermalEquatorLine({
	mesh,
	temps,
	numBins = TEQ_NUM_BINS,
	halfWindowBins = TEQ_HALF_WIN,
}: ComputeThermalEquatorParams): [number, number][] | null {
	const { binMaxTemp, smoothLat } = computeTEQBins({
		mesh,
		temps,
		numBins,
		halfWindowBins,
	})
	const points: [number, number][] = []
	for (let i = 0; i < numBins; i++) {
		if (binMaxTemp[i] === -Infinity) continue
		const lonDeg = -180 + (i + 0.5) * (360 / numBins)
		points.push([lonDeg, smoothLat[i]])
	}
	if (points.length > 0) points.push([points[0][0] + 360, points[0][1]])
	return points.length > 2 ? points : null
}

function computeMonthlyThermalEquators({
	mesh,
	climate,
}: ComputeMonthlyThermalEquatorsParams): Float32Array[] {
	const N = mesh.numRegions
	const monthlyTEQ: Float32Array[] = new Array(12)
	for (let month = 0; month < 12; month++) {
		monthlyTEQ[month] = computeThermalEquator({
			mesh,
			temps: climate.temperature_monthly.subarray(month * N, (month + 1) * N),
		})
	}
	return monthlyTEQ
}

export const RAIN = {
	hadleyWidth,
	getClimateGeometry,
	computeThermalEquator,
	computeMonthlyThermalEquators,
	computeThermalEquatorLine,
}
