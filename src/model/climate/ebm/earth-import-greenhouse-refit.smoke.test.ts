import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "vitest"
import {
	computeLandFraction,
	computeTemperature,
} from "@/model/climate/climate"
import { decodePng } from "@/model/pipelines/node-png"
import { DEFAULT_WORLD_PARAMS } from "@/ui/planet/screen/generation/defaults"
import { importGenesisWorld } from "../../pipelines/import-heightmap"
import { EMB_CONSTANTS } from "./constants"

// Re-fits GREENHOUSE_FACTOR against the REAL imported Earth world (real
// heightmap, real coastline, real per-latitude land distribution, real
// elevation) instead of the idealized ALBEDO.landFraction() proxy
// earth-default-refit.smoke.test.ts uses. That proxy's land/latitude shape
// doesn't match the actual planet, so a constant fit against it can carry a
// calibration gap invisible until you evaluate against the real import (see
// earth-real-temperature-compare.smoke.test.ts's post-erosion-removal bias
// jump). Bisects against the actual land-only WorldClim mean, not the
// textbook ~14.8C whole-Earth (land+ocean) figure -- land-only is colder.

const HEIGHTMAP_DIR = join(process.cwd(), "public", "heightmap")

function loadGrayscale(filename: string) {
	const buffer = readFileSync(join(HEIGHTMAP_DIR, filename))
	return decodePng(buffer)
}

function loadRealClimate(prefix: string) {
	const meta = JSON.parse(
		readFileSync(join(HEIGHTMAP_DIR, `${prefix}.json`), "utf8"),
	) as {
		bin: string
		width: number
		height: number
		months: number
		scale: number
		nodata: number
	}
	const bin = readFileSync(join(HEIGHTMAP_DIR, meta.bin))
	const monthly = new Int16Array(
		bin.buffer,
		bin.byteOffset,
		bin.byteLength / Int16Array.BYTES_PER_ELEMENT,
	)
	return {
		monthly,
		width: meta.width,
		height: meta.height,
		months: meta.months,
		scale: meta.scale,
		nodata: meta.nodata,
	}
}

function loadRiverLines() {
	const json = JSON.parse(
		readFileSync(join(HEIGHTMAP_DIR, "river-lines.json"), "utf8"),
	) as { lines: { points: number[]; strokeweig: number }[] }
	return json.lines
}

function loadRealElevation() {
	const meta = JSON.parse(
		readFileSync(join(HEIGHTMAP_DIR, "earth-real-elevation.json"), "utf8"),
	) as {
		bin: string
		width: number
		height: number
		scale: number
		nodata: number
	}
	const bin = readFileSync(join(HEIGHTMAP_DIR, meta.bin))
	const raster = new Int16Array(
		bin.buffer,
		bin.byteOffset,
		bin.byteLength / Int16Array.BYTES_PER_ELEMENT,
	)
	return {
		raster,
		width: meta.width,
		height: meta.height,
		scale: meta.scale,
		nodata: meta.nodata,
	}
}

function landOnlyMeanBiasC(world: ReturnType<typeof importGenesisWorld>): {
	meanBiasC: number
	n: number
} {
	const { climate, isLand, mesh } = world
	const realAvg = climate.real_temperature_avg!
	const diffAvg = climate.temperature_diff_avg!
	let n = 0
	let sumDiff = 0
	for (let r = 0; r < mesh.numRegions; r++) {
		if (!isLand[r]) continue
		if (!Number.isFinite(realAvg[r])) continue
		n++
		sumDiff += diffAvg[r]
	}
	return { meanBiasC: sumDiff / Math.max(1, n), n }
}

describe("Earth GREENHOUSE_FACTOR refit against the real imported world", () => {
	it("bisects GREENHOUSE_FACTOR against the real imported Earth's own land-only bias", () => {
		const earth = loadGrayscale("earth.png")
		const coastline = loadGrayscale("coastline-mask.png")
		const lake = loadGrayscale("lake-mask.png")
		const riverLines = loadRiverLines()
		const realClimate = loadRealClimate("earth-real-temperature")
		const realPrecip = loadRealClimate("earth-real-precipitation")
		const realElevation = loadRealElevation()

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

		// One full import to get the real mesh/isLand/elevation_km/landFraction
		// and the WorldClim comparison data attached -- reused unmodified across
		// every bisection iteration below (none of that depends on
		// GREENHOUSE_FACTOR). This is the world whose OWN bias we're zeroing,
		// not a synthetic proxy.
		const world = importGenesisWorld(importParams)
		const { meanBiasC: biasBefore } = landOnlyMeanBiasC(world)
		const realLandFraction = computeLandFraction(world.mesh, world.isLand)

		const originalGreenhouseFactor = EMB_CONSTANTS.surface.GREENHOUSE_FACTOR
		try {
			let lo = 0.3
			let hi = 1.2
			let bestG = EMB_CONSTANTS.surface.GREENHOUSE_FACTOR
			let bestBias = biasBefore

			for (let iter = 0; iter < 30; iter++) {
				const mid = (lo + hi) / 2
				EMB_CONSTANTS.surface.GREENHOUSE_FACTOR = mid
				const climate = computeTemperature(
					world.mesh,
					world.elevation,
					realLandFraction,
					world.params,
					world.oceanDist,
					world.isLand,
					world.elevation_km,
				)
				// Re-diff against the same real observed data already attached to
				// `world` (real_temperature_avg doesn't depend on GREENHOUSE_FACTOR).
				let n = 0
				let sumDiff = 0
				for (let r = 0; r < world.mesh.numRegions; r++) {
					if (!world.isLand[r]) continue
					const observed = world.climate.real_temperature_avg?.[r]
					if (observed === undefined || !Number.isFinite(observed)) continue
					n++
					sumDiff += climate.temperature_avg[r] - observed
				}
				const bias = sumDiff / Math.max(1, n)
				bestG = mid
				bestBias = bias
				if (bias > 0) {
					hi = mid // too warm -> need a smaller greenhouse factor
				} else {
					lo = mid
				}
			}

			console.log(
				`Land-only bias before refit (current GREENHOUSE_FACTOR=${originalGreenhouseFactor}): ${biasBefore.toFixed(2)}C`,
			)
			console.log(
				`Fitted GREENHOUSE_FACTOR = ${bestG}, land-only bias = ${bestBias.toFixed(3)}C`,
			)
		} finally {
			EMB_CONSTANTS.surface.GREENHOUSE_FACTOR = originalGreenhouseFactor
		}
	}, 600_000)
})
