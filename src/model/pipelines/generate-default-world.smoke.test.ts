import { describe, expect, it } from "vitest"
import { OROGEN_TOPOGRAPHY_LABELS } from "@/model"
import { EnergyBalanceModel } from "@/model/climate/ebm"
import { EMB_CONSTANTS } from "@/model/climate/ebm/constants"
import { BIOME_LABELS, CLIMATE_LABELS } from "@/model/climate/vegetation"
import { decodePlanetCode } from "@/model/shared/planet-code"
import { DEFAULT_WORLD_PARAMS } from "@/planet/screen/generation/defaults"
import { buildGenerationPreviewConfig } from "@/planet/screen/generation/generation-preview"
import type { OrogenParams } from ".."
import type { OrogenWorld } from "../world"
import { generateOrogenWorld } from "./generate-world"

const SMOKE_PLANET_CODE = "8wqaf.080yudfjcze4m7yceeysl488rbtec5u"

function defaultTectonicMode(): OrogenParams["tectonicMode"] {
	return "active"
}

function buildSmokeParams(code: string): OrogenParams {
	const decoded = decodePlanetCode(code)
	if (!decoded) throw new Error(`Invalid smoke planet code: ${code}`)

	return {
		seed: decoded.seed,
		tectonicMode: decoded.tectonicMode ?? defaultTectonicMode(),
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
		sunTempFactor: params.sunTempFactor,
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
			tectonicMode: params.tectonicMode,
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
		console.info("Topography distribution")
		console.table(
			summarizeDistribution(world.topography, OROGEN_TOPOGRAPHY_LABELS, [5, 6]),
		)
		if (world.timings?.length) console.table(world.timings)

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
})
