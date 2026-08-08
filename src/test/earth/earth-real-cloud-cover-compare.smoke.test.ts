import { describe, expect, it } from "vitest"
import { CLOUD_COVER } from "@/model/climate/precipitation/cloud-cover"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import {
	loadEarthElevationRaster,
	loadEarthGrayscale,
	loadEarthMonthlyRaster,
	loadEarthRiverLines,
} from "./assets"

type CloudErrorStats = {
	n: number
	sumError: number
	sumAbsoluteError: number
	sumSquaredError: number
}

const CLOUD_FEATURE_COUNT = 6

function clampUnit(value: number): number {
	return Math.max(0, Math.min(1, value))
}

function cloudFeatures(params: {
	aetMm: number
	petMm: number
	rainfallMm: number
	dtrC: number
	temperatureC: number
	oceanDistanceKm: number
}): number[] {
	const { aetMm, petMm, rainfallMm, dtrC, temperatureC, oceanDistanceKm } =
		params
	return [
		1,
		clampUnit(petMm > 0 ? aetMm / petMm : 1),
		1 - Math.exp(-Math.max(0, rainfallMm) / 100),
		1 - clampUnit(dtrC / 18),
		Math.exp(-Math.max(0, oceanDistanceKm) / 800),
		clampUnit((temperatureC + 10) / 35),
	]
}

function solveLinearSystem(params: {
	matrix: number[][]
	vector: number[]
}): number[] {
	const { matrix, vector } = params
	const augmented = matrix.map((row, index) => [...row, vector[index]])
	for (let pivot = 0; pivot < augmented.length; pivot++) {
		let largestRow = pivot
		for (let row = pivot + 1; row < augmented.length; row++) {
			if (
				Math.abs(augmented[row][pivot]) > Math.abs(augmented[largestRow][pivot])
			)
				largestRow = row
		}
		;[augmented[pivot], augmented[largestRow]] = [
			augmented[largestRow],
			augmented[pivot],
		]
		const divisor = augmented[pivot][pivot]
		for (let column = pivot; column <= augmented.length; column++)
			augmented[pivot][column] /= divisor
		for (let row = 0; row < augmented.length; row++) {
			if (row === pivot) continue
			const factor = augmented[row][pivot]
			for (let column = pivot; column <= augmented.length; column++)
				augmented[row][column] -= factor * augmented[pivot][column]
		}
	}
	return augmented.map((row) => row[row.length - 1])
}

function createCloudErrorStats(): CloudErrorStats {
	return { n: 0, sumError: 0, sumAbsoluteError: 0, sumSquaredError: 0 }
}

function addCloudError(params: {
	stats: CloudErrorStats
	modeled: number
	observed: number
}): void {
	const { stats, modeled, observed } = params
	const error = modeled - observed
	stats.n++
	stats.sumError += error
	stats.sumAbsoluteError += Math.abs(error)
	stats.sumSquaredError += error * error
}

function summarizeCloudError(stats: CloudErrorStats) {
	const divisor = Math.max(1, stats.n)
	return {
		cells: stats.n,
		meanBiasPct: Number(((stats.sumError / divisor) * 100).toFixed(1)),
		meanAbsoluteErrorPct: Number(
			((stats.sumAbsoluteError / divisor) * 100).toFixed(1),
		),
		rmsePct: Number(
			(Math.sqrt(stats.sumSquaredError / divisor) * 100).toFixed(1),
		),
	}
}

describe("AET/PET cloud proxy vs ERA5 cloud cover", () => {
	it("compares real-input and modeled-input AET/PET proxies against ERA5 over land", () => {
		const earth = loadEarthGrayscale("earth.png")
		const coastline = loadEarthGrayscale("coastline-mask.png")
		const lake = loadEarthGrayscale("lake-mask.png")
		const riverLines = loadEarthRiverLines()
		const realClimate = loadEarthMonthlyRaster("earth-real-temperature")
		const realPrecip = loadEarthMonthlyRaster("earth-real-precipitation")
		const realCloudCover = loadEarthMonthlyRaster("earth-real-cloud-cover")
		const realDtr = loadEarthMonthlyRaster("earth-real-dtr")
		const realElevation = loadEarthElevationRaster()

		const world = IMPORT_HEIGHTMAP.importGenesisWorld({
			params: {
				...DEFAULT_WORLD_PARAMS,
				seed: 14963991,
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
				realCloudCoverMonthly: realCloudCover.monthly,
				realCloudCoverWidth: realCloudCover.width,
				realCloudCoverHeight: realCloudCover.height,
				realCloudCoverMonths: realCloudCover.months,
				realCloudCoverScale: realCloudCover.scale,
				realCloudCoverNoData: realCloudCover.nodata,
				realDtrMonthly: realDtr.monthly,
				realDtrWidth: realDtr.width,
				realDtrHeight: realDtr.height,
				realDtrMonths: realDtr.months,
				realDtrScale: realDtr.scale,
				realDtrNoData: realDtr.nodata,
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
			},
		})

		expect(world.observedCloudCover?.real_monthly).toBeDefined()
		expect(world.observedHydrology).toBeDefined()

		const observedAet = world.observedHydrology!.aet_monthly
		const observedPet = world.observedHydrology!.pet_monthly
		const observedCloud = world.observedCloudCover!.real_monthly
		const { aet_monthly: modeledAet } = world.hydrology
		const { pet_monthly: modeledPet } = world.climate
		const realRainfall = world.rainfall.real_monthly!
		const observedDtr = world.observedDtr!.real_monthly!
		const realTemperature = world.climate.real_temperature_monthly!
		const N = world.mesh.numRegions
		const realInputStats = createCloudErrorStats()
		const modeledInputStats = createCloudErrorStats()
		const normalMatrix = Array.from({ length: CLOUD_FEATURE_COUNT }, () =>
			new Array<number>(CLOUD_FEATURE_COUNT).fill(0),
		)
		const normalVector = new Array<number>(CLOUD_FEATURE_COUNT).fill(0)

		for (let month = 0; month < 12; month++) {
			for (let region = 0; region < N; region++) {
				if (!world.isLand[region]) continue
				const idx = month * N + region
				const observed = observedCloud[idx]
				if (!Number.isFinite(observed)) continue
				addCloudError({
					stats: realInputStats,
					modeled: CLOUD_COVER.fromAetPet({
						aetMm: observedAet[idx],
						petMm: observedPet[idx],
					}),
					observed,
				})
				addCloudError({
					stats: modeledInputStats,
					modeled: CLOUD_COVER.fromAetPet({
						aetMm: modeledAet[idx],
						petMm: modeledPet[idx],
					}),
					observed,
				})
				if (region % 5 !== 0) {
					const features = cloudFeatures({
						aetMm: observedAet[idx],
						petMm: observedPet[idx],
						rainfallMm: realRainfall[idx],
						dtrC: observedDtr[idx],
						temperatureC: realTemperature[idx],
						oceanDistanceKm: world.oceanDist[region],
					})
					for (let row = 0; row < CLOUD_FEATURE_COUNT; row++) {
						normalVector[row] += features[row] * observed
						for (let column = 0; column < CLOUD_FEATURE_COUNT; column++)
							normalMatrix[row][column] += features[row] * features[column]
					}
				}
			}
		}
		const coefficients = solveLinearSystem({
			matrix: normalMatrix,
			vector: normalVector,
		})
		const calibratedStats = createCloudErrorStats()
		for (let month = 0; month < 12; month++) {
			for (let region = 0; region < N; region++) {
				if (!world.isLand[region] || region % 5 !== 0) continue
				const idx = month * N + region
				const observed = observedCloud[idx]
				if (!Number.isFinite(observed)) continue
				addCloudError({
					stats: calibratedStats,
					modeled: CLOUD_COVER.estimate({
						aetMm: observedAet[idx],
						petMm: observedPet[idx],
						rainfallMm: realRainfall[idx],
						dtrC: observedDtr[idx],
						temperatureC: realTemperature[idx],
						oceanDistanceKm: world.oceanDist[region],
					}),
					observed,
				})
			}
		}

		console.info("AET/PET cloud proxy vs ERA5 (land cells × months)")
		console.table({
			"real climate/rain inputs": summarizeCloudError(realInputStats),
			"modeled climate/rain inputs": summarizeCloudError(modeledInputStats),
			"calibrated real-input proxy (held out)":
				summarizeCloudError(calibratedStats),
		})
		console.info(
			"Calibrated coefficients [intercept, AET/PET, rain, inverse DTR, coastal, temperature]",
			coefficients.map((value) => Number(value.toFixed(4))),
		)

		expect(realInputStats.n).toBeGreaterThan(0)
		expect(Number.isFinite(realInputStats.sumAbsoluteError)).toBe(true)
	}, 600_000)
})
