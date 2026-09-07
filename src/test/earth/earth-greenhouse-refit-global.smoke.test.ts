import { writeFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { CLIMATE } from "@/model/climate/classification/climate"
import { RAIN } from "@/model/climate/precipitation/rain"
import { CONSTANTS } from "@/model/climate/temperature/ebm/constants"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import {
	loadEarthElevationRaster,
	loadEarthGrayscale,
	loadEarthMonthlyRaster,
	loadEarthRiverLines,
} from "./assets"

// Re-fits GREENHOUSE_FACTOR against the REAL imported Earth world (real
// heightmap, real coastline, real per-latitude land distribution, real
// elevation) instead of the idealized ALBEDO.landFraction() proxy
// earth-default-refit.smoke.test.ts uses. That proxy's land/latitude shape
// doesn't match the actual planet, so a constant fit against it can carry a
// calibration gap invisible until you evaluate against the real import (see
// earth-real-temperature-compare.smoke.test.ts's post-erosion-removal bias
// jump). Bisects against the actual land-only WorldClim mean, not the
// textbook ~14.8C whole-Earth (land+ocean) figure -- land-only is colder.

const REPORT = "greenhouse-refit-global.txt"
const NEWLINE = String.fromCharCode(10)

type BiasBreakdown = {
	land: number
	ocean: number
	global: number
	tropicalOcean: number
}

function biasBreakdown(params: {
	modeled: Float32Array
	observed: Float32Array
	isLand: Uint8Array
	latDeg: Float32Array
}): BiasBreakdown {
	const { modeled, observed, isLand, latDeg } = params
	let landSum = 0
	let landN = 0
	let oceanSum = 0
	let oceanN = 0
	let tropSum = 0
	let tropN = 0
	for (let r = 0; r < modeled.length; r++) {
		const obs = observed[r]
		if (!Number.isFinite(obs)) continue
		const diff = modeled[r] - obs
		if (isLand[r]) {
			landSum += diff
			landN++
			continue
		}
		oceanSum += diff
		oceanN++
		if (Math.abs(latDeg[r]) < 23.5) {
			tropSum += diff
			tropN++
		}
	}
	return {
		land: landSum / Math.max(1, landN),
		ocean: oceanSum / Math.max(1, oceanN),
		global: (landSum + oceanSum) / Math.max(1, landN + oceanN),
		tropicalOcean: tropSum / Math.max(1, tropN),
	}
}

describe("GREENHOUSE_FACTOR refit against land+ocean instead of land-only", () => {
	it("bisects on the whole-planet bias and reports what it does to each surface", () => {
		const earth = loadEarthGrayscale("earth.png")
		const coastline = loadEarthGrayscale("coastline-mask.png")
		const lake = loadEarthGrayscale("lake-mask.png")
		const riverLines = loadEarthRiverLines()
		const realClimate = loadEarthMonthlyRaster("earth-real-temperature")
		const realPrecip = loadEarthMonthlyRaster("earth-real-precipitation")
		const realElevation = loadEarthElevationRaster()

		const importParams = {
			seed: 14963991,
			numPoints: DEFAULT_WORLD_PARAMS.numPoints,
			jitter: DEFAULT_WORLD_PARAMS.jitter,
			grayscale: earth.grayscale,
			imageWidth: earth.width,
			imageHeight: earth.height,
			coastlineMask: coastline.grayscale,
			maskWidth: coastline.width,
			maskHeight: coastline.height,
			lakeMask: lake.grayscale,
			lakeMaskWidth: lake.width,
			lakeMaskHeight: lake.height,
			riverLines,
			realClimateMonthly: realClimate.monthly,
			realClimateWidth: realClimate.width,
			realClimateHeight: realClimate.height,
			realClimateMonths: realClimate.months,
			realClimateScale: realClimate.scale,
			realClimateNoData: realClimate.nodata,
			realPrecipMonthly: realPrecip.monthly,
			realPrecipWidth: realPrecip.width,
			realPrecipHeight: realPrecip.height,
			realPrecipMonths: realPrecip.months,
			realPrecipScale: realPrecip.scale,
			realPrecipNoData: realPrecip.nodata,
			realElevationRaster: realElevation.raster,
			realElevationWidth: realElevation.width,
			realElevationHeight: realElevation.height,
			realElevationScale: realElevation.scale,
			realElevationNoData: realElevation.nodata,
			terrainWarp: 0,
			smoothing: 0,
			hydraulicErosion: 0,
			thermalErosion: 0,
			ridgeSharpening: 0,
			glacialErosion: 0,
			seaLevel: DEFAULT_WORLD_PARAMS.seaLevel,
			volcanism: 1,
			craters: 0,
			maxElevation: DEFAULT_WORLD_PARAMS.maxElevation,
			planetRadiusKm: DEFAULT_WORLD_PARAMS.planetRadiusKm,
			obliquity: DEFAULT_WORLD_PARAMS.obliquity,
			eccentricity: DEFAULT_WORLD_PARAMS.eccentricity,
			spectralClass: DEFAULT_WORLD_PARAMS.spectralClass,
			starSubtype: DEFAULT_WORLD_PARAMS.starSubtype,
			orbitalDistanceAU: DEFAULT_WORLD_PARAMS.orbitalDistanceAU,
			daysPerYear: DEFAULT_WORLD_PARAMS.daysPerYear,
			hoursPerDay: DEFAULT_WORLD_PARAMS.hoursPerDay,
			substellarLon: DEFAULT_WORLD_PARAMS.substellarLon,
			perihelion: DEFAULT_WORLD_PARAMS.perihelion,
			pressure: DEFAULT_WORLD_PARAMS.pressure,
		}
		const world = IMPORT_HEIGHTMAP.importGenesisWorld({ params: importParams })
		const realLandFraction = CLIMATE.computeLandFraction({
			mesh: world.mesh,
			isLand: world.isLand,
		})
		const observed = world.climate.real_temperature_avg
		if (!observed) throw new Error("no observed temperature attached")
		const { latDeg } = RAIN.getClimateGeometry(world.mesh)

		const originalGreenhouseFactor =
			CONSTANTS.embConstants.surface.GREENHOUSE_FACTOR
		const lines: string[] = []
		const evaluate = (g: number): BiasBreakdown => {
			CONSTANTS.embConstants.surface.GREENHOUSE_FACTOR = g
			const climate = CLIMATE.computeTemperature({
				mesh: world.mesh,
				elevation: world.elevation,
				landFraction: realLandFraction,
				params: world.params,
				oceanDist: world.oceanDist,
				isLand: world.isLand,
				elevation_km: world.elevation_km,
			})
			return biasBreakdown({
				modeled: climate.temperature_avg,
				observed,
				isLand: world.isLand,
				latDeg,
			})
		}
		const show = (label: string, g: number, b: BiasBreakdown) =>
			lines.push(
				`${label.padEnd(26)} g=${g.toFixed(4)}   land ${b.land.toFixed(2).padStart(6)}   ocean ${b.ocean.toFixed(2).padStart(6)}   global ${b.global.toFixed(2).padStart(6)}   tropOcean ${b.tropicalOcean.toFixed(2).padStart(6)}`,
			)

		try {
			show(
				"current (land-only fit)",
				originalGreenhouseFactor,
				evaluate(originalGreenhouseFactor),
			)

			let lo = 0.3
			let hi = 1.2
			let bestG = originalGreenhouseFactor
			let best = evaluate(bestG)
			for (let iter = 0; iter < 24; iter++) {
				const mid = (lo + hi) / 2
				const bias = evaluate(mid)
				bestG = mid
				best = bias
				if (bias.global > 0) hi = mid
				else lo = mid
			}
			show("refit on land+ocean", bestG, best)

			// Where the land-only fit would land if ocean were the only target.
			let oLo = 0.3
			let oHi = 1.2
			let oG = originalGreenhouseFactor
			let oBest = best
			for (let iter = 0; iter < 24; iter++) {
				const mid = (oLo + oHi) / 2
				const bias = evaluate(mid)
				oG = mid
				oBest = bias
				if (bias.ocean > 0) oHi = mid
				else oLo = mid
			}
			show("refit on ocean only", oG, oBest)
		} finally {
			CONSTANTS.embConstants.surface.GREENHOUSE_FACTOR =
				originalGreenhouseFactor
		}

		writeFileSync(REPORT, lines.join(NEWLINE))
		expect(lines.length).toBe(3)
	}, 600_000)
})
