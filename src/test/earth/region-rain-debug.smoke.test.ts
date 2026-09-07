import { writeFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { RAIN } from "@/model/climate/precipitation/rain"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import {
	loadEarthElevationRaster,
	loadEarthGrayscale,
	loadEarthMonthlyRaster,
	loadEarthRiverLines,
} from "./assets"

const REPORT = "region-rain-report.txt"
const NEWLINE = String.fromCharCode(10)
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ")

const BOXES = [
	{
		label: "SE US (GA/SC/NC/AL)",
		latLo: 30,
		latHi: 36,
		lonLo: -88,
		lonHi: -76,
	},
	{ label: "Florida", latLo: 25, latHi: 30, lonLo: -83, lonHi: -80 },
	{ label: "SE China", latLo: 22, latHi: 32, lonLo: 110, lonHi: 122 },
]

describe("Regional monthly rain, model vs WorldClim", () => {
	it("dumps monthly totals for named boxes", () => {
		const earth = loadEarthGrayscale("earth.png")
		const coastline = loadEarthGrayscale("coastline-mask.png")
		const lake = loadEarthGrayscale("lake-mask.png")
		const riverLines = loadEarthRiverLines()
		const realClimate = loadEarthMonthlyRaster("earth-real-temperature")
		const realPrecip = loadEarthMonthlyRaster("earth-real-precipitation")
		const realElevation = loadEarthElevationRaster()

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
				// Zeroed, not DEFAULT_WORLD_PARAMS -- those are tuned for shaping
				// synthetic noise into plausible terrain. A real Earth heightmap
				// already IS realistic terrain; warping/smoothing/eroding it distorts
				// real elevation instead of preserving it. applySoilCreep still runs
				// unconditionally downstream regardless of these.
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
		const { rainfall, isLand, mesh } = world
		const observed = rainfall.real_monthly
		expect(observed).toBeDefined()
		if (!observed) return

		const N = mesh.numRegions
		const { latDeg, lonDeg } = RAIN.getClimateGeometry(mesh)
		const lines: string[] = []

		for (const box of BOXES) {
			const mod = new Array(12).fill(0)
			const obs = new Array(12).fill(0)
			let east = 0
			let west = 0
			let neither = 0
			let n = 0
			for (let r = 0; r < N; r++) {
				if (!isLand[r]) continue
				if (latDeg[r] < box.latLo || latDeg[r] >= box.latHi) continue
				if (lonDeg[r] < box.lonLo || lonDeg[r] >= box.lonHi) continue
				if (!Number.isFinite(observed[r])) continue
				n++
				if (rainfall.west[r] > 0) west++
				else if (rainfall.east[r] > 0) east++
				else neither++
				for (let m = 0; m < 12; m++) {
					mod[m] += rainfall.monthly[m * N + r]
					obs[m] += observed[m * N + r]
				}
			}
			if (n === 0) continue
			lines.push("")
			lines.push(
				`${box.label}  (${n} cells: east ${east}, west ${west}, neither ${neither})`,
			)
			lines.push("           " + MONTHS.map((m) => m.padStart(5)).join(""))
			lines.push(
				"model mm   " + mod.map((v) => (v / n).toFixed(0).padStart(5)).join(""),
			)
			lines.push(
				"obs   mm   " + obs.map((v) => (v / n).toFixed(0).padStart(5)).join(""),
			)
		}
		// Per-latitude east-fed readout: ground truth for where seasonality flips.
		const bands = new Map<
			number,
			{ n: number; jan: number; jul: number; oJan: number; oJul: number }
		>()
		for (let r = 0; r < N; r++) {
			if (!isLand[r]) continue
			if (!(rainfall.east[r] > 0)) continue
			if (!Number.isFinite(observed[r])) continue
			const band = Math.round(latDeg[r] / 5) * 5
			const acc = bands.get(band) ?? { n: 0, jan: 0, jul: 0, oJan: 0, oJul: 0 }
			acc.n++
			acc.jan += rainfall.monthly[0 * N + r]
			acc.jul += rainfall.monthly[6 * N + r]
			acc.oJan += observed[0 * N + r]
			acc.oJul += observed[6 * N + r]
			bands.set(band, acc)
		}
		lines.push("")
		lines.push("EAST-FED land by latitude — Jan/Jul mm")
		lines.push(
			"lat  cells   modJan modJul  modJul/Jan   obsJan obsJul  obsJul/Jan",
		)
		for (let band = 0; band <= 60; band += 5) {
			const acc = bands.get(band)
			if (!acc || acc.n < 20) continue
			const mj = acc.jan / acc.n
			const ml = acc.jul / acc.n
			const oj = acc.oJan / acc.n
			const ol = acc.oJul / acc.n
			lines.push(
				`${String(band).padStart(3)} ${String(acc.n).padStart(6)}   ${mj.toFixed(0).padStart(6)} ${ml.toFixed(0).padStart(6)}  ${(ml / Math.max(1, mj)).toFixed(2).padStart(10)}   ${oj.toFixed(0).padStart(6)} ${ol.toFixed(0).padStart(6)}  ${(ol / Math.max(1, oj)).toFixed(2).padStart(10)}`,
			)
		}

		// The actual `dist` (in hadley units) east-fed cells see, from the real
		// per-longitude TEQ — no assumed global value. Read against the curve
		// knots: itczScale dies by 1.00, eastStormScale starts at 0.833.
		const teqJan = RAIN.computeThermalEquator({
			mesh,
			temps: world.climate.temperature_monthly.subarray(0, N),
		})
		const teqJul = RAIN.computeThermalEquator({
			mesh,
			temps: world.climate.temperature_monthly.subarray(6 * N, 7 * N),
		})
		const { regionBin } = RAIN.getClimateGeometry(mesh)
		const hadley = RAIN.hadleyWidth(DEFAULT_WORLD_PARAMS.hoursPerDay)
		const distBands = new Map<
			number,
			{ n: number; dj: number; dl: number; tj: number; tl: number; e: number }
		>()
		for (let r = 0; r < N; r++) {
			if (!isLand[r]) continue
			if (!(rainfall.east[r] > 0)) continue
			const band = Math.round(latDeg[r] / 5) * 5
			const acc = distBands.get(band) ?? {
				n: 0,
				dj: 0,
				dl: 0,
				tj: 0,
				tl: 0,
				e: 0,
			}
			acc.n++
			acc.tj += teqJan[regionBin[r]]
			acc.tl += teqJul[regionBin[r]]
			acc.dj += Math.abs(latDeg[r] - teqJan[regionBin[r]]) / hadley
			acc.dl += Math.abs(latDeg[r] - teqJul[regionBin[r]]) / hadley
			acc.e += rainfall.east[r]
			distBands.set(band, acc)
		}
		lines.push("")
		lines.push("EAST-FED: actual TEQ and dist seen per latitude band")
		lines.push("lat   teqJan teqJul   distJan distJul   eastMoist")
		for (let band = 0; band <= 60; band += 5) {
			const a = distBands.get(band)
			if (!a || a.n < 20) continue
			lines.push(
				`${String(band).padStart(3)}   ${(a.tj / a.n).toFixed(1).padStart(6)} ${(a.tl / a.n).toFixed(1).padStart(6)}   ${(a.dj / a.n).toFixed(2).padStart(7)} ${(a.dl / a.n).toFixed(2).padStart(7)}   ${(a.e / a.n).toFixed(2).padStart(9)}`,
			)
		}

		writeFileSync(REPORT, lines.join(NEWLINE))
		expect(lines.length).toBeGreaterThan(0)
	}, 600_000)
})
