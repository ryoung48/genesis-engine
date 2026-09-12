import { describe, expect, it } from "vitest"
import { OBSERVED_EARTH } from "@/model/climate/observed-earth"
import { RAIN } from "@/model/climate/precipitation/rain"
import { INSOLATION } from "@/model/climate/temperature/ebm/insolation"
import { WIND } from "@/model/climate/weather/wind"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import { loadEarthGrayscale, loadEarthMonthlyRaster } from "./assets"

// NOTE ON COMPARABILITY:
// The model's wind field (WIND.computeWindVectors) solves a steady
// boundary-layer balance (friction + Coriolis against a pressure-gradient
// force) on a synthesized pressure field: a Hadley/Ferrel/polar template
// whose trough follows the surface thermal equator and whose cell
// amplitudes come from the zonal-mean temperature contrast across each
// cell, with the subtropical ridge and polar-front trough held only over
// ocean, plus continental heat lows and a sea-level temperature anomaly
// term, passed through a steady linear shallow-water (Gill-Matsuno) solve
// for mass conservation. A heuristic western-boundary flow toward the
// summer pole stands in for the western intensification a steady balance
// cannot produce (cross-equatorial jets, the western flank of the summer
// subtropical anticyclone). Coriolis-deflected katabatic drainage off
// perennial ice, orographic blocking and a surface-drag multiplier are
// added per cell. It has no transient storms, jet streaks or ENSO. A
// time-stepped nonlinear shallow-water model is available behind the
// LARGE_SCALE_SOLVER switch but is off for cost.
//
// The comparison data (earth-real-wind-u/v, derived from NCEP/NCAR reanalysis
// 10m monthly wind) is an actual assimilation of decades of real observations.
//
// So: agreement on the big zonal-mean structure (easterly trades, midlatitude
// westerlies, Antarctic coastal easterlies, monsoon reversals) is the
// meaningful check. Per-cell direction agreement is bounded by the missing
// regional dynamics; treat the pooled direction cosine as "how much regional
// detail is missing," not "is the model broken."

const LAT_BANDS = [
	{ label: "60N-90N (polar E)", lo: 60, hi: 90 },
	{ label: "30N-60N (westerlies)", lo: 30, hi: 60 },
	{ label: "0-30N (trades)", lo: 0, hi: 30 },
	{ label: "0-30S (trades)", lo: -30, hi: 0 },
	{ label: "30S-60S (westerlies)", lo: -60, hi: -30 },
	{ label: "60S-90S (polar E)", lo: -90, hi: -60 },
]

const OCEAN_BASINS: Array<{
	label: string
	lon: [number, number]
	side: 1 | -1
}> = [
	{ label: "North Atlantic", lon: [-60, -10], side: 1 },
	{ label: "North Pacific", lon: [150, -130], side: 1 },
	{ label: "South Pacific", lon: [-170, -80], side: -1 },
	{ label: "South Indian", lon: [50, 110], side: -1 },
]

const TROUGH_BASINS: Array<{ label: string; lon: [number, number] }> = [
	{ label: "Atlantic", lon: [-40, -10] },
	{ label: "East Pacific", lon: [-140, -90] },
	{ label: "West Pacific", lon: [140, 180] },
	{ label: "Indian", lon: [50, 90] },
]
const TROUGH_MIN_LAT = -30
const TROUGH_BIN_DEG = 2
const TROUGH_BINS = 30

// Regression floors. Ocean trades are held up by surface torque balance
// against the model's own westerlies; they stay short of observed because the
// model has no transient storms adding to midlatitude surface drag.
const MIN_OCEAN_TRADE_SPEED_RATIO = 0.75
const MIN_OCEAN_WESTERLY_SPEED_RATIO = 0.85
const MAX_OCEAN_WESTERLY_SPEED_RATIO = 1.2
const MAX_LAND_MEAN_ABS_SPEED_ERROR_MS = 1.4

// Nominal January 1 noon phase from JPL's J2000 Earth orbital elements:
// https://ssd.jpl.nasa.gov/planets/approx_pos.html
const EARTH_JANUARY_START_SOLAR_LONGITUDE_DEGREES = 280.38

describe("model wind vs observed Earth wind (NCEP/NCAR)", () => {
	it.each([
		"modeled",
		"observed",
	] as const)("compares generated wind using %s temperatures against reanalysis", (temperatureSource) => {
		const earth = loadEarthGrayscale("earth.png")
		const coastline = loadEarthGrayscale("coastline-mask.png")
		const lake = loadEarthGrayscale("lake-mask.png")
		const realWindU = loadEarthMonthlyRaster("earth-real-wind-u")
		const realWindV = loadEarthMonthlyRaster("earth-real-wind-v")

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

		expect(world.observedWind?.real_u_monthly).toBeDefined()

		if (temperatureSource === "observed") {
			const raster = loadEarthMonthlyRaster("earth-real-temperature")
			const monthly = OBSERVED_EARTH.sampleMonthlyFloatRaster({
				mesh: world.mesh,
				raster: raster.monthly,
				rasterW: raster.width,
				rasterH: raster.height,
				months: raster.months,
				scale: raster.scale,
				nodata: raster.nodata,
			})
			const regionCount = world.mesh.numRegions
			expect(raster.months).toBe(12)
			expect(monthly.every(Number.isFinite)).toBe(true)
			const seaLevel = new Float32Array(monthly.length)
			const annual = new Float32Array(regionCount)
			for (let month = 0; month < 12; month++) {
				for (let r = 0; r < regionCount; r++) {
					const idx = month * regionCount + r
					const terrainCorrection =
						world.climate.temperature_monthly_nolapse[idx] -
						world.climate.temperature_monthly[idx]
					seaLevel[idx] = monthly[idx] + terrainCorrection
					annual[r] += monthly[idx] / 12
				}
			}
			const { _declination: dailyDeclination } = INSOLATION.compute({
				lats: [0],
				orbital: {
					OBLIQUITY: world.params.obliquity,
					ECCENTRICITY: world.params.eccentricity,
					PERIHELION: world.params.perihelion,
				},
				sampleCount: 365,
				startSolarLongitudeDegrees: EARTH_JANUARY_START_SOLAR_LONGITUDE_DEGREES,
			})
			const declinationMonthly = new Float32Array(12)
			let calendarDay = 0
			for (let month = 0; month < 12; month++) {
				const days = new Date(Date.UTC(2001, month + 1, 0)).getUTCDate()
				let sum = 0
				for (let day = 0; day < days; day++)
					sum += dailyDeclination[calendarDay + day]
				declinationMonthly[month] = (sum / days) * (180 / Math.PI)
				calendarDay += days
			}
			expect(calendarDay).toBe(dailyDeclination.length)
			expect(declinationMonthly[0]).toBeLessThan(-19)
			expect(declinationMonthly[1]).toBeLessThan(-11)
			expect(declinationMonthly[5]).toBeGreaterThan(22)
			expect(declinationMonthly[8]).toBeGreaterThan(0)
			world.climate = {
				...world.climate,
				temperature_monthly: monthly,
				temperature_monthly_nolapse: seaLevel,
				temperature_avg: annual,
				declination_monthly: declinationMonthly,
			}
			console.info("Observed-temperature calendar declination, Jan–Dec", [
				...declinationMonthly,
			])
		}

		const r_xyz = world.mesh.r_xyz
		function latDegAt(r: number): number {
			const z = r_xyz[r * 3 + 2]
			return (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI
		}

		const topography = world.topography
		function isLand(r: number): boolean {
			const t = topography[r]
			return t !== CLASSIFICATION.topoOcean && t !== CLASSIFICATION.topoLake
		}

		type Acc = {
			n: number
			sumVectorErr: number
			sumModelSpeed: number
			sumObsSpeed: number
			sumSpeedDiff: number
			sumAbsSpeedDiff: number
			sumSpeedSq: number
			sumCos: number
			sumAngleErr: number
			nParity: number // cos > 0 : model wind within 90deg of observed
			nZonalSign: number // sign(modelU) === sign(obsU) : east/west parity
			nMeridSign: number // sign(modelV) === sign(obsV) : north/south parity
		}
		const newAcc = (): Acc => ({
			n: 0,
			sumVectorErr: 0,
			sumModelSpeed: 0,
			sumObsSpeed: 0,
			sumSpeedDiff: 0,
			sumAbsSpeedDiff: 0,
			sumSpeedSq: 0,
			sumCos: 0,
			sumAngleErr: 0,
			nParity: 0,
			nZonalSign: 0,
			nMeridSign: 0,
		})

		type Sample = {
			mu: number
			mv: number
			ou: number
			ov: number
			mSpeed: number
			oSpeed: number
		}
		function fold(acc: Acc, s: Sample): void {
			acc.n++
			acc.sumVectorErr += Math.hypot(
				s.mu * s.mSpeed - s.ou * s.oSpeed,
				s.mv * s.mSpeed - s.ov * s.oSpeed,
			)
			acc.sumModelSpeed += s.mSpeed
			acc.sumObsSpeed += s.oSpeed
			const speedDiff = s.mSpeed - s.oSpeed
			acc.sumSpeedDiff += speedDiff
			acc.sumAbsSpeedDiff += Math.abs(speedDiff)
			acc.sumSpeedSq += speedDiff * speedDiff
			const cos = s.mu * s.ou + s.mv * s.ov // both are unit vectors
			acc.sumCos += cos
			acc.sumAngleErr +=
				(Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI
			if (cos > 0) acc.nParity++
			if (Math.sign(s.mu) === Math.sign(s.ou)) acc.nZonalSign++
			if (Math.sign(s.mv) === Math.sign(s.ov)) acc.nMeridSign++
		}
		function summarize(acc: Acc): Record<string, number> {
			const d = Math.max(1, acc.n)
			return {
				cells: acc.n,
				meanVectorErrorMs: Number((acc.sumVectorErr / d).toFixed(3)),
				speedRatio: Number(
					(acc.sumModelSpeed / Math.max(1e-9, acc.sumObsSpeed)).toFixed(2),
				),
				meanSpeedBiasMs: Number((acc.sumSpeedDiff / d).toFixed(2)),
				meanAbsSpeedErrorMs: Number((acc.sumAbsSpeedDiff / d).toFixed(2)),
				rmseSpeedMs: Number(Math.sqrt(acc.sumSpeedSq / d).toFixed(2)),
				meanDirectionCos: Number((acc.sumCos / d).toFixed(3)),
				meanAngleErrDeg: Number((acc.sumAngleErr / d).toFixed(1)),
				parityRate_within90deg: Number((acc.nParity / d).toFixed(3)),
				zonalSignMatch_EW: Number((acc.nZonalSign / d).toFixed(3)),
				meridSignMatch_NS: Number((acc.nMeridSign / d).toFixed(3)),
			}
		}

		const N = world.mesh.numRegions
		const surface = {
			vegetation: world.vegetation,
			topography: world.topography,
			slopeScore: world.slopeScore,
			oceanDist: world.oceanDist,
		}
		const months = world.observedWind?.real_u_monthly
			? Math.round(world.observedWind.real_u_monthly.length / N)
			: 12
		const MONTH_LABELS = [
			"Jan",
			"Feb",
			"Mar",
			"Apr",
			"May",
			"Jun",
			"Jul",
			"Aug",
			"Sep",
			"Oct",
			"Nov",
			"Dec",
		]

		const overall = newAcc()
		const bandAcc = LAT_BANDS.map((b) => ({ ...b, acc: newAcc() }))
		const oceanBandAcc = LAT_BANDS.map((b) => ({ ...b, acc: newAcc() }))
		const oceanOverall = newAcc()
		const annualModelU = new Float64Array(N)
		const annualObsU = new Float64Array(N)
		const annualObsCount = new Int32Array(N)
		const annualModelV = new Float64Array(N)
		const annualObsV = new Float64Array(N)
		const annualModelSpeed = new Float64Array(N)
		const annualObsSpeed = new Float64Array(N)
		const perMonthRows: Record<string, number | string>[] = []

		// Monthly north-south ocean wind by 2-degree latitude bin per basin, to
		// find the surface trough where the trades converge.
		const { lonDeg } = RAIN.getClimateGeometry(world.mesh)
		const inLonRange = ({
			lon,
			range,
		}: {
			lon: number
			range: [number, number]
		}) =>
			range[0] <= range[1]
				? lon >= range[0] && lon <= range[1]
				: lon >= range[0] || lon <= range[1]
		const troughSums = TROUGH_BASINS.map(() => ({
			model: new Float64Array(months * TROUGH_BINS),
			observed: new Float64Array(months * TROUGH_BINS),
			count: new Int32Array(months * TROUGH_BINS),
		}))
		// The model's own thermal equators per basin and month: land-inclusive
		// (what the wind template's trough follows) and ocean-only (what its
		// subtropical ridge follows).
		const basinTeq = TROUGH_BASINS.map(() => ({
			full: [] as number[],
			ocean: [] as number[],
		}))
		const basinMean = ({
			teq,
			range,
		}: {
			teq: Float32Array
			range: [number, number]
		}) => {
			let sum = 0
			let count = 0
			for (let i = 0; i < teq.length; i++) {
				const lon = -180 + ((i + 0.5) * 360) / teq.length
				if (!inLonRange({ lon, range }) || !Number.isFinite(teq[i])) continue
				sum += teq[i]
				count++
			}
			return count > 0 ? sum / count : Number.NaN
		}

		for (let m = 0; m < months; m++) {
			const { windU, windV, windSpeed } = WIND.computeWindVectors({
				mesh: world.mesh,
				climate: world.climate,
				elevation_km: world.elevation_km,
				params: world.params,
				month: m,
				surface,
			})
			const {
				windU: obsU,
				windV: obsV,
				windSpeed: obsSpeed,
			} = WIND.observedWindVectorsForMonth({
				observedWind: world.observedWind,
				numRegions: N,
				month: m,
			})

			const seaLevel = world.climate.temperature_monthly_nolapse.subarray(
				m * N,
				(m + 1) * N,
			)
			const oceanOnly = new Float32Array(N)
			for (let r = 0; r < N; r++)
				oceanOnly[r] =
					world.elevation_km[r] > 0 ? Number.NEGATIVE_INFINITY : seaLevel[r]
			const fullTeq = RAIN.computeThermalEquator({
				mesh: world.mesh,
				temps: seaLevel,
				halfWindowBins: 5,
			})
			const oceanTeq = RAIN.computeThermalEquator({
				mesh: world.mesh,
				temps: oceanOnly,
			})
			for (let b = 0; b < TROUGH_BASINS.length; b++) {
				basinTeq[b].full.push(
					basinMean({ teq: fullTeq, range: TROUGH_BASINS[b].lon }),
				)
				basinTeq[b].ocean.push(
					basinMean({ teq: oceanTeq, range: TROUGH_BASINS[b].lon }),
				)
			}

			const monthAcc = newAcc()
			for (let r = 0; r < N; r++) {
				const oSpeed = obsSpeed[r]
				if (!Number.isFinite(oSpeed) || oSpeed <= 1e-9) continue // nodata or calm

				const s: Sample = {
					mu: windU[r],
					mv: windV[r],
					ou: obsU[r],
					ov: obsV[r],
					mSpeed: windSpeed[r],
					oSpeed,
				}
				if (!isLand(r)) {
					if (topography[r] !== CLASSIFICATION.topoOcean) continue
					const lat = latDegAt(r)
					const band = oceanBandAcc.find((b) => lat >= b.lo && lat < b.hi)
					if (band) fold(band.acc, s)
					fold(oceanOverall, s)
					annualModelU[r] += windU[r] * windSpeed[r]
					annualObsU[r] += obsU[r] * oSpeed
					annualModelV[r] += windV[r] * windSpeed[r]
					annualObsV[r] += obsV[r] * oSpeed
					annualModelSpeed[r] += windSpeed[r]
					annualObsSpeed[r] += oSpeed
					annualObsCount[r]++
					const troughBin = Math.floor((lat - TROUGH_MIN_LAT) / TROUGH_BIN_DEG)
					if (troughBin >= 0 && troughBin < TROUGH_BINS)
						for (let b = 0; b < TROUGH_BASINS.length; b++) {
							if (!inLonRange({ lon: lonDeg[r], range: TROUGH_BASINS[b].lon }))
								continue
							const idx = m * TROUGH_BINS + troughBin
							troughSums[b].model[idx] += windV[r] * windSpeed[r]
							troughSums[b].observed[idx] += obsV[r] * oSpeed
							troughSums[b].count[idx]++
						}
					continue
				}
				fold(monthAcc, s)
				fold(overall, s)
				const lat = latDegAt(r)
				const band = bandAcc.find((b) => lat >= b.lo && lat < b.hi)
				if (band) fold(band.acc, s)
			}
			perMonthRows.push({
				month: MONTH_LABELS[m] ?? String(m),
				...summarize(monthAcc),
			})
		}

		console.info(
			"Model vs NCEP/NCAR wind -- LAND ONLY, per calendar month (monthly model wind vs monthly reanalysis)",
		)
		console.table(perMonthRows)

		console.info("All months pooled, land only")
		console.table(summarize(overall))

		console.info("All months pooled, land only, by latitude band")
		console.table(bandAcc.map((b) => ({ band: b.label, ...summarize(b.acc) })))

		console.info("All months pooled, OCEAN only, by latitude band")
		console.table(
			oceanBandAcc.map((b) => ({ band: b.label, ...summarize(b.acc) })),
		)

		console.info("All months pooled, OCEAN only")
		console.table(summarize(oceanOverall))

		// Trough latitude: where the monthly north-south wind turns from
		// southerly to northerly going north, taking the strongest convergence.
		const troughLat = (v: number[]) => {
			let best = -1
			let bestConvergence = 0
			for (let i = 0; i < v.length - 1; i++) {
				if (!(v[i] > 0 && v[i + 1] <= 0)) continue
				if (v[i] - v[i + 1] > bestConvergence) {
					bestConvergence = v[i] - v[i + 1]
					best = i
				}
			}
			if (best < 0) return Number.NaN
			const lat = TROUGH_MIN_LAT + (best + 0.5) * TROUGH_BIN_DEG
			return lat + (TROUGH_BIN_DEG * v[best]) / (v[best] - v[best + 1])
		}
		const troughRows: Record<string, number | string>[] = []
		const troughByBasin = TROUGH_BASINS.map((basin, b) => {
			const model: number[] = []
			const observed: number[] = []
			for (let m = 0; m < months; m++) {
				const profile = (source: "model" | "observed") =>
					Array.from({ length: TROUGH_BINS }, (_, i) => {
						const idx = m * TROUGH_BINS + i
						const count = troughSums[b].count[idx]
						return count > 0 ? troughSums[b][source][idx] / count : 0
					})
				model.push(troughLat(profile("model")))
				observed.push(troughLat(profile("observed")))
			}
			return { basin: basin.label, model, observed }
		})
		for (let m = 0; m < months; m++) {
			const row: Record<string, number | string> = {
				month: MONTH_LABELS[m] ?? String(m),
			}
			for (const basin of troughByBasin)
				row[basin.basin] =
					`${basin.model[m].toFixed(1)} / ${basin.observed[m].toFixed(1)}`
			troughRows.push(row)
		}
		console.info("Ocean surface trough latitude by month (model / observed)")
		console.table(troughRows)
		console.table(
			troughByBasin.map((basin) => {
				const finite = (xs: number[]) => xs.filter(Number.isFinite)
				const stats = (xs: number[]) => ({
					mean: finite(xs).reduce((s, x) => s + x, 0) / finite(xs).length,
					range: Math.max(...finite(xs)) - Math.min(...finite(xs)),
					southMonths: xs.filter((x) => x < 0).length,
				})
				const model = stats(basin.model)
				const observed = stats(basin.observed)
				return {
					basin: basin.basin,
					modelMeanLat: Number(model.mean.toFixed(1)),
					observedMeanLat: Number(observed.mean.toFixed(1)),
					modelRange: Number(model.range.toFixed(1)),
					observedRange: Number(observed.range.toFixed(1)),
					modelMonthsSouth: model.southMonths,
					observedMonthsSouth: observed.southMonths,
				}
			}),
		)

		console.info(
			"Model thermal equator by month (land-inclusive / ocean-only), deg",
		)
		console.table(
			Array.from({ length: months }, (_, m) => ({
				month: MONTH_LABELS[m] ?? String(m),
				...Object.fromEntries(
					TROUGH_BASINS.map((basin, b) => [
						basin.label,
						`${basinTeq[b].full[m].toFixed(1)} / ${basinTeq[b].ocean[m].toFixed(1)}`,
					]),
				),
			})),
		)

		// Annual-mean ocean zonal wind by latitude per basin: where the trades
		// peak, where they give way to westerlies (the subtropical ridge), and
		// where the westerly jet peaks.
		const profileRows: Record<string, number | string>[] = []
		for (const basin of OCEAN_BASINS) {
			const inLon = (lon: number) =>
				basin.lon[0] <= basin.lon[1]
					? lon >= basin.lon[0] && lon <= basin.lon[1]
					: lon >= basin.lon[0] || lon <= basin.lon[1]
			const lats = Array.from({ length: 15 }, (_, i) => basin.side * i * 5)
			const profile = (source: "model" | "observed") =>
				lats.map((lat) => {
					let sum = 0
					let count = 0
					for (let r = 0; r < N; r++) {
						if (annualObsCount[r] === 0 || !inLon(lonDeg[r])) continue
						if (Math.abs(latDegAt(r) - lat) > 2.5) continue
						sum +=
							(source === "model" ? annualModelU[r] : annualObsU[r]) /
							annualObsCount[r]
						count++
					}
					return count > 0 ? sum / count : Number.NaN
				})
			for (const source of ["model", "observed"] as const) {
				const u = profile(source)
				let trade = 0
				for (let i = 0; i < lats.length && Math.abs(lats[i]) <= 30; i++)
					if (u[i] < u[trade]) trade = i
				let ridge = trade
				while (ridge < lats.length - 1 && !(u[ridge] >= 0)) ridge++
				let jet = ridge
				for (let i = ridge; i < lats.length; i++) if (u[i] > u[jet]) jet = i
				profileRows.push({
					basin: basin.label,
					source,
					tradeLat: lats[trade],
					tradeU: Number(u[trade].toFixed(2)),
					ridgeLat: lats[ridge],
					jetLat: lats[jet],
					jetU: Number(u[jet].toFixed(2)),
				})
			}
		}
		console.info("Annual ocean zonal wind structure by basin")
		console.table(profileRows)

		// Steadiness = |annual-mean vector| / annual-mean speed per cell: 1 for
		// a wind that never changes direction, near 0 for one that reverses
		// with the seasons.
		const steadinessBands = Array.from({ length: 12 }, (_, i) => ({
			label: `${-60 + i * 10}..${-50 + i * 10}`,
			lo: -60 + i * 10,
			hi: -50 + i * 10,
		}))
		const steadinessRows = steadinessBands.map((band) => {
			let modelSteadiness = 0
			let observedSteadiness = 0
			let modelVector = 0
			let observedVector = 0
			let angleError = 0
			let n = 0
			for (let r = 0; r < N; r++) {
				const count = annualObsCount[r]
				if (count === 0) continue
				const lat = latDegAt(r)
				if (lat < band.lo || lat >= band.hi) continue
				const mu = annualModelU[r] / count
				const mv = annualModelV[r] / count
				const ou = annualObsU[r] / count
				const ov = annualObsV[r] / count
				const mVec = Math.hypot(mu, mv)
				const oVec = Math.hypot(ou, ov)
				modelSteadiness += mVec / Math.max(1e-9, annualModelSpeed[r] / count)
				observedSteadiness += oVec / Math.max(1e-9, annualObsSpeed[r] / count)
				modelVector += mVec
				observedVector += oVec
				const cos = (mu * ou + mv * ov) / Math.max(1e-9, mVec * oVec)
				angleError +=
					(Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI
				n++
			}
			const d = Math.max(1, n)
			return {
				band: band.label,
				modelSteadiness: Number((modelSteadiness / d).toFixed(2)),
				observedSteadiness: Number((observedSteadiness / d).toFixed(2)),
				annualVectorRatio: Number(
					(modelVector / Math.max(1e-9, observedVector)).toFixed(2),
				),
				annualVectorAngleErrDeg: Number((angleError / d).toFixed(1)),
			}
		})
		console.info("Annual ocean wind steadiness and annual-vector error")
		console.table(steadinessRows)

		expect(overall.n).toBeGreaterThan(0)
		const ocean = Object.fromEntries(
			oceanBandAcc.map((b) => [b.label, summarize(b.acc)]),
		)
		expect(ocean["0-30N (trades)"].speedRatio).toBeGreaterThan(
			MIN_OCEAN_TRADE_SPEED_RATIO,
		)
		expect(ocean["0-30S (trades)"].speedRatio).toBeGreaterThan(
			MIN_OCEAN_TRADE_SPEED_RATIO,
		)
		expect(ocean["30N-60N (westerlies)"].speedRatio).toBeGreaterThan(
			MIN_OCEAN_WESTERLY_SPEED_RATIO,
		)
		expect(ocean["30N-60N (westerlies)"].speedRatio).toBeLessThan(
			MAX_OCEAN_WESTERLY_SPEED_RATIO,
		)
		expect(summarize(overall).meanAbsSpeedErrorMs).toBeLessThanOrEqual(
			MAX_LAND_MEAN_ABS_SPEED_ERROR_MS,
		)
	}, 600_000)
})
