import type {
	BuildRainRegionMaskParams,
	ClimateGeometry,
	ComputeAdvectionParams,
	ComputeMonthlyRainParams,
	ComputeMonthlyThermalEquatorsParams,
	ComputeThermalEquatorParams,
} from "@/model/climate/precipitation/rain/types"
import { RAIN as LOCKED_RAIN } from "@/model/climate/precipitation/tidal-locked"
import { ELEVATION } from "@/model/geography/terrain/elevation"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import type { SphereMesh } from "@/model/mesh/types"
import { MATH } from "@/model/shared/math/core"
import { PriorityHeap } from "@/model/shared/min-heap"
import { UNITS } from "@/model/shared/units"

const DEG2RAD = Math.PI / 180

// Matches BASE_REDUCTION in computeAdvection's per-hop orographic depletion —
// the post-advection spread pass reuses the same per-hop cost so a spread hop
// "feels" like an ordinary advection hop.
const SPREAD_BASE_REDUCTION = 0.9

// East gets first claim on a cell's moisture at 1.05x almost everywhere, but
// that bias is reduced to 0.95x between 20/30 and 30/30 hadley-widths off the
// equator (20°-30° at the standard 24h-day hadleyWidth of 30) — this is the
// subtropical belt where westerlies (winter storm track) start meaningfully
// competing with the trade-wind easterlies, so west shouldn't need to
// overcome an east-favoring handicap there. Scales with hadleyWidth like
// subsidenceScale so the band tracks each planet's own Hadley-cell geometry
// instead of a fixed real-world latitude.
const eastMoistureWinBias = (absLat: number, hadley: number): number => {
	const norm = absLat / hadley
	return norm >= 20 / 30 && norm <= 30 / 30 ? 1.05 : 1.05
}

// Windward orographic lift: keyed off the target cell's `slopeScore` — the
// same [0, 1] mesh-relative slope value shown in the hover panel
// (`CLASSIFICATION.computeSlopeScore`) — so "steep" means the same thing
// here as it does in the UI, instead of a separately-derived grade. Only
// climbing into the wind matters — flat/downslope hops get 1x (unaffected);
// the existing per-hop depletion already handles leeward rain-shadow drying
// once moisture has been pulled out here.
const OROGRAPHIC_LIFT_CURVE = {
	domain: [0, 0.2, 0.45, 1],
	range: [1, 1, 1.6, 3],
}
const orographicLiftScale = (slope: number) =>
	MATH.piecewise({
		domain: OROGRAPHIC_LIFT_CURVE.domain,
		range: OROGRAPHIC_LIFT_CURVE.range,
		x: slope,
	})

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

const TRADE_ZONAL_CURVE = {
	domain: [0, 10, 25, 35, 50],
	range: [0.7, 1, 1, 0.4, 0],
}
const TRADE_MERIDIONAL_CURVE = {
	domain: [0, 5, 15, 30, 40],
	range: [0, 0.2, 0.55, 0.8, 0],
}
const SUBTROPICAL_JET_CURVE = {
	domain: [20, 28, 32, 40],
	range: [0, 0.75, 1.1, 0.3],
}
const POLAR_JET_CURVE = { domain: [45, 52, 60, 70], range: [0, 0.45, 0.9, 0] }
const POLEWARD_CURVE = {
	domain: [22, 30, 45, 60, 75],
	range: [0, 0.2, 0.55, 0.35, 0],
}
const climateGeometryCache = new WeakMap<SphereMesh, ClimateGeometry>()

function getClimateGeometry(mesh: SphereMesh): ClimateGeometry {
	const cached = climateGeometryCache.get(mesh)
	if (cached) return cached

	const { latDeg, lonDeg } = MATH.getRegionLatLonDegrees(mesh)
	const N = mesh.numRegions
	const absLatDeg = new Float32Array(N)
	const sinLat = new Float32Array(N)
	const cosLat = new Float32Array(N)
	const lonRad = new Float32Array(N)
	const lonBinWidth = 360 / TEQ_NUM_BINS
	const regionBin = new Int32Array(N)

	for (let r = 0; r < N; r++) {
		const latRad = latDeg[r] * DEG2RAD
		absLatDeg[r] = Math.abs(latDeg[r])
		sinLat[r] = Math.sin(latRad)
		cosLat[r] = Math.cos(latRad)
		lonRad[r] = lonDeg[r] * DEG2RAD
		regionBin[r] = Math.max(
			0,
			Math.min(TEQ_NUM_BINS - 1, Math.floor((lonDeg[r] + 180) / lonBinWidth)),
		)
	}

	const edgeEastward = new Float32Array(mesh.adjList.length)
	const edgeNorthward = new Float32Array(mesh.adjList.length)
	for (let r = 0; r < N; r++) {
		const sinLat1 = sinLat[r]
		const cosLat1 = cosLat[r]
		const lon1 = lonRad[r]
		for (
			let j = mesh.adjOffset[r], jEnd = mesh.adjOffset[r + 1];
			j < jEnd;
			j++
		) {
			const nb = mesh.adjList[j]
			const dLon = lonRad[nb] - lon1
			const y = Math.sin(dLon) * cosLat[nb]
			const x = cosLat1 * sinLat[nb] - sinLat1 * cosLat[nb] * Math.cos(dLon)
			const norm = Math.hypot(y, x)
			if (norm > 1e-9) {
				edgeEastward[j] = y / norm
				edgeNorthward[j] = x / norm
			} else {
				edgeEastward[j] = 0
				edgeNorthward[j] = 1
			}
		}
	}

	const geometry = {
		latDeg,
		lonDeg,
		absLatDeg,
		sinLat,
		cosLat,
		lonRad,
		regionBin,
		edgeEastward,
		edgeNorthward,
	}
	climateGeometryCache.set(mesh, geometry)
	return geometry
}

function buildRainRegionMask({
	isLand,
	landmarks,
}: BuildRainRegionMaskParams): Uint8Array {
	const rainMask = new Uint8Array(isLand)
	if (!landmarks) return rainMask

	for (let r = 0; r < isLand.length; r++) {
		if (rainMask[r]) continue
		const landmarkId = landmarks.regionLandmark[r]
		if (
			landmarkId >= 0 &&
			landmarks.type[landmarkId] !== LANDMARKS.landmarkTypeOcean
		) {
			rainMask[r] = 1
		}
	}

	return rainMask
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

function computeAdvection({
	mesh,
	elevation,
	distCoast,
	climate,
	params,
	isLand,
	elevation_km,
	landmarks,
	slopeScore,
}: ComputeAdvectionParams): {
	east: Float32Array
	west: Float32Array
} {
	const N = mesh.numRegions
	const wet = 30

	const planetRadiusKm =
		typeof params === "number" ? params : params?.planetRadiusKm
	const hoursPerDay =
		typeof params === "number" ? 24 : (params?.hoursPerDay ?? 24)
	const hadley = hadleyWidth(hoursPerDay)
	const avgEdgeKm = UNITS.meanEdgeLengthKm({ mesh, planetRadiusKm })
	const scale = 94.5 / avgEdgeKm
	// computeCoastDistances now returns real km (not a hop count), so this
	// threshold is compared against distCoast directly in km — no more
	// dividing by avgEdgeKm to convert km into "number of hops".
	const deepOceanThreshold = 1260

	const { latDeg, absLatDeg, regionBin, edgeEastward, edgeNorthward } =
		getClimateGeometry(mesh)

	const { adjOffset, adjList, neighborDist } = mesh
	const land = isLand
	const planetRadiusKmResolved = planetRadiusKm ?? UNITS.defaultPlanetRadiusKm

	// A landlocked sea/lake evaporates locally but isn't the open-ocean
	// airmass this per-hop transit gain models — without landmarks to tell
	// them apart, fall back to treating all water as ocean (prior behavior).
	const isOceanWater = (r: number): boolean =>
		!land[r] &&
		(!landmarks ||
			landmarks.type[landmarks.regionLandmark[r]] ===
				LANDMARKS.landmarkTypeOcean)

	const elevKm =
		elevation_km ??
		(() => {
			const arr = new Float32Array(N)
			for (let r = 0; r < N; r++) {
				arr[r] = ELEVATION.elevToHeightKm({ elev: elevation[r] })
			}
			return arr
		})()

	const computePair = (teqByLon: Float32Array) => {
		const basinLabel = new Int32Array(N).fill(-1)
		let basinCount = 0
		for (let r = 0; r < N; r++) {
			if (land[r] || elevation[r] > 0 || basinLabel[r] >= 0) continue
			const basin = basinCount++
			const stack = [r]
			basinLabel[r] = basin
			while (stack.length > 0) {
				const current = stack.pop()!
				for (
					let j = adjOffset[current], jEnd = adjOffset[current + 1];
					j < jEnd;
					j++
				) {
					const nb = adjList[j]
					if (land[nb] || elevation[nb] > 0 || basinLabel[nb] >= 0) continue
					basinLabel[nb] = basin
					stack.push(nb)
				}
			}
		}
		const minBasinSize = Math.max(1, Math.floor(N * 0.005))
		const basinSize = new Int32Array(basinCount)
		for (let r = 0; r < N; r++) {
			if (basinLabel[r] >= 0) basinSize[basinLabel[r]]++
		}

		const sourceMoisture = new Float32Array(N)
		for (let r = 0; r < N; r++) {
			if (
				!land[r] &&
				elevation[r] <= 0 &&
				basinLabel[r] >= 0 &&
				basinSize[basinLabel[r]] >= minBasinSize &&
				// A landlocked sea/lake (e.g. the Caspian) can clear the size
				// threshold above without being connected to open ocean — only
				// an actual ocean-classified landmark evaporates enough to feed
				// the wind-driven advection this basin flood-fill seeds.
				(!landmarks ||
					landmarks.type[landmarks.regionLandmark[r]] ===
						LANDMARKS.landmarkTypeOcean)
			) {
				sourceMoisture[r] =
					wet *
					MATH.smoothstep({
						edge0: 0,
						edge1: deepOceanThreshold,
						x: distCoast[r],
					})
			}
		}

		const east = new Float32Array(N)
		const west = new Float32Array(N)
		// Uncapped "stays here" moisture per channel — same as east/west except
		// windward-lift cells are allowed to exceed the wet=30 transport cap,
		// since lift represents rain deposited locally, not moisture still in
		// transit. Never fed back into the flood-fill itself (see assignRain).
		const eastLocal = new Float32Array(N)
		const westLocal = new Float32Array(N)
		// Cells whose moisture was ever boosted by windward orographic lift
		// (liftMultiplier > 1) during advection — this value is a local
		// deposit, not transportable airmass, so the post-advection spread
		// pass must never use it as a source nor overwrite it as a target.
		const eastLiftAffected = new Uint8Array(N)
		const westLiftAffected = new Uint8Array(N)
		// The prevailing flow at a cell is the same for every outgoing edge, so
		// it is resolved once per cell and each edge only checks its alignment.
		const flowAt = ({
			attr,
			r,
		}: {
			attr: "east" | "west"
			r: number
		}): { east: number; north: number; norm: number; minAlignment: number } => {
			const lat = latDeg[r]
			const absLat = absLatDeg[r]
			const teq = teqByLon[regionBin[r]]
			const distToTeq = Math.abs(lat - teq)

			if (attr === "east") {
				const zonalStrength = MATH.piecewise({
					domain: TRADE_ZONAL_CURVE.domain,
					range: TRADE_ZONAL_CURVE.range,
					x: absLat,
				})
				const meridionalStrength = MATH.piecewise({
					domain: TRADE_MERIDIONAL_CURVE.domain,
					range: TRADE_MERIDIONAL_CURVE.range,
					x: distToTeq,
				})
				const teqDir = teq > lat ? 1 : teq < lat ? -1 : 0
				const flowEast = -zonalStrength
				const flowNorth = teqDir * meridionalStrength
				return {
					east: flowEast,
					north: flowNorth,
					norm: Math.hypot(flowEast, flowNorth),
					minAlignment: 0.35,
				}
			}
			const subtropicalJet = MATH.piecewise({
				domain: SUBTROPICAL_JET_CURVE.domain,
				range: SUBTROPICAL_JET_CURVE.range,
				x: absLat,
			})
			const polarJet = MATH.piecewise({
				domain: POLAR_JET_CURVE.domain,
				range: POLAR_JET_CURVE.range,
				x: absLat,
			})
			const zonalStrength = Math.max(0.7, subtropicalJet, polarJet)
			const polewardStrength = MATH.piecewise({
				domain: POLEWARD_CURVE.domain,
				range: POLEWARD_CURVE.range,
				x: absLat,
			})
			const poleDir = lat >= teq ? 1 : -1
			const flowEast = zonalStrength
			const flowNorth = poleDir * polewardStrength
			return {
				east: flowEast,
				north: flowNorth,
				norm: Math.hypot(flowEast, flowNorth),
				minAlignment: 0.4,
			}
		}

		const assignRain = (attr: "east" | "west", blockedBy?: Float32Array) => {
			const moisture = attr === "east" ? east : west
			const localMoisture = attr === "east" ? eastLocal : westLocal
			const liftAffected = attr === "east" ? eastLiftAffected : westLiftAffected
			const settled = new Uint8Array(N)
			// Max-heap on moisture: push the negated value into the min-heap.
			const queue = new PriorityHeap<number>()

			for (let r = 0; r < N; r++) {
				if (!land[r] && sourceMoisture[r] > 1e-3) {
					moisture[r] = sourceMoisture[r]
					localMoisture[r] = sourceMoisture[r]
					queue.push(-sourceMoisture[r], r)
				}
			}

			while (queue.size > 0) {
				const next = queue.pop()
				if (!next) break
				const r = next.value
				const nextMoisture = -next.key
				if (settled[r]) continue
				if (nextMoisture + 1e-3 < moisture[r]) continue
				settled[r] = 1

				// Sequential precedence: once this westward hop can no longer
				// beat the already-settled east value at this cell (east gets
				// first claim, per eastMoistureWinBias), stop piling on —
				// this cell and everything only reachable further downwind
				// concede to east.
				if (
					blockedBy &&
					land[r] &&
					Math.abs(latDeg[r] - teqByLon[regionBin[r]]) / hadley >= 44 / 30 &&
					nextMoisture <=
						blockedBy[r] * eastMoistureWinBias(absLatDeg[r], hadley)
				) {
					moisture[r] = 0
					localMoisture[r] = 0
					continue
				}

				const rIsOceanWater = !land[r] && isOceanWater(r)
				const flow = flowAt({ attr, r })
				const calm = attr === "east" && flow.norm < 1e-6
				for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
					const nb = adjList[j]
					const aligned = calm
						? edgeEastward[j] <= -0.573576436351046
						: (edgeEastward[j] * flow.east + edgeNorthward[j] * flow.north) /
								flow.norm >=
							flow.minAlignment
					if (!aligned) continue
					// Scale the per-hop moisture change by this edge's real
					// distance relative to the mesh average — a hop between two
					// coastline-dense cells covers far less ground than a hop
					// through the sparse open ocean, and should lose/gain
					// proportionally less moisture.
					const edgeKm = neighborDist[j] * planetRadiusKmResolved

					// Windward lift: climbing into the wind pulls extra moisture
					// out of the transported airmass (steeper depletion below)
					// and deposits it locally (localMoisture), uncapped, so
					// genuinely extreme orographic hotspots aren't clamped to
					// the same ceiling as an ordinary saturated coastal cell.
					let liftMultiplier = 1
					if (land[r] && edgeKm > 1e-6 && elevKm[nb] > elevKm[r]) {
						liftMultiplier = orographicLiftScale(slopeScore?.[nb] ?? 0)
					}
					const BASE_REDUCTION = 0.9
					const orographic = -BASE_REDUCTION * liftMultiplier
					// Lake/sea (non-ocean) water is neither a transit boost nor
					// subject to land's orographic depletion — it's just neutral.
					const baseImpact = land[r]
						? orographic / scale
						: rIsOceanWater
							? 0.5 / scale
							: -0.1 / scale
					const impact = baseImpact * (edgeKm / avgEdgeKm)
					const m = Math.max(
						Math.min(Math.max(moisture[r], 0) + impact, wet),
						0,
					)
					if (!settled[nb] && m > moisture[nb] + 1e-3) {
						moisture[nb] = m
						if (liftMultiplier > 1) {
							localMoisture[nb] = Math.max(moisture[r], 0) * liftMultiplier
							liftAffected[nb] = 1
						} else {
							localMoisture[nb] = m
						}
						queue.push(-m, nb)
					}
				}
			}

			for (let r = 0; r < N; r++) moisture[r] = localMoisture[r]
		}

		// Post-advection lateral spread: a settled cell whose e/w-aligned
		// neighbor sits more than BASE_REDUCTION below it gives that neighbor
		// moisture[r] - BASE_REDUCTION, then the neighbor keeps spreading
		// outward from its new value the same way, each hop losing another
		// BASE_REDUCTION, until no reachable neighbor still qualifies. Runs
		// per channel (east/west never mix here) on the raw 0..wet values,
		// with no orographic/lift term — purely lateral leveling.
		const spreadMoisture = (
			attr: "east" | "west",
			blockedBy?: Float32Array,
		) => {
			const moisture = attr === "east" ? east : west
			const liftAffected = attr === "east" ? eastLiftAffected : westLiftAffected
			const settled = new Uint8Array(N)
			const queue = new PriorityHeap<number>()

			for (let r = 0; r < N; r++) {
				if (moisture[r] > 1e-3 && !liftAffected[r]) queue.push(-moisture[r], r)
			}

			while (queue.size > 0) {
				const next = queue.pop()
				if (!next) break
				const r = next.value
				const nextMoisture = -next.key
				if (settled[r]) continue
				if (nextMoisture + 1e-3 < moisture[r]) continue
				settled[r] = 1

				const candidate = moisture[r] - SPREAD_BASE_REDUCTION
				if (candidate <= 1e-3) continue

				for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
					const nb = adjList[j]
					if (settled[nb] || liftAffected[nb]) continue
					// Same precedence as assignRain's blockedBy: west's spread
					// stops cold the moment it can no longer beat the other
					// channel's claim at this neighbor — it doesn't overwrite
					// nb and doesn't keep propagating past it.
					if (
						blockedBy &&
						Math.abs(latDeg[nb] - teqByLon[regionBin[nb]]) / hadley >=
							44 / 30 &&
						candidate <=
							blockedBy[nb] * eastMoistureWinBias(absLatDeg[nb], hadley)
					)
						continue
					if (moisture[nb] < candidate - 1e-3) {
						const m = Math.min(candidate, wet)
						moisture[nb] = m
						queue.push(-m, nb)
					}
				}
			}
		}

		assignRain("east")
		assignRain("west", east)
		spreadMoisture("east")
		spreadMoisture("west", east)

		for (let r = 0; r < N; r++) {
			east[r] /= wet
			west[r] /= wet
			if (
				west[r] > 0 &&
				Math.abs(latDeg[r] - teqByLon[regionBin[r]]) / hadley >= 44 / 30
			)
				east[r] = 0
		}

		return { east, west }
	}

	const annualTeq = climate
		? computeThermalEquator({ mesh, temps: climate.temperature_avg })
		: new Float32Array(TEQ_NUM_BINS)
	const annual = computePair(annualTeq)

	return annual
}

// Rain for a planet locked to its star (every other world's is climatev2's)
function computeMonthlyRain({
	mesh,
	climate,
	isLand,
	params,
	distCoast,
	landmarks,
}: ComputeMonthlyRainParams): { monthly: Float32Array; annual: Float32Array } {
	return LOCKED_RAIN.computeTidalRain({
		mesh,
		climate,
		isLand: buildRainRegionMask({ isLand, landmarks }),
		params,
		distCoast,
	})
}

export const RAIN = {
	hadleyWidth,
	getClimateGeometry,
	computeThermalEquator,
	computeMonthlyThermalEquators,
	computeThermalEquatorLine,
	computeAdvection,
	computeMonthlyRain,
}
