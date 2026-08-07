import { HUMIDITY } from "@/model/climate/humidity"
import { HYDROLOGY } from "@/model/climate/hydrology"
import { MESH } from "@/model/mesh"
import type { SphereMesh } from "@/model/mesh/types"
import type {
	MatchRealLakeNamesParams,
	MergeEu4LandMaskParams,
	PointInRingParams,
	RealProvinceInput,
	RealRiverLineInput,
	ReconcileElevationWithMaskParams,
} from "@/model/pipelines/import-heightmap/real-earth-data/types"
import type { GenesisWorld } from "@/model/pipelines/types"

// WorldClim's vapor-pressure product estimates actual vapor pressure from
// daily minimum temperature (dewpoint ≈ Tmin), which is unreliable at the
// extremes: it goes wildly supersaturated in the deep-cold Antarctic
// interior, and runs systematically high in low-DTR climates like the
// Amazon (Tmin stays close to Tmean there, so the Tmin-derived vapor
// pressure is inflated relative to Tmean's saturation point). Rather than
// trust that derived product, this reuses the same dewpoint-depression
// heuristic as modeled RH (HUMIDITY.relativeHumidityFromTempRange), just fed
// with observed inputs (real temperature, real DTR, real rainfall) instead
// of modeled ones -- "observed RH" becomes "the same RH model, grounded in
// real climatology" rather than a second, less trustworthy data source.
function attachObservedEarthHumidity(params: {
	mesh: SphereMesh
	isLand: Uint8Array
	world: {
		climate: GenesisWorld["climate"]
		rainfall?: GenesisWorld["rainfall"]
		oceanDist?: GenesisWorld["oceanDist"]
		dtr_monthly?: GenesisWorld["dtr_monthly"]
		observedDtr?: GenesisWorld["observedDtr"]
		observedHydrology?: GenesisWorld["observedHydrology"]
		observedHumidity?: GenesisWorld["observedHumidity"]
		params?: GenesisWorld["params"]
	}
}): void {
	const { mesh, isLand, world } = params
	const realTempMonthly = world.climate.real_temperature_monthly
	if (!realTempMonthly) return

	const N = mesh.numRegions

	// Observed aridity: shared with real-Earth pasta classification
	// (assignEarthPastaClimate) via HYDROLOGY.computeObservedAridity, so both
	// agree on "how wet is this cell, really" instead of maintaining two
	// separate real-data water-balance computations.
	const observed = HYDROLOGY.computeObservedAridity({
		isLand,
		realTemperatureMonthly: realTempMonthly,
		modeledTemperatureMonthly: world.climate.temperature_monthly,
		realDtrMonthly: world.observedDtr?.real_monthly,
		modeledDtrMonthly: world.dtr_monthly ?? new Float32Array(12 * N),
		realRainfallMonthly: world.rainfall?.real_monthly,
		modeledRainfallMonthly: world.rainfall?.monthly ?? new Float32Array(12 * N),
		insolationMonthly: world.climate.insolation_monthly,
		dpm: (world.params?.daysPerYear ?? 365) / 12,
	})
	const observedAet = observed?.aet_monthly
	const observedPet = observed?.pet_monthly
	if (observedAet && observedPet) {
		world.observedHydrology = {
			aet_monthly: observedAet,
			pet_monthly: observedPet,
		}
	}

	const observedMonthly = new Float32Array(12 * N)
	const observedAnnual = new Float32Array(N)

	for (let r = 0; r < N; r++) {
		let annualAridity: number | undefined
		if (observedAet && observedPet) {
			let aetSum = 0
			let petSum = 0
			for (let m = 0; m < 12; m++) {
				aetSum += observedAet[m * N + r]
				petSum += observedPet[m * N + r]
			}
			annualAridity = petSum > 0 ? aetSum / petSum : 1
		}
		const annualRainfallMm = world.rainfall?.real_annual?.[r]
		const distFromOceanKm = world.oceanDist?.[r]

		let observedSum = 0
		let observedCount = 0
		for (let month = 0; month < 12; month++) {
			const idx = month * N + r
			const meanTempC = realTempMonthly[idx]
			if (!Number.isFinite(meanTempC)) {
				observedMonthly[idx] = NaN
				continue
			}
			const dtrC =
				world.observedDtr?.real_monthly?.[idx] ?? world.dtr_monthly?.[idx]
			if (!Number.isFinite(dtrC)) {
				observedMonthly[idx] = NaN
				continue
			}
			const observed = HUMIDITY.relativeHumidityFromTempRange({
				meanTempC,
				dtrC: dtrC as number,
				annualAridity,
				annualRainfallMm,
				distFromOceanKm,
			})
			observedMonthly[idx] = observed
			observedSum += observed
			observedCount++
		}
		observedAnnual[r] = observedCount > 0 ? observedSum / observedCount : NaN
	}

	world.observedHumidity = {
		real_monthly: observedMonthly,
		real_annual: observedAnnual,
	}
}

function buildRealRiversData(
	mesh: SphereMesh,
	lines: RealRiverLineInput[],
	elevation_km: Float32Array,
	planetRadiusKm: number,
): {
	lines: [number, number, number, number][][]
	visible: Uint8Array
	riverId: Int32Array
	riverLengthKm: Float32Array
	riverNames: (string | null)[]
	minFlow: number
	maxFlow: number
} {
	const N = mesh.numRegions
	const visible = new Uint8Array(N)
	const riverId = new Int32Array(N).fill(-1)
	const riverLengthKm = new Float32Array(N)
	const index = MESH.buildRegionSpatialIndex(mesh)

	let maxStroke = 0
	for (const line of lines) maxStroke = Math.max(maxStroke, line.strokeweig)
	if (maxStroke <= 0) maxStroke = 1

	const outLines: [number, number, number, number][][] = []

	lines.forEach((line, lineIdx) => {
		const numPoints = line.points.length / 2
		if (numPoints < 2) return

		// Flow is a rendering-only proxy derived from Natural Earth's
		// strokeweig (there's no real discharge simulation here) — scaled
		// into a plausible-looking m3/s-ish range so line-width normalization
		// (which expects flow-like magnitudes) still produces sensible output.
		const flow = (line.strokeweig / maxStroke) * 5000

		const quad: [number, number, number, number][] = []
		let lengthKm = 0
		let prevXyz: [number, number, number] | null = null
		for (let i = 0; i < numPoints; i++) {
			const lonDeg = line.points[2 * i]
			const latDeg = line.points[2 * i + 1]
			const lonR = (lonDeg * Math.PI) / 180
			const latR = (latDeg * Math.PI) / 180
			const cosLat = Math.cos(latR)
			const xyz: [number, number, number] = [
				cosLat * Math.cos(lonR),
				cosLat * Math.sin(lonR),
				Math.sin(latR),
			]
			if (prevXyz) {
				const dx = xyz[0] - prevXyz[0]
				const dy = xyz[1] - prevXyz[1]
				const dz = xyz[2] - prevXyz[2]
				lengthKm += Math.sqrt(dx * dx + dy * dy + dz * dz) * planetRadiusKm
			}
			prevXyz = xyz

			const region = index.nearest(lonDeg, latDeg)
			const elevKm = region >= 0 ? elevation_km[region] : 0
			quad.push([lonDeg, latDeg, flow, elevKm])

			if (region >= 0) {
				visible[region] = 1
				riverId[region] = lineIdx
			}
		}
		outLines.push(quad)

		for (let i = 0; i < numPoints; i++) {
			const region = index.nearest(line.points[2 * i], line.points[2 * i + 1])
			if (region >= 0) riverLengthKm[region] = lengthKm
		}
	})

	let minFlow = Infinity
	let maxFlow = 0
	for (const line of outLines)
		for (const [, , flow] of line) {
			minFlow = Math.min(minFlow, flow)
			maxFlow = Math.max(maxFlow, flow)
		}
	if (!Number.isFinite(minFlow)) minFlow = 0

	const riverNames = lines.map((line) => line.name ?? null)

	return {
		lines: outLines,
		visible,
		riverId,
		riverLengthKm,
		riverNames,
		minFlow,
		maxFlow: maxFlow || 1,
	}
}

function matchRealLakeNames({
	mesh,
	landmarks,
	lakeLandmarkType,
	lakePolygons,
}: MatchRealLakeNamesParams): (string | null)[] {
	const realNames = new Array<string | null>(landmarks.count).fill(null)
	if (!lakePolygons.length) return realNames

	const { r_xyz } = mesh
	const sumX = new Float64Array(landmarks.count)
	const sumY = new Float64Array(landmarks.count)
	const sumZ = new Float64Array(landmarks.count)
	const counts = new Int32Array(landmarks.count)
	for (let r = 0; r < mesh.numRegions; r++) {
		const landmarkId = landmarks.regionLandmark[r]
		if (landmarkId < 0 || landmarks.type[landmarkId] !== lakeLandmarkType)
			continue
		sumX[landmarkId] += r_xyz[3 * r]
		sumY[landmarkId] += r_xyz[3 * r + 1]
		sumZ[landmarkId] += r_xyz[3 * r + 2]
		counts[landmarkId]++
	}

	const polygonCentroids = lakePolygons.map(({ ring }) => {
		let lonSum = 0
		let latSum = 0
		for (const [lon, lat] of ring) {
			lonSum += lon
			latSum += lat
		}
		return [lonSum / ring.length, latSum / ring.length] as [number, number]
	})

	const NEAREST_THRESHOLD_DEG = 3

	for (let landmarkId = 0; landmarkId < landmarks.count; landmarkId++) {
		if (
			landmarks.type[landmarkId] !== lakeLandmarkType ||
			counts[landmarkId] === 0
		)
			continue
		const x = sumX[landmarkId] / counts[landmarkId]
		const y = sumY[landmarkId] / counts[landmarkId]
		const z = sumZ[landmarkId] / counts[landmarkId]
		const lat = (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI
		const lon = (Math.atan2(y, x) * 180) / Math.PI

		let matched: string | null = null
		for (const { name, ring } of lakePolygons) {
			if (pointInRing({ lonDeg: lon, latDeg: lat, ring })) {
				matched = name
				break
			}
		}
		if (!matched) {
			let bestDist = Infinity
			let bestIdx = -1
			for (let i = 0; i < polygonCentroids.length; i++) {
				const [clon, clat] = polygonCentroids[i]
				const d = Math.hypot(clon - lon, clat - lat)
				if (d < bestDist) {
					bestDist = d
					bestIdx = i
				}
			}
			if (bestIdx >= 0 && bestDist <= NEAREST_THRESHOLD_DEG)
				matched = lakePolygons[bestIdx].name
		}
		realNames[landmarkId] = matched
	}

	return realNames
}

function resolveRealProvinceSeeds(
	mesh: SphereMesh,
	isLand: Uint8Array,
	provinces: RealProvinceInput[],
): { regions: Int32Array; weights: Float32Array; names: string[] } {
	const index = MESH.buildRegionSpatialIndex(mesh)
	const { adjOffset, adjList } = mesh
	const regionOwner = new Map<number, number>() // region -> index into accepted[]
	const accepted: { region: number; weight: number; name: string }[] = []

	function nearestLandRegion(lonDeg: number, latDeg: number): number {
		const start = index.nearest(lonDeg, latDeg)
		if (start < 0) return -1
		if (isLand[start]) return start
		// BFS outward for the nearest land region.
		const visited = new Set<number>([start])
		let frontier = [start]
		for (let hop = 0; hop < 8 && frontier.length > 0; hop++) {
			const next: number[] = []
			for (const r of frontier) {
				for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
					const nb = adjList[j]
					if (visited.has(nb)) continue
					visited.add(nb)
					if (isLand[nb]) return nb
					next.push(nb)
				}
			}
			frontier = next
		}
		return -1
	}

	for (const p of provinces) {
		const region = nearestLandRegion(p.lon, p.lat)
		if (region < 0) continue
		const existingIdx = regionOwner.get(region)
		if (existingIdx === undefined) {
			regionOwner.set(region, accepted.length)
			accepted.push({ region, weight: p.weight, name: p.name })
		} else if (p.weight > accepted[existingIdx].weight) {
			accepted[existingIdx] = { region, weight: p.weight, name: p.name }
		}
	}

	return {
		regions: Int32Array.from(accepted.map((a) => a.region)),
		weights: Float32Array.from(accepted.map((a) => a.weight)),
		names: accepted.map((a) => a.name),
	}
}

function pointInRing({ lonDeg, latDeg, ring }: PointInRingParams): boolean {
	let inside = false
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const [xi, yi] = ring[i]
		const [xj, yj] = ring[j]
		const intersects =
			yi > latDeg !== yj > latDeg &&
			lonDeg < ((xj - xi) * (latDeg - yi)) / (yj - yi) + xi
		if (intersects) inside = !inside
	}
	return inside
}

function mergeEu4LandMask({
	mask,
	eu4Raster,
	eu4Nodata,
}: MergeEu4LandMaskParams): Uint8Array {
	const merged = new Uint8Array(mask.length)
	for (let i = 0; i < mask.length; i++) {
		merged[i] = mask[i] >= 128 || eu4Raster[i] !== eu4Nodata ? 255 : 0
	}
	return merged
}

function reconcileElevationWithMask({
	elevation,
	maskIsLand,
	epsilon,
}: ReconcileElevationWithMaskParams): void {
	for (let r = 0; r < elevation.length; r++) {
		if (maskIsLand[r]) {
			if (elevation[r] <= 0) elevation[r] = epsilon
		} else {
			if (elevation[r] > 0) elevation[r] = -epsilon
		}
	}
}

export const REAL_EARTH_DATA = {
	attachObservedEarthHumidity,
	buildRealRiversData,
	matchRealLakeNames,
	resolveRealProvinceSeeds,
	pointInRing,
	mergeEu4LandMask,
	reconcileElevationWithMask,
}
