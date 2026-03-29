import type { SerializedOrogenWorld } from "@/model/orogen/worker-types"
import type { ColorMode } from "../colors"
import { getColor, temperatureColor, temperatureDeltaColor, precipitationColor, vegetationColor, climateZoneColor, climateTempColor, oceanCurrentColor, windSpeedColor, populationColor, OCEAN_LIGHT_BLUE } from "../colors"
import { pastaClimateColor, pastaTrueColor } from "@/model/orogen/climate/pasta"
import { koppenClimateColor, koppenTrueColor } from "@/model/orogen/climate/koppen"
import { ENABLE_PASTA_CLASSIFICATION } from "@/model/orogen/features"
import { darkenVegetationAtElevation, darkenClimateAtElevation } from "./color-helpers"

export function computeRegionColors(
	world: SerializedOrogenWorld,
	colorMode: ColorMode,
	temperatureMonth: number,
	rainfallMonth: number,
	windMonth: number,
): Float32Array | null {
	const N = world.mesh.numRegions
	const rgb = new Float32Array(N * 3)

	if ((colorMode === "temperature" || colorMode === "biotemperature" || colorMode === "temperatureDelta") && world.climate) {
		const temps = temperatureMonth === 0
			? world.climate.temperature_avg
			: world.climate.temperature_monthly.subarray(
				(temperatureMonth - 1) * N,
				temperatureMonth * N,
			)
		for (let r = 0; r < N; r++) {
			const [cr, cg, cb] = colorMode === "temperatureDelta"
				? temperatureDeltaColor(world.climate.temperature_max[r] - world.climate.temperature_min[r])
				: temperatureColor(
					colorMode === "biotemperature"
						? Math.max(0, world.climate.temperature_avg[r])
						: temps[r],
				)
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		}
		return rgb
	}

	if (colorMode === "precipitation" && world.rainfall) {
		if (rainfallMonth === 0) {
			for (let r = 0; r < N; r++) {
				const [cr, cg, cb] = world.elevation[r] <= 0
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
				const [cr, cg, cb] = world.elevation[r] <= 0
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

	if (colorMode === "vegetation" && world.vegetation) {
		const lakes = world.rivers?.lakes
		for (let r = 0; r < N; r++) {
			if (lakes?.[r]) {
				const [cr, cg, cb] = getColor(Math.min(0, world.elevation_km[r]), "terrain")
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

	if (ENABLE_PASTA_CLASSIFICATION && colorMode === "pastaClimate" && world.pastaClimate) {
		for (let r = 0; r < N; r++) {
			const [cr, cg, cb] = pastaClimateColor(world.pastaClimate[r])
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		}
		return rgb
	}

	if (ENABLE_PASTA_CLASSIFICATION && colorMode === "satellite" && world.pastaClimate) {
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
		const debugKey = {
			debugGdd: "gdd", debugGddz: "gddz", debugGint: "gint",
			debugAr: "ar", debugGar: "gar", debugGrs: "grs", debugEvr: "evr",
			debugMinT: "minT", debugMaxT: "maxT",
		}[colorMode] as keyof typeof world.pastaDebug
		const data = world.pastaDebug[debugKey]
		// Find min/max for normalization (land only for most, all for minT/maxT)
		let lo = Infinity, hi = -Infinity
		for (let r = 0; r < N; r++) {
			if (!world.isLand?.[r] && !colorMode.includes("MinT") && !colorMode.includes("MaxT")) continue
			const v = data[r]
			// gint stores 99999 for infinity — skip for range
			if (v >= 99999) continue
			if (v < lo) lo = v
			if (v > hi) hi = v
		}
		if (lo === hi) { hi = lo + 1 }
		const range = hi - lo
		for (let r = 0; r < N; r++) {
			if (!world.isLand?.[r] && !colorMode.includes("MinT") && !colorMode.includes("MaxT")) {
				rgb[3 * r] = 0.05; rgb[3 * r + 1] = 0.08; rgb[3 * r + 2] = 0.18
				continue
			}
			let v = data[r]
			if (v >= 99999) v = hi
			const t = Math.max(0, Math.min(1, (v - lo) / range))
			// Viridis-like: blue → cyan → green → yellow
			rgb[3 * r] = t < 0.5 ? t * 1.4 : 0.7 + (t - 0.5) * 0.6
			rgb[3 * r + 1] = t < 0.25 ? 0.05 + t * 2 : t < 0.75 ? 0.55 + (t - 0.25) * 0.9 : 1.0
			rgb[3 * r + 2] = t < 0.5 ? 0.5 - t * 0.8 : 0.1 - (t - 0.5) * 0.2
		}
		return rgb
	}

	if (colorMode === "climate" && world.climate) {
		const CHAOTIC_MIN = 10
		const CHAOTIC_MAX = 50
		const BLEND_THRESHOLD = 15
		const chaoticRgb = climateZoneColor(8)
		for (let r = 0; r < N; r++) {
			if (world.elevation[r] <= 0) {
				rgb[3 * r] = 0.05; rgb[3 * r + 1] = 0.08; rgb[3 * r + 2] = 0.18
				continue
			}
			let [cr, cg, cb] = climateTempColor(world.climate.temperature_avg[r])
			const minT = Math.min(BLEND_THRESHOLD, Math.max(CHAOTIC_MIN - world.climate.temperature_min[r], 0))
			const maxT = Math.min(BLEND_THRESHOLD, Math.max(world.climate.temperature_max[r] - CHAOTIC_MAX, 0))
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
		if (windMonth === 0) {
			for (let r = 0; r < N; r++) {
				let sum = 0
				for (let m = 0; m < 12; m++) sum += world.wind.wind_speed_monthly[m * N + r]
				const [cr, cg, cb] = windSpeedColor(sum / 12)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			}
		} else {
			const off = (windMonth - 1) * N
			for (let r = 0; r < N; r++) {
				const [cr, cg, cb] = windSpeedColor(world.wind.wind_speed_monthly[off + r])
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			}
		}
		return rgb
	}

	if (colorMode === "oceanCurrents" && world.oceanCurrents) {
		const { oceanWarmth, coastalWarmth } = world.oceanCurrents
		for (let r = 0; r < N; r++) {
			const value = world.isLand?.[r]
				? coastalWarmth[r]
				: oceanWarmth[r]
			const [cr, cg, cb] = oceanCurrentColor(value)
			rgb[3 * r] = cr
			rgb[3 * r + 1] = cg
			rgb[3 * r + 2] = cb
		}
		return rgb
	}

	if (colorMode === "provinces" && world.provinces) {
		const { regionProvince, colors: provColors, desolate } = world.provinces
		for (let r = 0; r < N; r++) {
			const p = regionProvince[r]
			if (p < 0) {
				rgb[3 * r] = OCEAN_LIGHT_BLUE[0]; rgb[3 * r + 1] = OCEAN_LIGHT_BLUE[1]; rgb[3 * r + 2] = OCEAN_LIGHT_BLUE[2]
			} else if (desolate[p]) {
				rgb[3 * r] = 0.35; rgb[3 * r + 1] = 0.33; rgb[3 * r + 2] = 0.32
			} else {
				rgb[3 * r] = provColors[3 * p]
				rgb[3 * r + 1] = provColors[3 * p + 1]
				rgb[3 * r + 2] = provColors[3 * p + 2]
			}
		}
		return rgb
	}

	if (colorMode === "population" && world.provinces && world.population) {
		const { regionProvince, desolate } = world.provinces
		const { population: pop } = world.population
		const { size } = world.provinces
		let maxDensity = 0
		for (let i = 0; i < world.provinces.count; i++) {
			if (!desolate[i] && size[i] > 0) {
				const d = pop[i] / size[i]
				if (d > maxDensity) maxDensity = d
			}
		}
		const invMax = maxDensity > 0 ? 1 / maxDensity : 0
		for (let r = 0; r < N; r++) {
			const p = regionProvince[r]
			if (p < 0) {
				rgb[3 * r] = OCEAN_LIGHT_BLUE[0]; rgb[3 * r + 1] = OCEAN_LIGHT_BLUE[1]; rgb[3 * r + 2] = OCEAN_LIGHT_BLUE[2]
			} else if (desolate[p]) {
				rgb[3 * r] = 0.35; rgb[3 * r + 1] = 0.33; rgb[3 * r + 2] = 0.32
			} else {
				const [cr, cg, cb] = populationColor((pop[p] / Math.max(1, size[p])) * invMax)
				rgb[3 * r] = cr
				rgb[3 * r + 1] = cg
				rgb[3 * r + 2] = cb
			}
		}
		return rgb
	}

	// Terrain / heightmap modes
	if (world.isLand) {
		const seaR = 0xAC / 255, seaG = 0xD0 / 255, seaB = 0xA5 / 255
		const depR = 0xA7 / 255, depG = 0xDF / 255, depB = 0xD2 / 255
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

export function applyCloudOverlay(regionColors: Float32Array, cloudData: Float32Array): Float32Array {
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
