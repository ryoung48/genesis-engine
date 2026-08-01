import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { APPARENT_TEMP } from "@/model/climate/apparent-temp"
import { HUMIDITY } from "@/model/climate/humidity"
import { WIND } from "@/model/climate/wind"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { NODE_PNG } from "@/model/shared/node-png"
import { DEFAULT_WORLD_PARAMS } from "@/ui/planet/screen/generation/defaults"

// Reproduces the "MI" / "Observed MI" (Misery Index / apparent temperature)
// color-mode pair from src/ui/planet/hover/hover.ts#getHoverMisery, but for
// every land cell at once, so the model-vs-observed gap can be broken down
// by its three inputs (temperature, relative humidity, wind speed) instead
// of just eyeballing the map.

const HEIGHTMAP_DIR = join(process.cwd(), "public", "earth-data")

function loadGrayscale(filename: string) {
	const buffer = readFileSync(join(HEIGHTMAP_DIR, filename))
	return NODE_PNG.decodePng(buffer)
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

const LAT_BANDS = [
	{ label: "60N-90N", lo: 60, hi: 90 },
	{ label: "30N-60N", lo: 30, hi: 60 },
	{ label: "0-30N (tropics)", lo: 0, hi: 30 },
	{ label: "0-30S (tropics)", lo: -30, hi: 0 },
	{ label: "30S-60S", lo: -60, hi: -30 },
	{ label: "60S-90S", lo: -90, hi: -60 },
]

describe("model MI vs observed Earth MI (misery index / apparent temperature)", () => {
	it("imports the real Earth heightmap and compares modeled vs observed apparent temperature", () => {
		const earth = loadGrayscale("earth.png")
		const coastline = loadGrayscale("coastline-mask.png")
		const lake = loadGrayscale("lake-mask.png")
		const realClimate = loadRealClimate("earth-real-temperature")
		const realPrecip = loadRealClimate("earth-real-precipitation")
		const realDtr = loadRealClimate("earth-real-dtr")
		const realWindU = loadRealClimate("earth-real-wind-u")
		const realWindV = loadRealClimate("earth-real-wind-v")

		const world = IMPORT_HEIGHTMAP.importGenesisWorld({
			params: {
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
				realDtrMonthly: realDtr.monthly,
				realDtrWidth: realDtr.width,
				realDtrHeight: realDtr.height,
				realDtrMonths: realDtr.months,
				realDtrScale: realDtr.scale,
				realDtrNoData: realDtr.nodata,
				realWindUMonthly: realWindU.monthly,
				realWindVMonthly: realWindV.monthly,
				realWindWidth: realWindU.width,
				realWindHeight: realWindU.height,
				realWindMonths: realWindU.months,
				realWindScale: realWindU.scale,
				realWindNoData: realWindU.nodata,
				// Zeroed, not DEFAULT_WORLD_PARAMS -- those are tuned for shaping
				// synthetic noise into plausible terrain. A real Earth heightmap
				// already IS realistic terrain; warping/smoothing/eroding it distorts
				// real elevation instead of preserving it.
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
			},
		})

		const { climate, isLand, mesh, hydrology, rainfall } = world
		expect(climate.real_temperature_avg).toBeDefined()
		expect(world.observedHumidity?.real_annual).toBeDefined()
		expect(world.observedWind?.real_speed_monthly).toBeDefined()

		const N = mesh.numRegions
		const realTempAvg = climate.real_temperature_avg!
		const realHumidityAvg = world.observedHumidity!.real_annual!
		const observedWindSpeedMonthly = world.observedWind!.real_speed_monthly!

		const { windSpeed: modeledWindSpeed } = WIND.computeWindVectors({
			mesh,
			climate,
			elevation_km: world.elevation_km,
			params: world.params,
			surface: {
				vegetation: world.vegetation,
				topography: world.topography,
				slopeScore: world.slopeScore,
				oceanDist: world.oceanDist,
			},
		})

		const r_xyz = mesh.r_xyz
		function latDegAt(r: number): number {
			const z = r_xyz[r * 3 + 2]
			return (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI
		}

		function observedAnnualWindSpeed(r: number): number {
			let sum = 0
			for (let m = 0; m < 12; m++) sum += observedWindSpeedMonthly[m * N + r]
			return sum / 12
		}

		const bandStats = LAT_BANDS.map((b) => ({
			...b,
			n: 0,
			sumTempDiff: 0,
			sumRhDiff: 0,
			sumWindDiff: 0,
			sumMiDiff: 0,
			sumModeledMi: 0,
			sumObservedMi: 0,
			sumModeledRh: 0,
			sumObservedRh: 0,
		}))

		const RAIN_BINS = [
			{ label: "<300mm (desert)", lo: 0, hi: 300 },
			{ label: "300-1000mm (savanna)", lo: 300, hi: 1000 },
			{ label: "1000-2000mm (humid)", lo: 1000, hi: 2000 },
			{ label: "2000mm+ (rainforest)", lo: 2000, hi: Infinity },
		]
		const tropicRainBinStats = RAIN_BINS.map((b) => ({
			...b,
			n: 0,
			sumModeledRh: 0,
			sumObservedRh: 0,
		}))

		let n = 0
		let sumTempDiff = 0
		let sumRhDiff = 0
		let sumWindDiff = 0
		let sumMiDiff = 0
		let sumAbsMiDiff = 0
		let sumMiDiffSq = 0

		for (let r = 0; r < N; r++) {
			if (!isLand[r]) continue
			const observedT = realTempAvg[r]
			const observedRh = realHumidityAvg[r]
			if (!Number.isFinite(observedT) || !Number.isFinite(observedRh)) continue

			let annualAridity: number | undefined
			const aet = hydrology?.aet_monthly
			const pet = climate.pet_monthly
			if (aet && pet) {
				let aetSum = 0
				let petSum = 0
				for (let m = 0; m < 12; m++) {
					aetSum += aet[m * N + r]
					petSum += pet[m * N + r]
				}
				annualAridity = petSum > 0 ? aetSum / petSum : 1
			}

			const modeledT = climate.temperature_avg[r]
			const modeledRh = HUMIDITY.relativeHumidityFromTempRange({
				meanTempC: modeledT,
				dtrC: world.dtr_annual[r],
				annualAridity,
				annualRainfallMm: rainfall?.annual[r],
			})
			const modeledWind = modeledWindSpeed[r]
			const observedWind = observedAnnualWindSpeed(r)

			const modeledMi = APPARENT_TEMP.apparentTemperatureC({
				tempC: modeledT,
				rhPercent: modeledRh,
				windSpeedMs: modeledWind,
			})
			const observedMi = APPARENT_TEMP.apparentTemperatureC({
				tempC: observedT,
				rhPercent: observedRh,
				windSpeedMs: observedWind,
			})

			const tempDiff = modeledT - observedT
			const rhDiff = modeledRh - observedRh
			const windDiff = modeledWind - observedWind
			const miDiff = modeledMi - observedMi

			n++
			sumTempDiff += tempDiff
			sumRhDiff += rhDiff
			sumWindDiff += windDiff
			sumMiDiff += miDiff
			sumAbsMiDiff += Math.abs(miDiff)
			sumMiDiffSq += miDiff * miDiff

			const lat = latDegAt(r)
			const band = bandStats.find((b) => lat >= b.lo && lat < b.hi)
			if (band) {
				band.n++
				band.sumTempDiff += tempDiff
				band.sumRhDiff += rhDiff
				band.sumWindDiff += windDiff
				band.sumMiDiff += miDiff
				band.sumModeledMi += modeledMi
				band.sumObservedMi += observedMi
				band.sumModeledRh += modeledRh
				band.sumObservedRh += observedRh
			}

			if (Math.abs(lat) < 30) {
				const annualRainfallMm = rainfall?.annual[r] ?? 0
				const rainBin = tropicRainBinStats.find(
					(b) => annualRainfallMm >= b.lo && annualRainfallMm < b.hi,
				)
				if (rainBin) {
					rainBin.n++
					rainBin.sumModeledRh += modeledRh
					rainBin.sumObservedRh += observedRh
				}
			}
		}

		const meanTempBias = sumTempDiff / Math.max(1, n)
		const meanRhBias = sumRhDiff / Math.max(1, n)
		const meanWindBias = sumWindDiff / Math.max(1, n)
		const meanMiBias = sumMiDiff / Math.max(1, n)
		const meanAbsMiError = sumAbsMiDiff / Math.max(1, n)
		const rmseMi = Math.sqrt(sumMiDiffSq / Math.max(1, n))

		console.info("Land cells compared", n, "of", N)
		console.info(
			"Overall model vs observed inputs (bias = model minus observed)",
		)
		console.table({
			meanTempBiasC: Number(meanTempBias.toFixed(2)),
			meanRhBiasPct: Number(meanRhBias.toFixed(1)),
			meanWindBiasMs: Number(meanWindBias.toFixed(2)),
			meanMiBiasC: Number(meanMiBias.toFixed(2)),
			meanAbsMiErrorC: Number(meanAbsMiError.toFixed(2)),
			rmseMiC: Number(rmseMi.toFixed(2)),
		})

		console.info(
			"By latitude band -- bias (model minus observed) for each MI input, plus mean MI itself",
		)
		console.table(
			bandStats.map((b) => ({
				band: b.label,
				landCells: b.n,
				tempBiasC: b.n > 0 ? Number((b.sumTempDiff / b.n).toFixed(2)) : NaN,
				rhBiasPct: b.n > 0 ? Number((b.sumRhDiff / b.n).toFixed(1)) : NaN,
				windBiasMs: b.n > 0 ? Number((b.sumWindDiff / b.n).toFixed(2)) : NaN,
				miBiasC: b.n > 0 ? Number((b.sumMiDiff / b.n).toFixed(2)) : NaN,
				modeledMiC:
					b.n > 0 ? Number((b.sumModeledMi / b.n).toFixed(1)) : NaN,
				observedMiC:
					b.n > 0 ? Number((b.sumObservedMi / b.n).toFixed(1)) : NaN,
				modeledRhPct:
					b.n > 0 ? Number((b.sumModeledRh / b.n).toFixed(1)) : NaN,
				observedRhPct:
					b.n > 0 ? Number((b.sumObservedRh / b.n).toFixed(1)) : NaN,
			})),
		)

		console.info(
			"Within |lat| < 30 only, by annual rainfall bin -- checks whether desert cells are dragging the tropics-wide RH average down",
		)
		console.table(
			tropicRainBinStats.map((b) => ({
				rainfall: b.label,
				cells: b.n,
				modeledRhPct:
					b.n > 0 ? Number((b.sumModeledRh / b.n).toFixed(1)) : NaN,
				observedRhPct:
					b.n > 0 ? Number((b.sumObservedRh / b.n).toFixed(1)) : NaN,
			})),
		)

		expect(n).toBeGreaterThan(0)
		expect(Number.isFinite(meanMiBias)).toBe(true)
	}, 600_000)
})
