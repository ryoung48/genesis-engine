import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { DEFAULT_WORLD_PARAMS } from "@/ui/planet/screen/generation/defaults"
import { importGenesisWorld } from "./import-heightmap"
import { decodePng } from "./node-png"

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

const LAT_BANDS = [
	{ label: "60N–90N", lo: 60, hi: 90 },
	{ label: "30N–60N", lo: 30, hi: 60 },
	{ label: "0–30N", lo: 0, hi: 30 },
	{ label: "0–30S", lo: -30, hi: 0 },
	{ label: "30S–60S", lo: -60, hi: -30 },
	{ label: "60S–90S", lo: -90, hi: -60 },
]

const HEMISPHERE_BANDS = [
	{ label: "N hemisphere", lo: 0, hi: 90 },
	{ label: "S hemisphere", lo: -90, hi: 0 },
]

const ELEVATION_BINS = [
	{ label: "0–0.5km", lo: 0, hi: 0.5 },
	{ label: "0.5–1.5km", lo: 0.5, hi: 1.5 },
	{ label: "1.5–3km", lo: 1.5, hi: 3 },
	{ label: "3km+", lo: 3, hi: Infinity },
]

// mm/yr wetness classes, roughly following Köppen-style aridity thresholds
const WETNESS_BINS = [
	{ label: "arid <250mm", lo: 0, hi: 250 },
	{ label: "semi-arid 250–500mm", lo: 250, hi: 500 },
	{ label: "sub-humid 500–1000mm", lo: 500, hi: 1000 },
	{ label: "humid 1000–2000mm", lo: 1000, hi: 2000 },
	{ label: "very wet 2000mm+", lo: 2000, hi: Infinity },
]

describe("Rain model vs observed Earth precipitation (land only)", () => {
	it("imports the real Earth heightmap and compares modeled vs WorldClim land precipitation", () => {
		const earth = loadGrayscale("earth.png")
		const coastline = loadGrayscale("coastline-mask.png")
		const lake = loadGrayscale("lake-mask.png")
		const riverLines = loadRiverLines()
		const realClimate = loadRealClimate("earth-real-temperature")
		const realPrecip = loadRealClimate("earth-real-precipitation")
		const realElevation = loadRealElevation()

		const world = importGenesisWorld({
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
		})

		const { rainfall, isLand, mesh, elevation_km } = world
		expect(rainfall.real_annual).toBeDefined()
		expect(rainfall.diff_annual).toBeDefined()

		const modeledAnnual = rainfall.annual
		const realAnnual = rainfall.real_annual!
		const diffAnnual = rainfall.diff_annual!
		const r_xyz = mesh.r_xyz
		function latDegAt(r: number): number {
			const z = r_xyz[r * 3 + 2]
			return (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI
		}

		let n = 0
		let sumDiff = 0
		let sumAbsDiff = 0
		let sumSq = 0
		let sumObserved = 0
		let sumModeled = 0
		let sumAbsPctErr = 0
		let nPctErr = 0
		let tooWet = 0 // model > observed by > 300mm/yr
		let tooDry = 0 // model < observed by > 300mm/yr
		let justRight = 0

		const bandStats = LAT_BANDS.map((b) => ({
			...b,
			n: 0,
			sumDiff: 0,
			sumObserved: 0,
			sumModeled: 0,
		}))
		const hemisphereStats = HEMISPHERE_BANDS.map((b) => ({
			...b,
			n: 0,
			sumDiff: 0,
			sumObserved: 0,
			sumModeled: 0,
		}))
		const elevationStats = ELEVATION_BINS.map((b) => ({
			...b,
			n: 0,
			sumDiff: 0,
			sumObserved: 0,
			sumModeled: 0,
		}))
		const wetnessStats = WETNESS_BINS.map((b) => ({
			...b,
			n: 0,
			sumDiff: 0,
			sumObserved: 0,
			sumModeled: 0,
		}))

		for (let r = 0; r < mesh.numRegions; r++) {
			if (!isLand[r]) continue
			const observed = realAnnual[r]
			if (!Number.isFinite(observed)) continue // nodata
			const modeled = modeledAnnual[r]
			const diff = diffAnnual[r]
			n++
			sumDiff += diff
			sumAbsDiff += Math.abs(diff)
			sumSq += diff * diff
			sumObserved += observed
			sumModeled += modeled
			if (observed > 50) {
				sumAbsPctErr += Math.abs(diff) / observed
				nPctErr++
			}
			if (diff > 300) tooWet++
			else if (diff < -300) tooDry++
			else justRight++

			const lat = latDegAt(r)
			const band = bandStats.find((b) => lat >= b.lo && lat < b.hi)
			if (band) {
				band.n++
				band.sumDiff += diff
				band.sumObserved += observed
				band.sumModeled += modeled
			}

			const hemisphere = hemisphereStats.find((b) => lat >= b.lo && lat < b.hi)
			if (hemisphere) {
				hemisphere.n++
				hemisphere.sumDiff += diff
				hemisphere.sumObserved += observed
				hemisphere.sumModeled += modeled
			}

			const elevKm = elevation_km ? elevation_km[r] : NaN
			const elevBin = elevationStats.find(
				(b) => elevKm >= b.lo && elevKm < b.hi,
			)
			if (elevBin) {
				elevBin.n++
				elevBin.sumDiff += diff
				elevBin.sumObserved += observed
				elevBin.sumModeled += modeled
			}

			const wetBin = wetnessStats.find(
				(b) => observed >= b.lo && observed < b.hi,
			)
			if (wetBin) {
				wetBin.n++
				wetBin.sumDiff += diff
				wetBin.sumObserved += observed
				wetBin.sumModeled += modeled
			}
		}

		const meanBiasMm = sumDiff / Math.max(1, n)
		const meanAbsErrorMm = sumAbsDiff / Math.max(1, n)
		const rmseMm = Math.sqrt(sumSq / Math.max(1, n))
		const meanAbsPctErr = (sumAbsPctErr / Math.max(1, nPctErr)) * 100
		const totalObservedMm = sumObserved / Math.max(1, n)
		const totalModeledMm = sumModeled / Math.max(1, n)

		console.info("Land cells compared", n, "of", mesh.numRegions)
		console.info("Overall rain model vs WorldClim (land only, annual total mm)")
		console.table({
			meanObservedMm: Number(totalObservedMm.toFixed(0)),
			meanModeledMm: Number(totalModeledMm.toFixed(0)),
			meanBiasMm: Number(meanBiasMm.toFixed(0)),
			meanAbsErrorMm: Number(meanAbsErrorMm.toFixed(0)),
			meanAbsPctErr: Number(meanAbsPctErr.toFixed(1)),
			rmseMm: Number(rmseMm.toFixed(0)),
			tooWetPct: Number(((tooWet / Math.max(1, n)) * 100).toFixed(1)),
			tooDryPct: Number(((tooDry / Math.max(1, n)) * 100).toFixed(1)),
			justRightPct: Number(((justRight / Math.max(1, n)) * 100).toFixed(1)),
		})

		console.info("By latitude band (bias = model minus observed, mm/yr)")
		console.table(
			bandStats.map((b) => ({
				band: b.label,
				landCells: b.n,
				meanObservedMm:
					b.n > 0 ? Number((b.sumObserved / b.n).toFixed(0)) : NaN,
				meanModeledMm: b.n > 0 ? Number((b.sumModeled / b.n).toFixed(0)) : NaN,
				meanBiasMm: b.n > 0 ? Number((b.sumDiff / b.n).toFixed(0)) : NaN,
			})),
		)

		console.info("By hemisphere (bias = model minus observed, mm/yr)")
		console.table(
			hemisphereStats.map((b) => ({
				hemisphere: b.label,
				landCells: b.n,
				meanObservedMm:
					b.n > 0 ? Number((b.sumObserved / b.n).toFixed(0)) : NaN,
				meanModeledMm: b.n > 0 ? Number((b.sumModeled / b.n).toFixed(0)) : NaN,
				meanBiasMm: b.n > 0 ? Number((b.sumDiff / b.n).toFixed(0)) : NaN,
			})),
		)

		console.info("By land elevation (bias = model minus observed, mm/yr)")
		console.table(
			elevationStats.map((b) => ({
				elevation: b.label,
				landCells: b.n,
				meanObservedMm:
					b.n > 0 ? Number((b.sumObserved / b.n).toFixed(0)) : NaN,
				meanModeledMm: b.n > 0 ? Number((b.sumModeled / b.n).toFixed(0)) : NaN,
				meanBiasMm: b.n > 0 ? Number((b.sumDiff / b.n).toFixed(0)) : NaN,
			})),
		)

		console.info(
			"By observed wetness class (bias = model minus observed, mm/yr) -- shows over/under-dispersion",
		)
		console.table(
			wetnessStats.map((b) => ({
				wetness: b.label,
				landCells: b.n,
				meanObservedMm:
					b.n > 0 ? Number((b.sumObserved / b.n).toFixed(0)) : NaN,
				meanModeledMm: b.n > 0 ? Number((b.sumModeled / b.n).toFixed(0)) : NaN,
				meanBiasMm: b.n > 0 ? Number((b.sumDiff / b.n).toFixed(0)) : NaN,
			})),
		)

		expect(n).toBeGreaterThan(0)
		expect(Number.isFinite(meanBiasMm)).toBe(true)
	}, 600_000)
})
