import type { PopulationMapMode } from "@/components/world/types"
import {
	koppenClimateColor,
	koppenTrueColor,
} from "@/model/orogen/climate/koppen"
import { pastaClimateColor, pastaTrueColor } from "@/model/orogen/climate/pasta"
import { CHAOTIC_MAX, CHAOTIC_MIN } from "@/model/orogen/climate/vegetation"
import { ENABLE_PASTA_CLASSIFICATION } from "@/model/orogen/features"
import { OROGEN_TERRAIN_FEATURE } from "@/model/orogen/types"
import type { SerializedOrogenWorld } from "@/model/orogen/worker-types"
import type { ColorMode } from "../colors"
import {
	climateTempColor,
	climateZoneColor,
	dangerColor,
	getColor,
	gravityColor,
	hotspotColor,
	moistureDirectionalColor,
	OCEAN_LIGHT_BLUE,
	oceanCurrentColor,
	populationColor,
	precipitationColor,
	slopeColor,
	temperatureColor,
	temperatureDeltaColor,
	vegetationColor,
	windSpeedColor,
} from "../colors"
import {
	darkenClimateAtElevation,
	darkenVegetationAtElevation,
} from "./color-helpers"
import type { NationMapMode } from "./ModeBar"

function basinColor(id: number): [number, number, number] {
	if (id < 0) return OCEAN_LIGHT_BLUE
	let h = (id * 2654435761) >>> 0
	h ^= h >>> 16
	const hue = (h % 360) / 360
	const sat = 0.45 + ((h >>> 9) % 40) / 100
	const light = 0.42 + ((h >>> 17) % 18) / 100
	let r = light
	let g = light
	let b = light
	if (sat > 0) {
		const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat
		const p = 2 * light - q
		const hueToRgb = (t: number) => {
			let x = t
			if (x < 0) x += 1
			if (x > 1) x -= 1
			if (x < 1 / 6) return p + (q - p) * 6 * x
			if (x < 1 / 2) return q
			if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
			return p
		}
		r = hueToRgb(hue + 1 / 3)
		g = hueToRgb(hue)
		b = hueToRgb(hue - 1 / 3)
	}
	return [r, g, b]
}

const TERRAIN_FEATURE_COLORS: Record<number, [number, number, number]> = {
	[OROGEN_TERRAIN_FEATURE.RIFT_VALLEY]: [0.82, 0.29, 0.22],
	[OROGEN_TERRAIN_FEATURE.PULL_APART_BASIN]: [0.7, 0.22, 0.18],
	[OROGEN_TERRAIN_FEATURE.BACK_ARC_BASIN]: [0.95, 0.55, 0.22],
	[OROGEN_TERRAIN_FEATURE.FOLD_RIDGES]: [0.55, 0.24, 0.13],
	[OROGEN_TERRAIN_FEATURE.PLATEAU_UPLIFT]: [0.8, 0.65, 0.28],
	[OROGEN_TERRAIN_FEATURE.CONTINENTAL_INTERIOR]: [0.45, 0.63, 0.21],
	[OROGEN_TERRAIN_FEATURE.MID_OCEAN_RIDGE]: [0.17, 0.73, 0.88],
	[OROGEN_TERRAIN_FEATURE.FRACTURE_ZONE]: [0.18, 0.47, 0.92],
	[OROGEN_TERRAIN_FEATURE.TRENCH]: [0.07, 0.17, 0.46],
	[OROGEN_TERRAIN_FEATURE.COASTAL_ROUGHENING]: [0.98, 0.9, 0.5],
	[OROGEN_TERRAIN_FEATURE.ISLAND_ARC]: [0.9, 0.4, 0.72],
}

export function getTerrainFeatureColor(
	feature: number,
): [number, number, number] | null {
	return TERRAIN_FEATURE_COLORS[feature] ?? null
}

const LAND_FEATURE_MASK =
	(1 << (OROGEN_TERRAIN_FEATURE.RIFT_VALLEY - 1)) |
	(1 << (OROGEN_TERRAIN_FEATURE.PULL_APART_BASIN - 1)) |
	(1 << (OROGEN_TERRAIN_FEATURE.BACK_ARC_BASIN - 1)) |
	(1 << (OROGEN_TERRAIN_FEATURE.FOLD_RIDGES - 1)) |
	(1 << (OROGEN_TERRAIN_FEATURE.PLATEAU_UPLIFT - 1)) |
	(1 << (OROGEN_TERRAIN_FEATURE.CONTINENTAL_INTERIOR - 1))

const OCEAN_FEATURE_MASK =
	(1 << (OROGEN_TERRAIN_FEATURE.MID_OCEAN_RIDGE - 1)) |
	(1 << (OROGEN_TERRAIN_FEATURE.FRACTURE_ZONE - 1)) |
	(1 << (OROGEN_TERRAIN_FEATURE.TRENCH - 1)) |
	(1 << (OROGEN_TERRAIN_FEATURE.ISLAND_ARC - 1))

const COAST_FEATURE_MASK = 1 << (OROGEN_TERRAIN_FEATURE.COASTAL_ROUGHENING - 1)

const TOPOGRAPHY_COLORS: Record<number, [number, number, number]> = {
	0: [0x6c / 255, 0x9d / 255, 0x35 / 255], // flat
	1: [0x72 / 255, 0x84 / 255, 0x76 / 255], // hill
	2: [0x92 / 255, 0x76 / 255, 0x2d / 255], // plateau
	3: [0x6c / 255, 0x2c / 255, 0x14 / 255], // mountains
	4: [0x2d / 255, 0x8e / 255, 0x72 / 255], // marsh
	5: [0x75 / 255, 0xaf / 255, 0xd4 / 255], // ocean
	6: [0x75 / 255, 0xaf / 255, 0xd4 / 255], // lake
}

export function getTopographyColor(
	topography: number,
): [number, number, number] | null {
	return TOPOGRAPHY_COLORS[topography] ?? null
}

export function computeRegionColors(
	world: SerializedOrogenWorld,
	colorMode: ColorMode,
	nationMode: NationMapMode,
	populationMode: PopulationMapMode,
	temperatureMonth: number,
	rainfallMonth: number,
	windMonth: number,
	currentMonth: number,
	viewMode: "globe" | "map" = "globe",
): Float32Array | null {
	const N = world.mesh.numRegions
	const rgb = new Float32Array(N * 3)
	const darkenMapWaterTemperature =
		viewMode === "map" && colorMode === "temperature"
	const darkenMapWaterPastaClimate =
		viewMode === "map" && colorMode === "pastaClimate"
	const darkenMapWaterOceanCurrents =
		viewMode === "map" && colorMode === "oceanCurrents"
	const darkenMapWaterMoisture = viewMode === "map" && colorMode === "moisture"
	const mapWaterDarkenFactor = 0.74
	const windOceanDarkenFactor = 0.8

	if (colorMode === "slope") {
		const slopeScoreByRegion = world.slopeScore
		for (let r = 0; r < N; r++) {
			const slopeScore = slopeScoreByRegion?.[r] ?? 0
			const [cr, cg, cb] = slopeColor(slopeScore)
			if (world.isLand?.[r]) {
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			} else {
				rgb[3 * r] = cr * 0.45
				rgb[3 * r + 1] = cg * 0.55
				rgb[3 * r + 2] = Math.min(1, cb * 0.8 + 0.18)
			}
		}
		return rgb
	}

	if (colorMode === "topography" && world.topography) {
		for (let r = 0; r < N; r++) {
			const [cr, cg, cb] = TOPOGRAPHY_COLORS[world.topography[r]] ?? [1, 1, 1]
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		}
		return rgb
	}

	if (
		(colorMode === "temperature" || colorMode === "temperatureDelta") &&
		world.climate
	) {
		const temps =
			temperatureMonth === 0
				? world.climate.temperature_avg
				: world.climate.temperature_monthly.subarray(
						(temperatureMonth - 1) * N,
						temperatureMonth * N,
					)
		for (let r = 0; r < N; r++) {
			const [cr, cg, cb] =
				colorMode === "temperatureDelta"
					? temperatureDeltaColor(
							world.climate.temperature_max[r] -
								world.climate.temperature_min[r],
						)
					: temperatureColor(temps[r])
			const isWater = world.isLand ? !world.isLand[r] : world.elevation[r] <= 0
			const factor =
				darkenMapWaterTemperature && isWater ? mapWaterDarkenFactor : 1
			rgb[3 * r] = cr * factor
			rgb[3 * r + 1] = cg * factor
			rgb[3 * r + 2] = cb * factor
		}
		return rgb
	}

	if (colorMode === "precipitation" && world.rainfall) {
		if (rainfallMonth === 0) {
			for (let r = 0; r < N; r++) {
				const [cr, cg, cb] =
					world.elevation[r] <= 0
						? precipitationColor(world.rainfall.annual[r] / 12)
						: darkenClimateAtElevation(
								precipitationColor(world.rainfall.annual[r] / 12),
								world.elevation_km[r],
							)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			}
		} else {
			const offset = (rainfallMonth - 1) * N
			for (let r = 0; r < N; r++) {
				const [cr, cg, cb] =
					world.elevation[r] <= 0
						? precipitationColor(world.rainfall.monthly[offset + r])
						: darkenClimateAtElevation(
								precipitationColor(world.rainfall.monthly[offset + r]),
								world.elevation_km[r],
							)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			}
		}
		for (let r = 0; r < N; r++) {
			if (world.elevation[r] <= 0) {
				rgb[3 * r] = OCEAN_LIGHT_BLUE[0]
				rgb[3 * r + 1] = OCEAN_LIGHT_BLUE[1]
				rgb[3 * r + 2] = OCEAN_LIGHT_BLUE[2]
			}
		}
		return rgb
	}

	if (colorMode === "moisture" && world.rainfall) {
		if (rainfallMonth === 0) {
			for (let r = 0; r < N; r++) {
				const east = world.rainfall.east[r]
				const west = world.rainfall.west[r]
				const moisture = Math.max(east, west)
				const dominantIsEast =
					Math.abs(east - west) < 0.02 ? moisture >= 0.35 : east > west
				const [cr, cg, cb] = moistureDirectionalColor(moisture, dominantIsEast)
				const isWater = world.isLand
					? !world.isLand[r]
					: world.elevation[r] <= 0
				const factor =
					darkenMapWaterMoisture && isWater ? mapWaterDarkenFactor : 1
				rgb[3 * r] = cr * factor
				rgb[3 * r + 1] = cg * factor
				rgb[3 * r + 2] = cb * factor
			}
		} else {
			for (let r = 0; r < N; r++) {
				const east = world.rainfall.east[r]
				const west = world.rainfall.west[r]
				const moisture = Math.max(east, west)
				const dominantIsEast =
					Math.abs(east - west) < 0.02 ? moisture >= 0.35 : east > west
				const [cr, cg, cb] = moistureDirectionalColor(moisture, dominantIsEast)
				const isWater = world.isLand
					? !world.isLand[r]
					: world.elevation[r] <= 0
				const factor =
					darkenMapWaterMoisture && isWater ? mapWaterDarkenFactor : 1
				rgb[3 * r] = cr * factor
				rgb[3 * r + 1] = cg * factor
				rgb[3 * r + 2] = cb * factor
			}
		}
		return rgb
	}

	if (colorMode === "vegetation" && world.vegetation) {
		const lakes = world.rivers?.lakes
		for (let r = 0; r < N; r++) {
			if (lakes?.[r]) {
				const [cr, cg, cb] = getColor(
					Math.min(0, world.elevation_km[r]),
					"terrain",
				)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			} else {
				const [cr, cg, cb] = darkenVegetationAtElevation(
					vegetationColor(world.vegetation[r]),
					world.elevation_km[r],
				)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			}
		}
		return rgb
	}

	if (
		ENABLE_PASTA_CLASSIFICATION &&
		colorMode === "pastaClimate" &&
		world.pastaClimate
	) {
		for (let r = 0; r < N; r++) {
			const [cr, cg, cb] = pastaClimateColor(world.pastaClimate[r])
			const isWater = world.isLand ? !world.isLand[r] : world.elevation[r] <= 0
			const factor =
				darkenMapWaterPastaClimate && isWater ? mapWaterDarkenFactor : 1
			rgb[3 * r] = cr * factor
			rgb[3 * r + 1] = cg * factor
			rgb[3 * r + 2] = cb * factor
		}
		return rgb
	}

	if (
		ENABLE_PASTA_CLASSIFICATION &&
		colorMode === "satellite" &&
		world.pastaClimate
	) {
		for (let r = 0; r < N; r++) {
			const [cr, cg, cb] = pastaTrueColor(world.pastaClimate[r])
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		}
		return rgb
	}

	if (colorMode === "satelliteKoppen" && world.koppenClimate) {
		for (let r = 0; r < N; r++) {
			const [cr, cg, cb] = koppenTrueColor(world.koppenClimate[r])
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		}
		return rgb
	}

	if (colorMode === "koppenClimate" && world.koppenClimate) {
		for (let r = 0; r < N; r++) {
			const [cr, cg, cb] = koppenClimateColor(world.koppenClimate[r])
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		}
		return rgb
	}

	if (colorMode.startsWith("debug") && world.pastaDebug) {
		const debugModeToKey = {
			debugGdd: "gdd",
			debugGddz: "gddz",
			debugGint: "gint",
			debugAr: "ar",
			debugGar: "gar",
			debugGrs: "grs",
			debugEvr: "evr",
			debugMinT: "minT",
			debugMaxT: "maxT",
		} as const
		const debugKey = debugModeToKey[colorMode as keyof typeof debugModeToKey]
		const data = world.pastaDebug[debugKey]
		// Find min/max for normalization (land only for most, all for minT/maxT)
		let lo = Infinity,
			hi = -Infinity
		for (let r = 0; r < N; r++) {
			if (
				!world.isLand?.[r] &&
				!colorMode.includes("MinT") &&
				!colorMode.includes("MaxT")
			)
				continue
			const v = data[r]
			// gint stores 99999 for infinity — skip for range
			if (v >= 99999) continue
			if (v < lo) lo = v
			if (v > hi) hi = v
		}
		if (lo === hi) {
			hi = lo + 1
		}
		const range = hi - lo
		for (let r = 0; r < N; r++) {
			if (
				!world.isLand?.[r] &&
				!colorMode.includes("MinT") &&
				!colorMode.includes("MaxT")
			) {
				rgb[3 * r] = 0.05
				rgb[3 * r + 1] = 0.08
				rgb[3 * r + 2] = 0.18
				continue
			}
			let v = data[r]
			if (v >= 99999) v = hi
			const t = Math.max(0, Math.min(1, (v - lo) / range))
			// Viridis-like: blue → cyan → green → yellow
			rgb[3 * r] = t < 0.5 ? t * 1.4 : 0.7 + (t - 0.5) * 0.6
			rgb[3 * r + 1] =
				t < 0.25 ? 0.05 + t * 2 : t < 0.75 ? 0.55 + (t - 0.25) * 0.9 : 1.0
			rgb[3 * r + 2] = t < 0.5 ? 0.5 - t * 0.8 : 0.1 - (t - 0.5) * 0.2
		}
		return rgb
	}

	if (colorMode === "climate" && world.climate) {
		const BLEND_THRESHOLD = 15
		const chaoticRgb = climateZoneColor(8)
		for (let r = 0; r < N; r++) {
			if (world.elevation[r] <= 0) {
				rgb[3 * r] = 0.05
				rgb[3 * r + 1] = 0.08
				rgb[3 * r + 2] = 0.18
				continue
			}
			let [cr, cg, cb] = climateTempColor(world.climate.temperature_avg[r])
			const minT = Math.min(
				BLEND_THRESHOLD,
				Math.max(CHAOTIC_MIN - world.climate.temperature_min[r], 0),
			)
			const maxT = Math.min(
				BLEND_THRESHOLD,
				Math.max(world.climate.temperature_max[r] - CHAOTIC_MAX, 0),
			)
			if (minT > 0 && maxT > 0) {
				const t = (minT + maxT) / 2 / BLEND_THRESHOLD
				cr += (chaoticRgb[0] - cr) * t
				cg += (chaoticRgb[1] - cg) * t
				cb += (chaoticRgb[2] - cb) * t
			}
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		}
		return rgb
	}

	if (colorMode === "windSpeed" && world.wind) {
		const lakes = world.rivers?.lakes
		if (windMonth === 0) {
			for (let r = 0; r < N; r++) {
				let speedSum = 0
				for (let m = 0; m < 12; m++)
					speedSum += world.wind.wind_speed_monthly[m * N + r]
				const [cr, cg, cb] = windSpeedColor(speedSum / 12)
				const isOcean = !world.isLand?.[r] && !lakes?.[r]
				const factor = isOcean ? windOceanDarkenFactor : 1
				rgb[3 * r] = cr * factor
				rgb[3 * r + 1] = cg * factor
				rgb[3 * r + 2] = cb * factor
			}
		} else {
			const off = (windMonth - 1) * N
			for (let r = 0; r < N; r++) {
				const [cr, cg, cb] = windSpeedColor(
					world.wind.wind_speed_monthly[off + r],
				)
				const isOcean = !world.isLand?.[r] && !lakes?.[r]
				const factor = isOcean ? windOceanDarkenFactor : 1
				rgb[3 * r] = cr * factor
				rgb[3 * r + 1] = cg * factor
				rgb[3 * r + 2] = cb * factor
			}
		}
		return rgb
	}

	if (colorMode === "oceanCurrents" && world.oceanCurrents) {
		const { temperatureDelta, temperatureDeltaMonthly } = world.oceanCurrents
		const monthly = currentMonth === 0 ? null : temperatureDeltaMonthly
		const offset = monthly ? (currentMonth - 1) * N : 0
		for (let r = 0; r < N; r++) {
			const isLand = !!world.isLand?.[r]
			const delta = monthly
				? (monthly[offset + r] ?? temperatureDelta?.[r] ?? 0)
				: (temperatureDelta?.[r] ?? 0)
			const colorValue = Math.max(-1, Math.min(1, delta / 15))
			const [cr, cg, cb] = oceanCurrentColor(colorValue)
			const factor =
				darkenMapWaterOceanCurrents && !isLand ? mapWaterDarkenFactor : 1
			rgb[3 * r] = cr * factor
			rgb[3 * r + 1] = cg * factor
			rgb[3 * r + 2] = cb * factor
		}
		return rgb
	}

	if (colorMode === "dangerZones" && world.hazards) {
		for (let r = 0; r < N; r++) {
			const isLand = !!world.isLand?.[r]
			const [cr, cg, cb] = isLand
				? darkenVegetationAtElevation(
						dangerColor(world.hazards.danger[r]),
						world.elevation_km[r],
					)
				: dangerColor(world.hazards.danger[r])
			const factor = viewMode === "map" && !isLand ? 0.78 : 1
			rgb[3 * r] = cr * factor
			rgb[3 * r + 1] = cg * factor
			rgb[3 * r + 2] = cb * factor
		}
		return rgb
	}

	if (colorMode === "hotspots" && world.volcanism) {
		let maxHotspot = 0
		for (let r = 0; r < N; r++) {
			if (world.volcanism.hotspot[r] > maxHotspot)
				maxHotspot = world.volcanism.hotspot[r]
		}
		const invMax = maxHotspot > 1e-6 ? 1 / maxHotspot : 0
		for (let r = 0; r < N; r++) {
			const isLand = !!world.isLand?.[r]
			const score = Math.max(
				0,
				Math.min(1, world.volcanism.hotspot[r] * invMax),
			)
			const [cr, cg, cb] = isLand
				? darkenVegetationAtElevation(
						hotspotColor(score),
						world.elevation_km[r],
					)
				: hotspotColor(score)
			const factor = viewMode === "map" && !isLand ? 0.82 : 1
			rgb[3 * r] = cr * factor
			rgb[3 * r + 1] = cg * factor
			rgb[3 * r + 2] = cb * factor
		}
		return rgb
	}

	if (colorMode === "nations" && world.provinces) {
		if (nationMode === "provinces") {
			const { regionProvince, colors: provColors, desolate } = world.provinces
			for (let r = 0; r < N; r++) {
				const p = regionProvince[r]
				if (p < 0) {
					rgb[3 * r] = OCEAN_LIGHT_BLUE[0]
					rgb[3 * r + 1] = OCEAN_LIGHT_BLUE[1]
					rgb[3 * r + 2] = OCEAN_LIGHT_BLUE[2]
				} else if (desolate[p]) {
					rgb[3 * r] = 0.35
					rgb[3 * r + 1] = 0.33
					rgb[3 * r + 2] = 0.32
				} else {
					rgb[3 * r] = provColors[3 * p]
					rgb[3 * r + 1] = provColors[3 * p + 1]
					rgb[3 * r + 2] = provColors[3 * p + 2]
				}
			}
			return rgb
		}
		if (world.nations) {
			const { regionProvince, desolate } = world.provinces
			for (let r = 0; r < N; r++) {
				const p = regionProvince[r]
				const n = p >= 0 ? world.nations.assignment[p] : -1
				if (p < 0) {
					rgb[3 * r] = OCEAN_LIGHT_BLUE[0]
					rgb[3 * r + 1] = OCEAN_LIGHT_BLUE[1]
					rgb[3 * r + 2] = OCEAN_LIGHT_BLUE[2]
				} else if (desolate[p] || n < 0) {
					rgb[3 * r] = 0.35
					rgb[3 * r + 1] = 0.33
					rgb[3 * r + 2] = 0.32
				} else {
					rgb[3 * r] = world.nations.colors[3 * n]
					rgb[3 * r + 1] = world.nations.colors[3 * n + 1]
					rgb[3 * r + 2] = world.nations.colors[3 * n + 2]
				}
			}
			return rgb
		}
	}

	if (colorMode === "provinces" && world.provinces) {
		const { regionProvince, colors: provColors, desolate } = world.provinces
		for (let r = 0; r < N; r++) {
			const p = regionProvince[r]
			if (p < 0) {
				rgb[3 * r] = OCEAN_LIGHT_BLUE[0]
				rgb[3 * r + 1] = OCEAN_LIGHT_BLUE[1]
				rgb[3 * r + 2] = OCEAN_LIGHT_BLUE[2]
			} else if (desolate[p]) {
				rgb[3 * r] = 0.35
				rgb[3 * r + 1] = 0.33
				rgb[3 * r + 2] = 0.32
			} else {
				rgb[3 * r] = provColors[3 * p]
				rgb[3 * r + 1] = provColors[3 * p + 1]
				rgb[3 * r + 2] = provColors[3 * p + 2]
			}
		}
		return rgb
	}

	if (colorMode === "population" && world.provinces) {
		const { regionProvince, desolate } = world.provinces
		const pop = world.population?.population
		const { size } = world.provinces
		let maxDensity = 0
		if (populationMode === "density" && pop) {
			for (let i = 0; i < world.provinces.count; i++) {
				if (!desolate[i] && size[i] > 0) {
					const d = pop[i] / size[i]
					if (d > maxDensity) maxDensity = d
				}
			}
		}
		let maxGravity = 0
		if (populationMode === "gravity" && world.nations?.gravity) {
			for (let i = 0; i < world.provinces.count; i++) {
				if (!desolate[i] && world.nations.gravity[i] > maxGravity)
					maxGravity = world.nations.gravity[i]
			}
		}
		const invMax = maxDensity > 0 ? 1 / maxDensity : 0
		const invGravityMax = maxGravity > 0 ? 1 / maxGravity : 0
		for (let r = 0; r < N; r++) {
			const p = regionProvince[r]
			if (p < 0) {
				rgb[3 * r] = OCEAN_LIGHT_BLUE[0]
				rgb[3 * r + 1] = OCEAN_LIGHT_BLUE[1]
				rgb[3 * r + 2] = OCEAN_LIGHT_BLUE[2]
			} else if (desolate[p]) {
				rgb[3 * r] = 0.35
				rgb[3 * r + 1] = 0.33
				rgb[3 * r + 2] = 0.32
			} else {
				if (populationMode === "density" && pop) {
					const [cr, cg, cb] = populationColor(
						(pop[p] / Math.max(1, size[p])) * invMax,
					)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				} else if (populationMode === "gravity" && world.nations?.gravity) {
					const [cr, cg, cb] = gravityColor(
						world.nations.gravity[p] * invGravityMax,
					)
					rgb[3 * r] = cr
					rgb[3 * r + 1] = cg
					rgb[3 * r + 2] = cb
				} else {
					const cultureIdx = world.cultures?.assignment[p] ?? -1
					const heritageIdx =
						cultureIdx >= 0
							? (world.heritages?.assignment[cultureIdx] ?? -1)
							: -1
					const faithIdx =
						cultureIdx >= 0 ? (world.faiths?.assignment[cultureIdx] ?? -1) : -1
					const religionIdx =
						faithIdx >= 0 ? (world.religions?.assignment[faithIdx] ?? -1) : -1
					const idx =
						populationMode === "culture"
							? cultureIdx
							: populationMode === "heritage"
								? heritageIdx
								: populationMode === "faith"
									? faithIdx
									: religionIdx
					const partition =
						populationMode === "culture"
							? world.cultures
							: populationMode === "heritage"
								? world.heritages
								: populationMode === "faith"
									? world.faiths
									: world.religions
					if (!partition || idx < 0) {
						rgb[3 * r] = 0.35
						rgb[3 * r + 1] = 0.33
						rgb[3 * r + 2] = 0.32
					} else {
						rgb[3 * r] = partition.colors[3 * idx]
						rgb[3 * r + 1] = partition.colors[3 * idx + 1]
						rgb[3 * r + 2] = partition.colors[3 * idx + 2]
					}
				}
			}
		}
		return rgb
	}

	if (colorMode === "basins" && world.rivers?.basinId) {
		for (let r = 0; r < N; r++) {
			const [cr, cg, cb] = basinColor(world.rivers.basinId[r] ?? -1)
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		}
		return rgb
	}

	if (
		(colorMode === "terrainFeatures" ||
			colorMode === "terrainFeaturesLand" ||
			colorMode === "terrainFeaturesOcean" ||
			colorMode === "terrainFeaturesCoast") &&
		world.terrainFeatures
	) {
		const { featureMask, dominantFeature } = world.terrainFeatures
		const filterMask =
			colorMode === "terrainFeaturesLand"
				? LAND_FEATURE_MASK
				: colorMode === "terrainFeaturesOcean"
					? OCEAN_FEATURE_MASK
					: colorMode === "terrainFeaturesCoast"
						? COAST_FEATURE_MASK
						: 0xffffffff
		for (let r = 0; r < N; r++) {
			const base = getColor(world.elevation_km[r], "terrain")
			const mask = featureMask[r] & filterMask
			if (!mask) {
				rgb[3 * r] = base[0] * 0.32
				rgb[3 * r + 1] = base[1] * 0.32
				rgb[3 * r + 2] = base[2] * 0.32
				continue
			}
			let feature = dominantFeature[r]
			if (!(mask & (1 << (feature - 1)))) {
				feature = 0
				for (let bit = 1; bit <= 11; bit++) {
					if (mask & (1 << (bit - 1))) {
						feature = bit
						break
					}
				}
			}
			const accent = TERRAIN_FEATURE_COLORS[feature] ?? [1, 1, 1]
			rgb[3 * r] = base[0] * 0.2 + accent[0] * 0.8
			rgb[3 * r + 1] = base[1] * 0.2 + accent[1] * 0.8
			rgb[3 * r + 2] = base[2] * 0.2 + accent[2] * 0.8
		}
		return rgb
	}

	// Terrain / heightmap modes
	if (world.isLand) {
		const seaR = 0xac / 255,
			seaG = 0xd0 / 255,
			seaB = 0xa5 / 255
		const depR = 0xa7 / 255,
			depG = 0xdf / 255,
			depB = 0xd2 / 255
		const lakes = world.rivers?.lakes
		for (let r = 0; r < N; r++) {
			const km = world.elevation_km[r]
			if (lakes?.[r]) {
				const [cr, cg, cb] = getColor(Math.min(0, km), "terrain")
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			} else if (world.isLand[r] && km <= 0) {
				const depthKm = -km
				const t = Math.min(1, Math.sqrt(depthKm / 1))
				rgb[3 * r] = seaR + (depR - seaR) * t
				rgb[3 * r + 1] = seaG + (depG - seaG) * t
				rgb[3 * r + 2] = seaB + (depB - seaB) * t
			} else if (!world.isLand[r]) {
				const [cr, cg, cb] = getColor(Math.min(0, km), "terrain")
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			} else {
				const [cr, cg, cb] = getColor(km, colorMode)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			}
		}
		return rgb
	}

	return null
}

export function applyCloudOverlay(
	regionColors: Float32Array,
	cloudData: Float32Array,
): Float32Array {
	const N = cloudData.length
	const rgb = new Float32Array(regionColors)
	for (let r = 0; r < N; r++) {
		const c = cloudData[r]
		if (c > 0) {
			const i = 3 * r
			rgb[i] = rgb[i] + (1 - rgb[i]) * c
			rgb[i + 1] = rgb[i + 1] + (1 - rgb[i + 1]) * c
			rgb[i + 2] = rgb[i + 2] + (1 - rgb[i + 2]) * c
		}
	}
	return rgb
}
