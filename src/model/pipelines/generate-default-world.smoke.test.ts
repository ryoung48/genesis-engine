import { describe, expect, it } from "vitest"
import { GENESIS_TOPOGRAPHY_LABELS } from "@/model"
import { type MainSequenceClass, STAR } from "@/model/celestial/star"
import {
	BIOME_LABELS,
	CLIMATE_LABELS,
	EMB_CONSTANTS,
	EnergyBalanceModel,
	PASTA_LABELS,
} from "@/model/climate"
import { TRADE_GOOD_LABELS } from "@/model/economy"
import { decodePlanetCode, encodePlanetCode } from "@/model/shared"
import { ERA_ORDER } from "@/model/society"
import { LANDMARK_TYPE_LAKE } from "@/model/terrain"
import { DEFAULT_WORLD_PARAMS } from "@/ui/planet/screen/generation/defaults"
import { buildGenerationPreviewConfig } from "@/ui/planet/screen/generation/generation-preview"
import type { GenesisParams } from ".."
import type { GenesisWorld } from "../world"
import { generateGenesisWorld } from "./generate-world"

const SMOKE_PLANET_SEED = 14963991
const SMOKE_PLANET_CODE = encodePlanetCode(SMOKE_PLANET_SEED, {
	seed: SMOKE_PLANET_SEED,
	...DEFAULT_WORLD_PARAMS,
	tideLock: null,
})

function buildSmokeParams(code: string): GenesisParams {
	const decoded = decodePlanetCode(code)
	if (!decoded) throw new Error(`Invalid smoke planet code: ${code}`)

	return {
		seed: decoded.seed,
		numPoints: decoded.numPoints ?? DEFAULT_WORLD_PARAMS.numPoints,
		numPlates: DEFAULT_WORLD_PARAMS.numPlates,
		landDistribution:
			decoded.landDistribution ?? DEFAULT_WORLD_PARAMS.landDistribution,
		continentSizeVariety:
			decoded.continentSizeVariety ?? DEFAULT_WORLD_PARAMS.continentSizeVariety,
		landCoverage: decoded.landCoverage ?? DEFAULT_WORLD_PARAMS.landCoverage,
		jitter: DEFAULT_WORLD_PARAMS.jitter,
		roughness: DEFAULT_WORLD_PARAMS.roughness,
		terrainWarp: DEFAULT_WORLD_PARAMS.terrainWarp,
		smoothing: DEFAULT_WORLD_PARAMS.smoothing,
		hydraulicErosion: DEFAULT_WORLD_PARAMS.hydraulicErosion,
		thermalErosion: DEFAULT_WORLD_PARAMS.thermalErosion,
		ridgeSharpening: DEFAULT_WORLD_PARAMS.ridgeSharpening,
		glacialErosion: DEFAULT_WORLD_PARAMS.glacialErosion,
		seaLevel: decoded.seaLevel ?? DEFAULT_WORLD_PARAMS.seaLevel,
		volcanism: decoded.volcanism ?? DEFAULT_WORLD_PARAMS.volcanism,
		craters: decoded.craters ?? DEFAULT_WORLD_PARAMS.craters,
		planetRadiusKm:
			decoded.planetRadiusKm ?? DEFAULT_WORLD_PARAMS.planetRadiusKm,
		obliquity: decoded.obliquity ?? DEFAULT_WORLD_PARAMS.obliquity,
		eccentricity: decoded.eccentricity ?? DEFAULT_WORLD_PARAMS.eccentricity,
		spectralClass: decoded.spectralClass ?? DEFAULT_WORLD_PARAMS.spectralClass,
		starSubtype: decoded.starSubtype ?? DEFAULT_WORLD_PARAMS.starSubtype,
		orbitalDistanceAU:
			decoded.orbitalDistanceAU ?? DEFAULT_WORLD_PARAMS.orbitalDistanceAU,
		daysPerYear: decoded.daysPerYear ?? DEFAULT_WORLD_PARAMS.daysPerYear,
		hoursPerDay: decoded.hoursPerDay ?? DEFAULT_WORLD_PARAMS.hoursPerDay,
		tideLock: decoded.tideLock,
		substellarLon: decoded.substellarLon ?? DEFAULT_WORLD_PARAMS.substellarLon,
		perihelion: decoded.perihelion ?? DEFAULT_WORLD_PARAMS.perihelion,
		pressure: decoded.pressure ?? DEFAULT_WORLD_PARAMS.pressure,
	}
}

function computePreviewAverageTempC(params: GenesisParams): number {
	const previewConfig = buildGenerationPreviewConfig({
		tideLock: params.tideLock,
		obliquity: params.obliquity,
		eccentricity: params.eccentricity,
		perihelion: params.perihelion,
		substellarLon: params.substellarLon,
		spectralClass: params.spectralClass,
		starSubtype: params.starSubtype,
		orbitalDistanceAU: params.orbitalDistanceAU,
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
			T_SUN: STAR.getStarTemperatureK({
				cls: previewConfig.spectralClass as MainSequenceClass,
				subtype: previewConfig.starSubtype,
			}),
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
	model.runModel({ years: 30, dtDays: 0.5 })

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

function summarizeWorld(world: GenesisWorld) {
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

function computeWorldFingerprint(world: GenesisWorld): string {
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
		const world = generateGenesisWorld(params)
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
			spectralClass: params.spectralClass,
			starSubtype: params.starSubtype,
			orbitalDistanceAU: params.orbitalDistanceAU,
			daysPerYear: params.daysPerYear,
			hoursPerDay: params.hoursPerDay,
			pressure: params.pressure,
			tideLock: params.tideLock,
			perihelion: params.perihelion,
			substellarLon: params.substellarLon,
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
			summarizeDistribution(
				world.topography,
				GENESIS_TOPOGRAPHY_LABELS,
				[5, 6],
			),
		)
		if (world.tidalRange) {
			const { adjOffset, adjList } = world.mesh
			const isLand = world.isLand
			const tidalRange = world.tidalRange
			const N = world.mesh.numRegions
			function isLakeLandmark(r: number): boolean {
				if (!world.landmarks) return false
				const lid = world.landmarks.regionLandmark[r]
				return lid >= 0 && world.landmarks.type[lid] === LANDMARK_TYPE_LAKE
			}

			// ── Land coastal cells (enclosure-based source values) ────────────
			let lMicro = 0,
				lMeso = 0,
				lMacro = 0,
				lTotal = 0
			let lMax = 0

			for (let r = 0; r < N; r++) {
				if (!isLand?.[r]) continue
				let bordersOcean = false
				for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
					const nb = adjList[j]
					if (!isLand[nb] && !isLakeLandmark(nb)) {
						bordersOcean = true
						break
					}
				}
				if (!bordersOcean) continue
				const val = tidalRange[r] ?? 0
				lTotal++
				if (val > lMax) lMax = val
				if (val < 1) lMicro++
				else if (val < 3) lMeso++
				else lMacro++
			}

			// ── Coastal-ocean cells (first Dijkstra hop from land) ────────────
			let oMicro = 0,
				oMeso = 0,
				oMacro = 0,
				oTotal = 0
			let oMax = 0,
				oSum = 0

			for (let r = 0; r < N; r++) {
				if (isLand?.[r] || isLakeLandmark(r)) continue
				let bordersLand = false
				for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
					if (isLand?.[adjList[j]]) {
						bordersLand = true
						break
					}
				}
				if (!bordersLand) continue
				const val = tidalRange[r] ?? 0
				oTotal++
				oSum += val
				if (val > oMax) oMax = val
				if (val < 1) oMicro++
				else if (val < 3) oMeso++
				else oMacro++
			}

			const lpct = (n: number) =>
				lTotal > 0 ? `${((n / lTotal) * 100).toFixed(1)}%` : "–"
			const opct = (n: number) =>
				oTotal > 0 ? `${((n / oTotal) * 100).toFixed(1)}%` : "–"

			console.info("Tidal range — land coastal cells (source values)")
			console.table({
				micro_lt1m: { count: lMicro, pct: lpct(lMicro), label: "< 1 m" },
				meso_1_3m: { count: lMeso, pct: lpct(lMeso), label: "1–3 m" },
				macro_gt3m: { count: lMacro, pct: lpct(lMacro), label: "> 3 m" },
				total: { count: lTotal, pct: "100%", label: "all" },
			})
			console.info(`  max land tidal: ${lMax.toFixed(2)} m`)

			console.info("Tidal range — coastal-ocean cells (Dijkstra propagated)")
			console.table({
				micro_lt1m: { count: oMicro, pct: opct(oMicro), label: "< 1 m" },
				meso_1_3m: { count: oMeso, pct: opct(oMeso), label: "1–3 m" },
				macro_gt3m: { count: oMacro, pct: opct(oMacro), label: "> 3 m" },
				total: { count: oTotal, pct: "100%", label: "all" },
			})
			console.info(
				`  max ocean tidal: ${oMax.toFixed(2)} m  avg: ${oTotal > 0 ? (oSum / oTotal).toFixed(2) : "–"} m`,
			)
		}
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

		expect(world.mesh.numRegions).toBeGreaterThan(0)
		expect(world.params.seed).toBe(params.seed)
		expect(world.params.spectralClass).toBe(params.spectralClass)
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
			params: GenesisParams
		}> = [
			{
				name: "frozen-control",
				params: {
					...base,
					numPoints: 60_000,
					spectralClass: "K",
					starSubtype: 0.5,
					orbitalDistanceAU: 1.0,
					pressure: 1,
					volcanism: 1,
				},
			},
			{
				name: "volcanic-refugia",
				params: {
					...base,
					numPoints: 60_000,
					spectralClass: "K",
					starSubtype: 0.5,
					orbitalDistanceAU: 1.0,
					pressure: 1,
					volcanism: 10,
				},
			},
			{
				name: "high-pressure-hothouse",
				params: {
					...base,
					numPoints: 60_000,
					spectralClass: "K",
					starSubtype: 0.5,
					orbitalDistanceAU: 1.0,
					pressure: 100,
					volcanism: 10,
				},
			},
		]

		const results = scenarioParams.map(({ name, params }) => {
			const world = generateGenesisWorld(params)
			const summary = summarizeWorld(world)
			const exposure = world.volcanism.hotspotExposure
			console.info("Volcanic climate scenario", {
				name,
				pressure: params.pressure,
				volcanism: params.volcanism,
				spectralClass: params.spectralClass,
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
		expect(results[2].summary.avgTempC).toBeGreaterThan(
			results[1].summary.avgTempC,
		)
		expect(results[2].summary.minTempC).toBeGreaterThan(
			results[1].summary.minTempC,
		)
	}, 300_000)

	it("neolithic era leaves most land stateless", () => {
		const base = buildSmokeParams(SMOKE_PLANET_CODE)
		const world = generateGenesisWorld({ ...base, era: "neolithic" })
		const provinceCount = world.provinces?.count ?? 0
		const nationCount = world.nations?.count ?? 0

		// Provinces left stateless (no nation) in the generated world.
		let statelessProvinces = 0
		const sovereign = world.nations?.sovereign
		if (sovereign && world.provinces) {
			for (let p = 0; p < world.provinces.count; p++) {
				if (!world.provinces.desolate[p] && sovereign[p] < 0)
					statelessProvinces++
			}
		}

		expect(provinceCount).toBeGreaterThan(0)
		expect(nationCount).toBeGreaterThan(0)
		// Nations cover only a small fraction of provinces at neolithic.
		expect(nationCount).toBeLessThan(provinceCount * 0.25)
		// Most land is settled-but-stateless.
		expect(statelessProvinces).toBeGreaterThan(provinceCount * 0.3)
	}, 120_000)

	it("late medieval era leaves no stateless non-desolate provinces", () => {
		const base = buildSmokeParams(SMOKE_PLANET_CODE)
		const world = generateGenesisWorld({ ...base, era: "lateMedieval" })

		let statelessProvinces = 0
		const sovereign = world.nations?.sovereign
		if (sovereign && world.provinces) {
			for (let p = 0; p < world.provinces.count; p++) {
				if (!world.provinces.desolate[p] && sovereign[p] < 0)
					statelessProvinces++
			}
		}

		expect(world.provinces?.count ?? 0).toBeGreaterThan(0)
		expect(world.nations?.count ?? 0).toBeGreaterThan(0)
		expect(statelessProvinces).toBe(0)
	}, 120_000)

	it("logs development stats for all era presets", () => {
		const DEV_BUCKETS = [
			{ label: "0–0.05", lo: 0, hi: 0.05 },
			{ label: "0.05–0.1", lo: 0.05, hi: 0.1 },
			{ label: "0.1–0.25", lo: 0.1, hi: 0.25 },
			{ label: "0.25–0.5", lo: 0.25, hi: 0.5 },
			{ label: "0.5–0.75", lo: 0.5, hi: 0.75 },
			{ label: "0.75+", lo: 0.75, hi: Infinity },
		]

		const base = buildSmokeParams(SMOKE_PLANET_CODE)
		for (const era of ERA_ORDER) {
			const world = generateGenesisWorld({ ...base, era })
			if (
				!world.nations ||
				!world.provinces ||
				!world.population ||
				!world.cultures
			) {
				console.info(`Era ${era}: no society data`)
				continue
			}
			const P = world.provinces.count
			const development = world.development
			if (!development) {
				console.info(`Era ${era}: no development data`)
				continue
			}
			let devSum = 0
			let nonDesolateCount = 0
			const bucketCounts = new Int32Array(DEV_BUCKETS.length)
			for (let p = 0; p < P; p++) {
				if (world.provinces.desolate[p]) continue
				const dev = development[p]
				devSum += dev
				nonDesolateCount++
				for (let b = 0; b < DEV_BUCKETS.length; b++) {
					if (dev >= DEV_BUCKETS[b].lo && dev < DEV_BUCKETS[b].hi) {
						bucketCounts[b]++
						break
					}
				}
			}
			const avgDev = nonDesolateCount > 0 ? devSum / nonDesolateCount : 0
			console.info(
				`\nEra: ${era} | provinces: ${P} | non-desolate: ${nonDesolateCount} | avg dev: ${avgDev.toFixed(3)}`,
			)
			console.table(
				DEV_BUCKETS.map((b, i) => ({
					bucket: b.label,
					count: bucketCounts[i],
					pct: `${((bucketCounts[i] / Math.max(1, nonDesolateCount)) * 100).toFixed(1)}%`,
				})),
			)
		}

		expect(true).toBe(true)
	}, 600_000)
})
