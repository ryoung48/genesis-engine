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

const REPORT = "teq-swing-report.txt"
const NEWLINE = String.fromCharCode(10)

const swingOf = (series: number[]): string => {
	const lo = Math.min(...series)
	const hi = Math.max(...series)
	return `min ${lo.toFixed(1)}  max ${hi.toFixed(1)}  swing ${(hi - lo).toFixed(1)}`
}

describe("Modeled vs observed thermal-equator migration on Earth", () => {
	it("runs computeThermalEquator on modeled and observed monthly temperature", () => {
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
		const { climate, mesh } = world
		const observed = climate.real_temperature_monthly
		expect(observed).toBeDefined()
		if (!observed) return

		const N = mesh.numRegions
		const lines: string[] = []

		// Same function, same binning, same mesh — only the temperature differs.
		const modeled: Float32Array[] = []
		const real: Float32Array[] = []
		for (let month = 0; month < 12; month++) {
			modeled.push(
				RAIN.computeThermalEquator({
					mesh,
					temps: climate.temperature_monthly.subarray(
						month * N,
						(month + 1) * N,
					),
				}),
			)
			real.push(
				RAIN.computeThermalEquator({
					mesh,
					temps: observed.subarray(month * N, (month + 1) * N),
				}),
			)
		}

		const meanOf = (a: Float32Array): number => {
			let sum = 0
			for (let i = 0; i < a.length; i++) sum += a[i]
			return sum / a.length
		}

		const modeledMean = modeled.map(meanOf)
		const realMean = real.map(meanOf)

		lines.push("Global-mean thermal equator latitude, by month")
		lines.push("month   modeled   observed")
		for (let month = 0; month < 12; month++) {
			lines.push(
				`${String(month + 1).padStart(5)}   ${modeledMean[month].toFixed(1).padStart(7)}   ${realMean[month].toFixed(1).padStart(8)}`,
			)
		}
		lines.push("")
		lines.push(`modeled  ${swingOf(modeledMean)}`)
		lines.push(`observed ${swingOf(realMean)}`)

		// Per-longitude swing: how far each bin's own TEQ travels over the year.
		// A damped global mean can hide bins that swing hard in opposite phase.
		const binSwing = (series: Float32Array[]): number[] => {
			const out: number[] = []
			for (let bin = 0; bin < series[0].length; bin++) {
				let lo = Infinity
				let hi = -Infinity
				for (let month = 0; month < 12; month++) {
					lo = Math.min(lo, series[month][bin])
					hi = Math.max(hi, series[month][bin])
				}
				out.push(hi - lo)
			}
			return out
		}
		const mSwing = binSwing(modeled)
		const rSwing = binSwing(real)
		const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length
		lines.push("")
		lines.push(
			`per-longitude-bin annual swing — modeled mean ${avg(mSwing).toFixed(1)} max ${Math.max(...mSwing).toFixed(1)}`,
		)
		lines.push(
			`per-longitude-bin annual swing — observed mean ${avg(rSwing).toFixed(1)} max ${Math.max(...rSwing).toFixed(1)}`,
		)

		// Is it the TEQ extraction or the temperature field? Compare the raw
		// seasonal temperature amplitude the two fields carry, over land.
		let modAmp = 0
		let realAmp = 0
		let counted = 0
		for (let r = 0; r < N; r++) {
			let mLo = Infinity
			let mHi = -Infinity
			let rLo = Infinity
			let rHi = -Infinity
			let ok = true
			for (let month = 0; month < 12; month++) {
				const m = climate.temperature_monthly[month * N + r]
				const o = observed[month * N + r]
				if (!Number.isFinite(o)) ok = false
				mLo = Math.min(mLo, m)
				mHi = Math.max(mHi, m)
				rLo = Math.min(rLo, o)
				rHi = Math.max(rHi, o)
			}
			if (!ok) continue
			modAmp += mHi - mLo
			realAmp += rHi - rLo
			counted++
		}
		lines.push("")
		lines.push(
			`mean annual temperature range per cell — modeled ${(modAmp / counted).toFixed(1)}C  observed ${(realAmp / counted).toFixed(1)}C  (${counted} cells)`,
		)

		// Localize the amplitude deficit: land vs ocean, by latitude band.
		const { latDeg, lonDeg } = RAIN.getClimateGeometry(mesh)
		const BANDS = [
			{ label: "60-90N", lo: 60, hi: 90 },
			{ label: "30-60N", lo: 30, hi: 60 },
			{ label: "20-30N", lo: 20, hi: 30 },
			{ label: "10-20N", lo: 10, hi: 20 },
			{ label: " 0-10N", lo: 0, hi: 10 },
			{ label: " 0-10S", lo: -10, hi: 0 },
			{ label: "10-20S", lo: -20, hi: -10 },
			{ label: "20-30S", lo: -30, hi: -20 },
			{ label: "30-60S", lo: -60, hi: -30 },
			{ label: "60-90S", lo: -90, hi: -60 },
		]
		const stats = BANDS.flatMap((b) =>
			["land", "ocean"].map((surface) => ({
				...b,
				surface,
				n: 0,
				mod: 0,
				obs: 0,
				modMean: 0,
				obsMean: 0,
			})),
		)
		for (let r = 0; r < N; r++) {
			let mLo = Infinity
			let mHi = -Infinity
			let rLo = Infinity
			let rHi = -Infinity
			let ok = true
			for (let month = 0; month < 12; month++) {
				const m = climate.temperature_monthly[month * N + r]
				const o = observed[month * N + r]
				if (!Number.isFinite(o)) ok = false
				mLo = Math.min(mLo, m)
				mHi = Math.max(mHi, m)
				rLo = Math.min(rLo, o)
				rHi = Math.max(rHi, o)
			}
			if (!ok) continue
			const surface = world.isLand[r] ? "land" : "ocean"
			const row = stats.find(
				(b) => b.surface === surface && latDeg[r] >= b.lo && latDeg[r] < b.hi,
			)
			if (!row) continue
			row.n++
			row.mod += mHi - mLo
			row.obs += rHi - rLo
			let mSum = 0
			let oSum = 0
			for (let month = 0; month < 12; month++) {
				mSum += climate.temperature_monthly[month * N + r]
				oSum += observed[month * N + r]
			}
			row.modMean += mSum / 12
			row.obsMean += oSum / 12
		}
		lines.push("")
		lines.push("annual MEAN temperature (C) by band and surface")
		lines.push("band     surface   modeled  observed       bias")
		for (const row of stats) {
			if (row.n < 50) continue
			const mod = row.modMean / row.n
			const obs = row.obsMean / row.n
			lines.push(
				`${row.label}   ${row.surface.padEnd(7)}  ${mod.toFixed(1).padStart(7)}  ${obs.toFixed(1).padStart(8)}  ${(mod - obs).toFixed(1).padStart(9)}`,
			)
		}

		lines.push("")
		lines.push("annual temperature range (C) by band and surface")
		lines.push("band     surface   modeled  observed    deficit")
		for (const row of stats) {
			if (row.n < 50) continue
			const mod = row.mod / row.n
			const obs = row.obs / row.n
			lines.push(
				`${row.label}   ${row.surface.padEnd(7)}  ${mod.toFixed(1).padStart(7)}  ${obs.toFixed(1).padStart(8)}  ${(mod - obs).toFixed(1).padStart(9)}`,
			)
		}

		// Per-site probe. computeThermalEquator smooths each bin over +/-18 bins
		// (+/-54 deg of longitude), so compare the smoothed value the model
		// actually uses against the raw per-bin argmax latitude it was built
		// from — that separates "the signal is weak here" from "the smoothing
		// window averaged it away against neighbouring ocean".
		const NUM_BINS = 120
		const rawArgmaxLat = (temps: Float32Array): Float32Array => {
			const best = new Float32Array(NUM_BINS).fill(-Infinity)
			const bestLat = new Float32Array(NUM_BINS)
			for (let r = 0; r < N; r++) {
				const bin = Math.max(
					0,
					Math.min(
						NUM_BINS - 1,
						Math.floor(((lonDeg[r] + 180) / 360) * NUM_BINS),
					),
				)
				if (temps[r] > best[bin]) {
					best[bin] = temps[r]
					bestLat[bin] = latDeg[r]
				}
			}
			return bestLat
		}
		const modeledRaw: Float32Array[] = []
		const realRaw: Float32Array[] = []
		for (let month = 0; month < 12; month++) {
			modeledRaw.push(
				rawArgmaxLat(
					climate.temperature_monthly.subarray(month * N, (month + 1) * N),
				),
			)
			realRaw.push(rawArgmaxLat(observed.subarray(month * N, (month + 1) * N)))
		}

		const SITES = [
			{ label: "Florida", lon: -81 },
			{ label: "East China", lon: 118 },
			{ label: "India", lon: 78 },
			{ label: "Sahara", lon: 10 },
			{ label: "Mid-Pacific", lon: -150 },
		]
		for (const site of SITES) {
			const bin = Math.max(
				0,
				Math.min(NUM_BINS - 1, Math.floor(((site.lon + 180) / 360) * NUM_BINS)),
			)
			const mS = modeled.map((m) => m[bin])
			const rS = real.map((m) => m[bin])
			const mR = modeledRaw.map((m) => m[bin])
			const rR = realRaw.map((m) => m[bin])
			lines.push("")
			lines.push(`${site.label} (lon ${site.lon}, bin ${bin})`)
			lines.push("month   modSmooth  modRaw   obsSmooth  obsRaw")
			for (let month = 0; month < 12; month++) {
				lines.push(
					`${String(month + 1).padStart(5)}   ${mS[month].toFixed(1).padStart(9)}  ${mR[month].toFixed(1).padStart(6)}   ${rS[month].toFixed(1).padStart(9)}  ${rR[month].toFixed(1).padStart(6)}`,
				)
			}
			lines.push(
				`  swing: modSmooth ${swingOf(mS)} | modRaw ${swingOf(mR)} | obsSmooth ${swingOf(rS)} | obsRaw ${swingOf(rR)}`,
			)
		}

		// Is the argmax pinned to the equator because subtropical land never gets
		// hot enough to beat it? Compare, per site bin, the hottest cell against
		// the equatorial cells in that same bin.
		lines.push("")
		lines.push("Peak vs equator temperature (C) within each longitude bin")
		lines.push(
			"site          month   modMax  modMaxLat   modEq    obsMax  obsMaxLat   obsEq",
		)
		for (const site of SITES) {
			const bin = Math.max(
				0,
				Math.min(NUM_BINS - 1, Math.floor(((site.lon + 180) / 360) * NUM_BINS)),
			)
			for (const month of [0, 6]) {
				let modMax = -Infinity
				let modMaxLat = 0
				let obsMax = -Infinity
				let obsMaxLat = 0
				let modEq = 0
				let obsEq = 0
				let eqCount = 0
				for (let r = 0; r < N; r++) {
					const rBin = Math.max(
						0,
						Math.min(
							NUM_BINS - 1,
							Math.floor(((lonDeg[r] + 180) / 360) * NUM_BINS),
						),
					)
					if (rBin !== bin) continue
					const m = climate.temperature_monthly[month * N + r]
					const o = observed[month * N + r]
					if (m > modMax) {
						modMax = m
						modMaxLat = latDeg[r]
					}
					if (Number.isFinite(o) && o > obsMax) {
						obsMax = o
						obsMaxLat = latDeg[r]
					}
					if (Math.abs(latDeg[r]) <= 3) {
						modEq += m
						obsEq += Number.isFinite(o) ? o : 0
						eqCount++
					}
				}
				lines.push(
					`${site.label.padEnd(13)} ${String(month + 1).padStart(5)}   ${modMax.toFixed(1).padStart(6)}  ${modMaxLat.toFixed(1).padStart(9)}  ${(modEq / Math.max(1, eqCount)).toFixed(1).padStart(6)}    ${obsMax.toFixed(1).padStart(6)}  ${obsMaxLat.toFixed(1).padStart(9)}  ${(obsEq / Math.max(1, eqCount)).toFixed(1).padStart(6)}`,
				)
			}
		}

		// Clamp or genuinely hot? A clamp shows as a spike in the top bin.
		lines.push("")
		lines.push("July modeled temperature histogram, top of range (all cells)")
		const jul = climate.temperature_monthly.subarray(6 * N, 7 * N)
		const julObs = observed.subarray(6 * N, 7 * N)
		const hist = (a: Float32Array, label: string) => {
			const counts = new Map<string, number>()
			let maxSeen = -Infinity
			for (let r = 0; r < N; r++) {
				const v = a[r]
				if (!Number.isFinite(v)) continue
				if (v > maxSeen) maxSeen = v
				if (v < 30) continue
				const key = (Math.floor(v * 5) / 5).toFixed(1)
				counts.set(key, (counts.get(key) ?? 0) + 1)
			}
			const rows = [...counts.entries()].sort(
				(a2, b2) => Number(b2[0]) - Number(a2[0]),
			)
			lines.push(`${label} (max seen ${maxSeen.toFixed(2)})`)
			for (const [bucket, count] of rows.slice(0, 12)) {
				lines.push(`  ${bucket.padStart(6)}C  ${String(count).padStart(6)}`)
			}
		}
		hist(jul, "modeled")
		hist(julObs, "observed")

		// Does the warm MASS move more than the warm POINT? Per bin, compare the
		// current argmax latitude against a temperature-weighted mean latitude
		// over cells within 2C of that bin's max. If both are equally flat, a
		// more robust statistic cannot help and the field itself is the problem.
		const binStat = (
			temps: Float32Array,
			mode: "argmax" | "within2C",
		): Float32Array => {
			const best = new Float32Array(NUM_BINS).fill(-Infinity)
			const bestLat = new Float32Array(NUM_BINS)
			const binOf = new Int32Array(N)
			for (let r = 0; r < N; r++) {
				binOf[r] = Math.max(
					0,
					Math.min(
						NUM_BINS - 1,
						Math.floor(((lonDeg[r] + 180) / 360) * NUM_BINS),
					),
				)
				if (temps[r] > best[binOf[r]]) {
					best[binOf[r]] = temps[r]
					bestLat[binOf[r]] = latDeg[r]
				}
			}
			if (mode === "argmax") return bestLat
			const wsum = new Float32Array(NUM_BINS)
			const wtot = new Float32Array(NUM_BINS)
			for (let r = 0; r < N; r++) {
				const b = binOf[r]
				const excess = temps[r] - (best[b] - 2)
				if (excess <= 0) continue
				wsum[b] += latDeg[r] * excess
				wtot[b] += excess
			}
			const out = new Float32Array(NUM_BINS)
			for (let b = 0; b < NUM_BINS; b++) {
				out[b] = wtot[b] > 0 ? wsum[b] / wtot[b] : bestLat[b]
			}
			return out
		}

		const swingStats = (
			pick: (temps: Float32Array) => Float32Array,
			source: Float32Array,
		): number => {
			const perMonth: Float32Array[] = []
			for (let month = 0; month < 12; month++) {
				perMonth.push(pick(source.subarray(month * N, (month + 1) * N)))
			}
			let total = 0
			for (let b = 0; b < NUM_BINS; b++) {
				let lo = Infinity
				let hi = -Infinity
				for (let month = 0; month < 12; month++) {
					lo = Math.min(lo, perMonth[month][b])
					hi = Math.max(hi, perMonth[month][b])
				}
				total += hi - lo
			}
			return total / NUM_BINS
		}

		lines.push("")
		lines.push("Mean per-bin annual swing (deg lat), unsmoothed")
		lines.push(
			`  modeled  argmax   ${swingStats((t) => binStat(t, "argmax"), climate.temperature_monthly).toFixed(1)}`,
		)
		lines.push(
			`  modeled  within2C ${swingStats((t) => binStat(t, "within2C"), climate.temperature_monthly).toFixed(1)}`,
		)
		lines.push(
			`  observed argmax   ${swingStats((t) => binStat(t, "argmax"), observed).toFixed(1)}`,
		)
		lines.push(
			`  observed within2C ${swingStats((t) => binStat(t, "within2C"), observed).toFixed(1)}`,
		)

		// Modeled cloud fraction by band and surface vs observed. The cloud
		// temperature modifier adds up to +5C to a warm, clear cell and -5C to
		// a warm, overcast one, and it runs over ocean as well as land.
		const cloud = world.climate.cloud_cover_monthly
		const obsCloud = world.observedCloudCover?.real_annual
		if (cloud) {
			const cbands = new Map<string, { n: number; mod: number; obs: number }>()
			for (let r = 0; r < N; r++) {
				const band = BANDS.find((b) => latDeg[r] >= b.lo && latDeg[r] < b.hi)
				if (!band) continue
				const key = `${band.label}|${world.isLand[r] ? "land" : "ocean"}`
				const acc = cbands.get(key) ?? { n: 0, mod: 0, obs: 0 }
				let sum = 0
				for (let month = 0; month < 12; month++) sum += cloud[month * N + r]
				acc.mod += sum / 12
				const o = obsCloud?.[r]
				acc.obs += Number.isFinite(o) ? (o as number) : 0
				acc.n++
				cbands.set(key, acc)
			}
			lines.push("")
			lines.push("annual mean cloud fraction by band and surface")
			lines.push("band     surface   modeled  observed")
			for (const band of BANDS) {
				for (const surface of ["land", "ocean"]) {
					const acc = cbands.get(`${band.label}|${surface}`)
					if (!acc || acc.n < 50) continue
					lines.push(
						`${band.label}   ${surface.padEnd(7)}  ${(acc.mod / acc.n).toFixed(3).padStart(7)}  ${(acc.obs / acc.n).toFixed(3).padStart(8)}`,
					)
				}
			}
		}

		writeFileSync(REPORT, lines.join(NEWLINE))
		expect(modeledMean.length).toBe(12)
	}, 600_000)
})
