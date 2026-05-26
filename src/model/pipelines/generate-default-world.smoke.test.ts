import { describe, expect, it } from "vitest"
import { OROGEN_TOPOGRAPHY_LABELS } from "@/model"
import { EnergyBalanceModel } from "@/model/climate/ebm"
import { EMB_CONSTANTS } from "@/model/climate/ebm/constants"
import { PASTA_LABELS } from "@/model/climate/pasta"
import { BIOME_LABELS, CLIMATE_LABELS } from "@/model/climate/vegetation"
import { TRADE_GOOD_LABELS } from "@/model/economy/trade-goods"
import { initHistory } from "@/model/history"
import { SEA_ROUTE_PORT_MIN_POPULATION } from "@/model/history/events/trade-routes"
import { PROV } from "@/model/history/fields"
import { decodePlanetCode } from "@/model/shared/planet-code"
import { regionPathLengthKm } from "@/model/shared/units"
import {
	ROUTE_LAND_MAJOR,
	ROUTE_LAND_MINOR,
	ROUTE_SEA,
} from "@/model/transport/worker-types"
import { buildTradeRouteCorridors } from "@/ui/planet/renderer/trade-route-overlay"
import { DEFAULT_WORLD_PARAMS } from "@/ui/planet/screen/generation/defaults"
import { buildGenerationPreviewConfig } from "@/ui/planet/screen/generation/generation-preview"
import type { OrogenParams } from ".."
import type { OrogenWorld } from "../world"
import {
	collectSeaRoutePortDiagnostics,
	selectTimingStages,
} from "./generate-default-world-diagnostics"
import { generateOrogenWorld } from "./generate-world"

const SMOKE_PLANET_CODE = "8wqaf.080yudfjcze4m7yceeysl488rbtec5u"

function buildSmokeParams(code: string): OrogenParams {
	const decoded = decodePlanetCode(code)
	if (!decoded) throw new Error(`Invalid smoke planet code: ${code}`)

	return {
		seed: decoded.seed,
		numPoints: decoded.numPoints ?? DEFAULT_WORLD_PARAMS.numPoints,
		numPlates: decoded.numPlates ?? DEFAULT_WORLD_PARAMS.numPlates,
		landDistribution:
			decoded.landDistribution ?? DEFAULT_WORLD_PARAMS.landDistribution,
		continentSizeVariety:
			decoded.continentSizeVariety ?? DEFAULT_WORLD_PARAMS.continentSizeVariety,
		landCoverage: decoded.landCoverage ?? DEFAULT_WORLD_PARAMS.landCoverage,
		jitter: decoded.jitter ?? DEFAULT_WORLD_PARAMS.jitter,
		roughness: decoded.roughness ?? DEFAULT_WORLD_PARAMS.roughness,
		terrainWarp: decoded.terrainWarp ?? DEFAULT_WORLD_PARAMS.terrainWarp,
		smoothing: decoded.smoothing ?? DEFAULT_WORLD_PARAMS.smoothing,
		hydraulicErosion:
			decoded.hydraulicErosion ?? DEFAULT_WORLD_PARAMS.hydraulicErosion,
		thermalErosion:
			decoded.thermalErosion ?? DEFAULT_WORLD_PARAMS.thermalErosion,
		ridgeSharpening:
			decoded.ridgeSharpening ?? DEFAULT_WORLD_PARAMS.ridgeSharpening,
		glacialErosion:
			decoded.glacialErosion ?? DEFAULT_WORLD_PARAMS.glacialErosion,
		volcanism: decoded.volcanism ?? DEFAULT_WORLD_PARAMS.volcanism,
		craters: decoded.craters ?? DEFAULT_WORLD_PARAMS.craters,
		planetRadiusKm:
			decoded.planetRadiusKm ?? DEFAULT_WORLD_PARAMS.planetRadiusKm,
		obliquity: decoded.obliquity ?? DEFAULT_WORLD_PARAMS.obliquity,
		eccentricity: decoded.eccentricity ?? DEFAULT_WORLD_PARAMS.eccentricity,
		sunTempFactor: decoded.sunTempFactor ?? DEFAULT_WORLD_PARAMS.sunTempFactor,
		insolationFactor:
			decoded.insolationFactor ?? DEFAULT_WORLD_PARAMS.insolationFactor,
		daysPerYear: decoded.daysPerYear ?? DEFAULT_WORLD_PARAMS.daysPerYear,
		hoursPerDay: decoded.hoursPerDay ?? DEFAULT_WORLD_PARAMS.hoursPerDay,
		tidallyLocked: decoded.tidallyLocked ?? false,
		antistellarLon:
			decoded.antistellarLon ?? DEFAULT_WORLD_PARAMS.antistellarLon,
		perihelion: decoded.perihelion ?? DEFAULT_WORLD_PARAMS.perihelion,
		pressure: decoded.pressure ?? DEFAULT_WORLD_PARAMS.pressure,
	}
}

function computePreviewAverageTempC(params: OrogenParams): number {
	const previewConfig = buildGenerationPreviewConfig({
		tidallyLocked: params.tidallyLocked,
		obliquity: params.obliquity,
		eccentricity: params.eccentricity,
		perihelion: params.perihelion,
		antistellarLon: params.antistellarLon,
		sunTempFactor: params.sunTempFactor,
		insolationFactor: params.insolationFactor,
		hoursPerDay: params.hoursPerDay,
		daysPerYear: params.daysPerYear,
		landCoverage: params.landCoverage,
		planetRadiusKm: params.planetRadiusKm,
		pressure: params.pressure,
	})

	const model = new EnergyBalanceModel({
		orbital: {
			OBLIQUITY: previewConfig.obliquity,
			ECCENTRICITY: previewConfig.eccentricity,
			PERIHELION: previewConfig.perihelion,
		},
		stellar: {
			...EMB_CONSTANTS.stellar,
			T_SUN: previewConfig.tSun,
		},
		time: {
			HOURS_PER_DAY: previewConfig.hoursPerDay,
			YEAR_LENGTH_DAYS: previewConfig.daysPerYear,
		},
		landFraction: new Array(EMB_CONSTANTS.grid.NUM_LAT).fill(
			previewConfig.landFraction,
		),
		radius: previewConfig.radius * 1000,
		pressure: previewConfig.pressure,
	})
	model.runModel(30, 0.5)

	let totalWeightedTemp = 0
	let totalArea = 0
	for (let i = 0; i < model.lats_deg.length; i++) {
		const latAvg = model.temperature_avg[i]
		const areaWeight = model.dx[i]
		totalWeightedTemp += latAvg * areaWeight
		totalArea += areaWeight
	}
	return totalWeightedTemp / Math.max(totalArea, 1)
}

function average(values: ArrayLike<number>): number {
	let sum = 0
	for (let i = 0; i < values.length; i++) sum += values[i]
	return sum / Math.max(1, values.length)
}

function min(values: ArrayLike<number>): number {
	let result = Infinity
	for (let i = 0; i < values.length; i++) result = Math.min(result, values[i])
	return Number.isFinite(result) ? result : 0
}

function max(values: ArrayLike<number>): number {
	let result = -Infinity
	for (let i = 0; i < values.length; i++) result = Math.max(result, values[i])
	return Number.isFinite(result) ? result : 0
}

function summarizeWorld(world: OrogenWorld) {
	const landCount = world.isLand.reduce((sum, value) => sum + value, 0)
	let landTempSum = 0
	let landTempCount = 0
	for (let r = 0; r < world.mesh.numRegions; r++) {
		if (!world.isLand[r]) continue
		landTempSum += world.climate.temperature_avg[r]
		landTempCount++
	}

	return {
		numRegions: world.mesh.numRegions,
		numPlates: world.plates.length,
		landPercent: (landCount / Math.max(1, world.mesh.numRegions)) * 100,
		avgTempC: average(world.climate.temperature_avg),
		landAvgTempC: landTempSum / Math.max(1, landTempCount),
		minTempC: min(world.climate.temperature_min),
		maxTempC: max(world.climate.temperature_max),
		continentCount: world.continentCount,
		provinceCount: world.provinces?.count ?? 0,
		nationCount: world.nations?.count ?? 0,
	}
}

function createDeterministicFingerprint() {
	const state = new Uint32Array([
		0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35, 0x27d4eb2f, 0x165667b1,
		0xd3a2646c, 0xfd7046c5,
	])

	const mix = (value: number) => {
		const word = value >>> 0
		for (let i = 0; i < state.length; i++) {
			const rotated = ((word << (i + 1)) | (word >>> (31 - i))) >>> 0
			state[i] ^= rotated
			state[i] = Math.imul(state[i], 16777619) >>> 0
			state[i] = (state[i] + ((word ^ (i * 0x9e3779b9)) >>> 0)) >>> 0
		}
	}

	return {
		updateString(value: string) {
			for (let i = 0; i < value.length; i++) mix(value.charCodeAt(i))
		},
		updateArrayLike(values: ArrayLike<number>) {
			mix(values.length)
			for (let i = 0; i < values.length; i++) {
				mix(
					Number.isInteger(values[i])
						? values[i]
						: Math.fround(values[i]) * 1e6,
				)
			}
		},
		digestHex() {
			return Array.from(state, (value) =>
				value.toString(16).padStart(8, "0"),
			).join("")
		},
	}
}

function computeWorldFingerprint(world: OrogenWorld): string {
	const hash = createDeterministicFingerprint()
	hash.updateString(
		JSON.stringify({
			seed: world.params.seed,
			numRegions: world.mesh.numRegions,
			numPlates: world.plates.length,
			continentCount: world.continentCount,
			provinceCount: world.provinces?.count ?? 0,
			nationCount: world.nations?.count ?? 0,
		}),
	)
	hash.updateArrayLike(world.isLand)
	hash.updateArrayLike(world.elevation)
	hash.updateArrayLike(world.elevation_km)
	hash.updateArrayLike(world.climate.temperature_avg)
	hash.updateArrayLike(world.rainfall.annual)
	hash.updateArrayLike(world.rivers.flow)
	hash.updateArrayLike(world.topography)
	hash.updateArrayLike(world.climateZones)
	hash.updateArrayLike(world.koppenClimate)
	if (world.provinces) hash.updateArrayLike(world.provinces.regionProvince)
	if (world.population) hash.updateArrayLike(world.population.population)
	return hash.digestHex()
}

function summarizeDistribution(
	values: ArrayLike<number>,
	labels: readonly string[],
	excludedIndices: readonly number[] = [],
): Array<{ label: string; count: number; pct: string }> {
	const excluded = new Set(excludedIndices)
	const counts = new Int32Array(labels.length)
	let includedTotal = 0
	for (let i = 0; i < values.length; i++) {
		const value = values[i]
		if (value >= 0 && value < counts.length && !excluded.has(value)) {
			counts[value]++
			includedTotal++
		}
	}

	return labels
		.map((label, index) => ({
			label,
			count: counts[index],
			pct: `${((counts[index] / Math.max(1, includedTotal)) * 100).toFixed(1)}%`,
		}))
		.filter((entry, index) => !excluded.has(index) && entry.count > 0)
}

describe("full world smoke generation", () => {
	it("generates a world using the configured smoke planet code", () => {
		const params = buildSmokeParams(SMOKE_PLANET_CODE)
		const previewAvgTempC = computePreviewAverageTempC(params)
		const world = generateOrogenWorld(params)
		const summary = summarizeWorld(world)
		const fingerprint = computeWorldFingerprint(world)

		console.info("Smoke planet code", SMOKE_PLANET_CODE)
		console.info("Decoded smoke params", {
			seed: params.seed,
			numPoints: params.numPoints,
			numPlates: params.numPlates,
			landDistribution: params.landDistribution,
			landCoverage: params.landCoverage,
			planetRadiusKm: params.planetRadiusKm,
			obliquity: params.obliquity,
			eccentricity: params.eccentricity,
			sunTempFactor: params.sunTempFactor,
			daysPerYear: params.daysPerYear,
			hoursPerDay: params.hoursPerDay,
			pressure: params.pressure,
			tidallyLocked: params.tidallyLocked,
			perihelion: params.perihelion,
			antistellarLon: params.antistellarLon,
		})
		console.info("Smoke climate summary", {
			previewAvgTempC: Number(previewAvgTempC.toFixed(1)),
			finalAvgTempC: Number(summary.avgTempC.toFixed(1)),
			finalLandAvgTempC: Number(summary.landAvgTempC.toFixed(1)),
			finalMinTempC: Number(summary.minTempC.toFixed(1)),
			finalMaxTempC: Number(summary.maxTempC.toFixed(1)),
			landPercent: Number(summary.landPercent.toFixed(1)),
			continentCount: summary.continentCount,
			provinceCount: summary.provinceCount,
			nationCount: summary.nationCount,
		})
		console.info("Smoke world fingerprint", fingerprint)
		console.info("Hotspot above-water summary", world.volcanism.hotspotExposure)
		console.info("Vegetation distribution")
		console.table(summarizeDistribution(world.vegetation, BIOME_LABELS, [0]))
		console.info("Basic climate distribution")
		console.table(
			summarizeDistribution(world.climateZones, CLIMATE_LABELS, [0]),
		)
		console.info("Pasta climate distribution")
		console.table(summarizeDistribution(world.pastaClimate, PASTA_LABELS, [0]))
		console.info("Topography distribution")
		console.table(
			summarizeDistribution(world.topography, OROGEN_TOPOGRAPHY_LABELS, [5, 6]),
		)
		if (world.tradeGoods) {
			console.info(
				`Trade good distribution (${world.locations?.count ?? 0} locations, ${world.tradeGoods.material.filter((v) => v > 0).length} assigned)`,
			)
			console.table(
				summarizeDistribution(
					world.tradeGoods.material,
					TRADE_GOOD_LABELS,
					[0],
				),
			)
		}
		// Trade route diagnostics
		if (
			world.nations &&
			world.provinces &&
			world.population &&
			world.coastal &&
			world.rivers?.visible &&
			world.cultures
		) {
			const THRESHOLD = 20_000
			const historyTimings: Array<{ Stage: string; ms: string }> = []
			const t0 = performance.now()
			const state = initHistory({
				nations: world.nations,
				provinces: world.provinces,
				population: world.population,
				coastal: world.coastal,
				waterAccess: world.waterAccess,
				riverVisible: world.rivers.visible,
				r_xyz: world.mesh.r_xyz,
				cultures: world.cultures,
				seed: world.params.seed,
				landmarks: world.landmarks,
				regionProvince: world.provinces.regionProvince,
				regionAdjOffset: world.mesh.adjOffset,
				regionAdjList: world.mesh.adjList,
				regionIsLand: world.isLand,
				planetRadiusKm: world.params.planetRadiusKm,
				settlementRegions: world.settlementRegions,
				settlementWaterLandmarks: world.settlementWaterLandmarks,
				settlementPortRegions: world.settlementPortRegions,
				timings: historyTimings,
			})
			world.timings ??= []
			world.timings.push({
				Stage: "initHistory",
				ms: (performance.now() - t0).toFixed(1),
			})
			world.timings.push(...historyTimings)
			if (world.timings.length > 0) console.table(world.timings)

			const routeTimings = selectTimingStages(historyTimings, [
				"initHistory:",
				"computeRoutes:",
			])
			if (routeTimings.length > 0) {
				console.info("Trade route timing diagnostics")
				console.table(routeTimings)
			}

			// Collect landmark -> settlement count + route count
			const landmarkCities = new Map<number, number>()
			const landmarkSettlements = new Map<number, number>()
			const landmarkMajorRoutes = new Map<number, number>()
			const landmarkMinorRoutes = new Map<number, number>()
			const landmarkSeaRoutes = new Map<number, number>()
			const P = state.P
			const seeds = state.provinceSeeds
			const lmData = world.landmarks
			const urbanPopulation = new Float32Array(P)
			for (let p = 0; p < P; p++) {
				const urban = PROV.population.urban.get(state, p)
				urbanPopulation[p] = urban
				const r = seeds[p]
				if (r < 0 || !lmData) continue
				const lmId = lmData.regionLandmark[r]
				if (lmId < 0) continue
				if (urban > 1_000) {
					landmarkSettlements.set(
						lmId,
						(landmarkSettlements.get(lmId) ?? 0) + 1,
					)
				}
				if (urban < THRESHOLD) continue
				landmarkCities.set(lmId, (landmarkCities.get(lmId) ?? 0) + 1)
			}
			for (const route of state.routes) {
				if (!lmData) continue
				const lmId =
					route.kind === ROUTE_SEA
						? (world.settlementWaterLandmarks?.[route.fromProvince] ?? -1)
						: (lmData.regionLandmark[route.pathRegions[0] ?? -1] ?? -1)
				if (lmId < 0) continue
				if (route.kind === ROUTE_LAND_MAJOR) {
					landmarkMajorRoutes.set(
						lmId,
						(landmarkMajorRoutes.get(lmId) ?? 0) + 1,
					)
				} else if (route.kind === ROUTE_LAND_MINOR) {
					landmarkMinorRoutes.set(
						lmId,
						(landmarkMinorRoutes.get(lmId) ?? 0) + 1,
					)
				} else if (route.kind === ROUTE_SEA) {
					landmarkSeaRoutes.set(lmId, (landmarkSeaRoutes.get(lmId) ?? 0) + 1)
				}
			}
			let longestMajorRoadKm = 0
			let longestMajorRoad:
				| {
						fromProvince: number
						toProvince: number
						lengthKm: number
				  }
				| undefined
			const seaRoutesCrossingLand: Array<{
				fromProvince: number
				toProvince: number
				waterLandmark: number
				interiorLandRegions: number[]
				pathPreview: number[]
			}> = []
			for (const route of state.routes) {
				if (route.kind === ROUTE_LAND_MAJOR) {
					const lengthKm = regionPathLengthKm(
						world.mesh.r_xyz,
						route.pathRegions,
						world.params.planetRadiusKm,
					)
					if (lengthKm <= longestMajorRoadKm) continue
					longestMajorRoadKm = lengthKm
					longestMajorRoad = {
						fromProvince: route.fromProvince,
						toProvince: route.toProvince,
						lengthKm,
					}
				}
				if (route.kind !== ROUTE_SEA) continue
				const interiorLandRegions = route.pathRegions
					.slice(1, -1)
					.filter((region) => world.isLand[region] === 1)
				if (interiorLandRegions.length === 0) continue
				seaRoutesCrossingLand.push({
					fromProvince: route.fromProvince,
					toProvince: route.toProvince,
					waterLandmark:
						world.settlementWaterLandmarks?.[route.fromProvince] ?? -1,
					interiorLandRegions,
					pathPreview:
						route.pathRegions.length > 12
							? [
									...route.pathRegions.slice(0, 6),
									-1,
									...route.pathRegions.slice(-5),
								]
							: [...route.pathRegions],
				})
				if (seaRoutesCrossingLand.length >= 5) {
					// Limit console noise while still proving the failure mode.
					break
				}
			}

			const diagEntries: Array<{
				lmId: number
				type: string
				size: number
				settlementsOver1k: number
				cities: number
				majorRoads: number
				minorRoads: number
				seaRoutes: number
			}> = []
			const allLandmarks = new Set<number>([
				...landmarkCities.keys(),
				...landmarkSettlements.keys(),
				...landmarkMajorRoutes.keys(),
				...landmarkMinorRoutes.keys(),
				...landmarkSeaRoutes.keys(),
			])
			for (const lmId of allLandmarks) {
				diagEntries.push({
					lmId,
					type: lmData
						? (
								["continent", "island", "isle", "ocean", "sea", "lake"] as const
							)[lmData.type[lmId]]
						: "?",
					size: lmData?.size[lmId] ?? 0,
					settlementsOver1k: landmarkSettlements.get(lmId) ?? 0,
					cities: landmarkCities.get(lmId) ?? 0,
					majorRoads: landmarkMajorRoutes.get(lmId) ?? 0,
					minorRoads: landmarkMinorRoutes.get(lmId) ?? 0,
					seaRoutes: landmarkSeaRoutes.get(lmId) ?? 0,
				})
			}
			diagEntries.sort(
				(a, b) =>
					b.majorRoads +
						b.minorRoads +
						b.seaRoutes -
						(a.majorRoads + a.minorRoads + a.seaRoutes) || b.cities - a.cities,
			)

			// Deeper connectivity diagnostics
			const CONN_THRESHOLD = 20_000
			const diagProvLandmark = new Int32Array(state.P).fill(-1)
			if (lmData) {
				for (let p = 0; p < state.P; p++) {
					const r = seeds[p]
					if (r < 0) continue
					const lmId = lmData.regionLandmark[r]
					if (lmId < 0) continue
					diagProvLandmark[p] = lmId
				}
			}
			for (const entry of diagEntries) {
				const lmId = entry.lmId
				const cityProvs: number[] = []
				for (let p = 0; p < state.P; p++) {
					if (diagProvLandmark[p] !== lmId) continue
					const urban = PROV.population.urban.get(state, p)
					if (urban >= CONN_THRESHOLD) cityProvs.push(p)
				}
				// Log sample urban pops
				const samplePops: number[] = []
				for (let i = 0; i < Math.min(cityProvs.length, 5); i++) {
					samplePops.push(PROV.population.urban.get(state, cityProvs[i]))
				}
				console.info(
					`  lmId=${lmId} (${entry.type}): ${cityProvs.length} cities, sample urban pops: [${samplePops.join(", ")}]`,
				)
			}
			console.info(
				`Infrastructure diagnostics (threshold >= ${THRESHOLD.toLocaleString()})`,
			)
			console.table(diagEntries)
			console.info(
				`Total settlements >1k: ${diagEntries.reduce((s, e) => s + e.settlementsOver1k, 0)}, Total cities: ${diagEntries.reduce((s, e) => s + e.cities, 0)}, Major roads: ${state.routes.filter((route) => route.kind === ROUTE_LAND_MAJOR).length}, Minor roads: ${state.routes.filter((route) => route.kind === ROUTE_LAND_MINOR).length}, Sea routes: ${state.routes.filter((route) => route.kind === ROUTE_SEA).length}`,
			)
			const seaPortDiagnostics = collectSeaRoutePortDiagnostics({
				urbanPopulation,
				settlementRegions:
					world.settlementRegions ?? new Int32Array(state.P).fill(-1),
				settlementWaterLandmarks:
					world.settlementWaterLandmarks ?? new Int32Array(state.P).fill(-1),
				settlementPortRegions:
					world.settlementPortRegions ?? new Int32Array(state.P).fill(-1),
				routes: state.routes,
				minPopulation: SEA_ROUTE_PORT_MIN_POPULATION,
			})
			console.info(
				`Eligible sea ports (urban >= ${SEA_ROUTE_PORT_MIN_POPULATION.toLocaleString()}): ${seaPortDiagnostics.eligiblePorts}, with sea routes: ${seaPortDiagnostics.portsWithSeaRoutes}, without sea routes: ${seaPortDiagnostics.missingPorts.length}`,
			)
			if (seaPortDiagnostics.missingPorts.length > 0) {
				console.info("Eligible urban ports without sea routes")
				console.table(seaPortDiagnostics.missingPorts)
			}
			const corridorEntries = buildTradeRouteCorridors(state.network)
			const edgeCounts = {
				major: state.network.filter((edge) => edge.kind === ROUTE_LAND_MAJOR)
					.length,
				minor: state.network.filter((edge) => edge.kind === ROUTE_LAND_MINOR)
					.length,
				sea: state.network.filter((edge) => edge.kind === ROUTE_SEA).length,
			}
			const corridorCounts = {
				major: corridorEntries.filter(
					(corridor) => corridor.kind === ROUTE_LAND_MAJOR,
				).length,
				minor: corridorEntries.filter(
					(corridor) => corridor.kind === ROUTE_LAND_MINOR,
				).length,
				sea: corridorEntries.filter((corridor) => corridor.kind === ROUTE_SEA)
					.length,
			}
			console.info(
				`Infrastructure edges -> corridors: major ${edgeCounts.major} -> ${corridorCounts.major}, minor ${edgeCounts.minor} -> ${corridorCounts.minor}, sea ${edgeCounts.sea} -> ${corridorCounts.sea}, total ${state.network.length} -> ${corridorEntries.length}`,
			)
			console.info(
				`Corridor reduction: ${state.network.length === 0 ? "n/a" : `${(((state.network.length - corridorEntries.length) / state.network.length) * 100).toFixed(1)}% fewer draw units after corridor collapse`}`,
			)
			if (longestMajorRoad) {
				console.info(
					`Longest major road: ${longestMajorRoad.lengthKm.toFixed(1)} km (province ${longestMajorRoad.fromProvince} -> province ${longestMajorRoad.toProvince})`,
				)
			}
			if (seaRoutesCrossingLand.length > 0) {
				console.warn(
					`Sea routes crossing land in interior: ${seaRoutesCrossingLand.length}`,
				)
				console.table(seaRoutesCrossingLand)
			} else {
				console.info("Sea routes crossing land in interior: 0")
			}
		}

		expect(world.mesh.numRegions).toBeGreaterThan(0)
		expect(world.params.seed).toBe(params.seed)
		expect(world.params.sunTempFactor).toBe(params.sunTempFactor)
		expect(world.params.pressure).toBe(params.pressure)
		expect(world.plates.length).toBe(params.numPlates)
		expect(world.climate.temperature_avg.length).toBe(world.mesh.numRegions)
		expect(Number.isFinite(summary.avgTempC)).toBe(true)
		expect(fingerprint.length).toBe(64)
		expect(world.volcanism.hotspotExposure).toBeDefined()
	}, 300_000)

	it("logs pasta distributions for frozen, refuge, and hothouse volcanic scenarios", () => {
		const base = buildSmokeParams(SMOKE_PLANET_CODE)
		const scenarioParams: Array<{
			name: string
			params: OrogenParams
		}> = [
			{
				name: "frozen-control",
				params: {
					...base,
					numPoints: 60_000,
					sunTempFactor: 0.89,
					pressure: 1,
					volcanism: 1,
				},
			},
			{
				name: "volcanic-refugia",
				params: {
					...base,
					numPoints: 60_000,
					sunTempFactor: 0.89,
					pressure: 1,
					volcanism: 10,
				},
			},
			{
				name: "high-pressure-hothouse",
				params: {
					...base,
					numPoints: 60_000,
					sunTempFactor: 0.89,
					pressure: 100,
					volcanism: 10,
				},
			},
		]

		const results = scenarioParams.map(({ name, params }) => {
			const world = generateOrogenWorld(params)
			const summary = summarizeWorld(world)
			const exposure = world.volcanism.hotspotExposure
			console.info("Volcanic climate scenario", {
				name,
				pressure: params.pressure,
				volcanism: params.volcanism,
				sunTempFactor: params.sunTempFactor,
				avgTempC: Number(summary.avgTempC.toFixed(1)),
				landAvgTempC: Number(summary.landAvgTempC.toFixed(1)),
				minTempC: Number(summary.minTempC.toFixed(1)),
				maxTempC: Number(summary.maxTempC.toFixed(1)),
			})
			console.table(
				summarizeDistribution(world.pastaClimate, PASTA_LABELS, [0]),
			)
			return { name, summary, exposure }
		})

		expect(results[1].exposure?.activeCells ?? 0).toBeGreaterThan(
			results[0].exposure?.activeCells ?? 0,
		)
		expect(
			results[1].exposure?.aboveWaterAfterFlood ?? 0,
		).toBeGreaterThanOrEqual(results[0].exposure?.aboveWaterAfterFlood ?? 0)
		expect(results[1].summary.maxTempC).toBeGreaterThan(0)
		expect(results[2].summary.avgTempC).toBeGreaterThan(
			results[1].summary.avgTempC,
		)
		expect(results[2].summary.minTempC).toBeGreaterThan(
			results[1].summary.minTempC,
		)
	}, 300_000)
})
