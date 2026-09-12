const reportTable = (value) => console.log("TABLE", JSON.stringify(value))

import { describe, expect, it } from "vitest"
import { OBSERVED_EARTH } from "@/model/climate/observed-earth"
import { RAIN } from "@/model/climate/precipitation/rain"
import { SURFACE_BALANCE } from "@/model/climate/weather/wind/surface-balance"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import { loadEarthGrayscale, loadEarthMonthlyRaster } from "./assets"
import { EXPERIMENT, WIND } from "./wind-diagnostic-runtime"

const LAT_BANDS = [
	{ label: "60N-90N (polar E)", lo: 60, hi: 90 },
	{ label: "30N-60N (westerlies)", lo: 30, hi: 60 },
	{ label: "0-30N (trades)", lo: 0, hi: 30 },
	{ label: "0-30S (trades)", lo: -30, hi: 0 },
	{ label: "30S-60S (westerlies)", lo: -60, hi: -30 },
	{ label: "60S-90S (polar E)", lo: -90, hi: -60 },
]
const OCEAN_BASINS = [
	{ label: "North Atlantic", lon: [-60, -10], side: 1 },
	{ label: "North Pacific", lon: [150, -130], side: 1 },
	{ label: "South Pacific", lon: [-170, -80], side: -1 },
	{ label: "South Indian", lon: [50, 110], side: -1 },
]
const TROUGH_BASINS = [
	{ label: "Atlantic", lon: [-40, -10] },
	{ label: "East Pacific", lon: [-140, -90] },
	{ label: "West Pacific", lon: [140, 180] },
	{ label: "Indian", lon: [50, 90] },
]
const TROUGH_MIN_LAT = -30
const TROUGH_BIN_DEG = 2
const TROUGH_BINS = 30
const MIN_OCEAN_TRADE_SPEED_RATIO = 0.75
const MIN_OCEAN_WESTERLY_SPEED_RATIO = 0.85
const MAX_OCEAN_WESTERLY_SPEED_RATIO = 1.2
const MAX_LAND_MEAN_ABS_SPEED_ERROR_MS = 1.4
describe("model wind vs observed Earth wind (NCEP/NCAR)", () => {
	it("imports the real Earth heightmap and compares modeled vs reanalysis surface wind", () => {
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
		expect.soft(world.observedWind?.real_u_monthly).toBeDefined()
		const originalClimate = world.climate
		const raster = loadEarthMonthlyRaster("earth-real-temperature")
		const observedTemps = OBSERVED_EARTH.sampleMonthlyFloatRaster({
			mesh: world.mesh,
			raster: raster.monthly,
			rasterW: raster.width,
			rasterH: raster.height,
			months: raster.months,
			scale: raster.scale,
			nodata: raster.nodata,
		})
		const regionCount = world.mesh.numRegions
		const monthly = originalClimate.temperature_monthly.slice()
		const nolapse = originalClimate.temperature_monthly_nolapse.slice()
		const annual = new Float32Array(regionCount)
		let valid = 0
		for (let m = 0; m < 12; m++)
			for (let r = 0; r < regionCount; r++) {
				const idx = m * regionCount + r
				if (Number.isFinite(observedTemps[idx])) {
					valid++
					monthly[idx] = observedTemps[idx]
					nolapse[idx] =
						observedTemps[idx] +
						originalClimate.temperature_monthly_nolapse[idx] -
						originalClimate.temperature_monthly[idx]
				}
				annual[r] += monthly[idx] / 12
			}
		console.log("COVERAGE", valid, monthly.length)
		world.climate = {
			...originalClimate,
			temperature_monthly: monthly,
			temperature_monthly_nolapse: nolapse,
			temperature_avg: annual,
		}
		const defaults = {
			westTropical: 1,
			westSubtropical: 1,
			heat: 1,
			thermal: 1,
			plateau: 1,
			west: 1,
			east: 1,
			floor: 1,
			dynamics: true,
			lag: true,
			torque: true,
			freeze: false,
		}
		const experiments = JSON.parse(process.env.WIND_ABLATIONS ?? "null") ?? [
			{ name: "baseline" },
			{ name: "no-heat-fixed", heat: 0, freeze: true },
			{ name: "no-thermal-fixed", thermal: 0, freeze: true },
			{ name: "no-dynamics-fixed", dynamics: false, freeze: true },
			{ name: "no-west", west: 0, freeze: true },
			{ name: "no-east", east: 0, freeze: true },
			{ name: "no-plateau-fixed", plateau: 0, freeze: true },
			{ name: "no-floor-fixed", floor: 0, freeze: true },
			{ name: "no-torque", torque: false },
			{ name: "no-extra-lag-fixed", lag: false, freeze: true },
		]
		for (const experiment of experiments) {
			Object.assign(EXPERIMENT, defaults, experiment)
			console.log("EXPERIMENT", experiment.name)
			const regionalRows = []
			const stageRows = []
			const r_xyz = world.mesh.r_xyz
			function latDegAt(r) {
				const z = r_xyz[r * 3 + 2]
				return (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI
			}
			const topography = world.topography
			function isLand(r) {
				const t = topography[r]
				return t !== CLASSIFICATION.topoOcean && t !== CLASSIFICATION.topoLake
			}
			const newAcc = () => ({
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
			function fold(acc, s) {
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
				const cos = s.mu * s.ou + s.mv * s.ov
				acc.sumCos += cos
				acc.sumAngleErr +=
					(Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI
				if (cos > 0) acc.nParity++
				if (Math.sign(s.mu) === Math.sign(s.ou)) acc.nZonalSign++
				if (Math.sign(s.mv) === Math.sign(s.ov)) acc.nMeridSign++
			}
			function summarize(acc) {
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
			const perMonthRows = []
			const { lonDeg } = RAIN.getClimateGeometry(world.mesh)
			const inLonRange = ({ lon, range }) =>
				range[0] <= range[1]
					? lon >= range[0] && lon <= range[1]
					: lon >= range[0] || lon <= range[1]
			const troughSums = TROUGH_BASINS.map(() => ({
				model: new Float64Array(months * TROUGH_BINS),
				observed: new Float64Array(months * TROUGH_BINS),
				count: new Int32Array(months * TROUGH_BINS),
			}))
			const basinTeq = TROUGH_BASINS.map(() => ({
				full: [],
				ocean: [],
			}))
			const basinMean = ({ teq, range }) => {
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
				const {
					windU,
					windV,
					windSpeed,
					pressure: diagnosticPressure,
				} = WIND.computeWindVectors({
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
				EXPERIMENT.lastPressure = diagnosticPressure
				const trace = EXPERIMENT.trace
				const diagGeometry = RAIN.getClimateGeometry(world.mesh)
				const boxes = [
					{ name: "Atlantic tropics", lo: -30, hi: 30, west: -40, east: -10 },
					{
						name: "East Pacific tropics",
						lo: -30,
						hi: 30,
						west: -140,
						east: -90,
					},
					{ name: "NH polar ocean", lo: 60, hi: 90, west: -180, east: 180 },
					{
						name: "SH midlatitude ocean",
						lo: -60,
						hi: -30,
						west: -180,
						east: 180,
					},
				]
				for (const box of boxes) {
					let n = 0,
						err = 0,
						modelSpeed = 0,
						observedSpeed = 0,
						cos = 0
					for (let r = 0; r < N; r++) {
						const lat = diagGeometry.latDeg[r],
							lon = diagGeometry.lonDeg[r]
						if (
							topography[r] !== CLASSIFICATION.topoOcean ||
							lat < box.lo ||
							lat >= box.hi ||
							lon < box.west ||
							lon > box.east ||
							!(obsSpeed[r] > 1e-9)
						)
							continue
						n++
						err += Math.hypot(
							windU[r] * windSpeed[r] - obsU[r] * obsSpeed[r],
							windV[r] * windSpeed[r] - obsV[r] * obsSpeed[r],
						)
						modelSpeed += windSpeed[r]
						observedSpeed += obsSpeed[r]
						cos += windU[r] * obsU[r] + windV[r] * obsV[r]
					}
					regionalRows.push({
						month: m,
						box: box.name,
						n,
						error: err / Math.max(1, n),
						speedRatio: modelSpeed / Math.max(1e-9, observedSpeed),
						cos: cos / Math.max(1, n),
					})
				}
				if (
					experiment.name === "baseline" ||
					experiment.name === "no-dynamics-fixed" ||
					experiment.name === "no-west-tropical"
				) {
					const before = new Float32Array(N)
					for (let r = 0; r < N; r++)
						before[r] =
							trace.rest[r] +
							trace.hadleyScale.north * trace.northHadley[r] +
							trace.hadleyScale.south * trace.southHadley[r]
					const beforeGrad = SURFACE_BALANCE.meshGradient({
						mesh: world.mesh,
						field: before,
					})
					const afterGrad = SURFACE_BALANCE.meshGradient({
						mesh: world.mesh,
						field: EXPERIMENT.lastPressure,
					})
					const bins = Array.from({ length: 30 }, () => ({
						n: 0,
						beforeP: 0,
						afterP: 0,
						beforeZonalV: 0,
						beforeMeridionalV: 0,
						afterZonalV: 0,
						afterMeridionalV: 0,
						beforeV: 0,
						afterV: 0,
						finalV: 0,
						observedV: 0,
					}))
					for (let r = 0; r < N; r++) {
						const lat = diagGeometry.latDeg[r],
							lon = diagGeometry.lonDeg[r]
						if (
							topography[r] !== CLASSIFICATION.topoOcean ||
							lat < -30 ||
							lat >= 30 ||
							lon < -40 ||
							lon > -10
						)
							continue
						const bin = bins[Math.floor((lat + 30) / 2)]
						bin.n++
						bin.beforeP += before[r]
						bin.afterP += EXPERIMENT.lastPressure[r]
						const beforeWind = SURFACE_BALANCE.balance({
							friction: 0.3,
							coriolis: trace.coriolis[r],
							forceEast: -beforeGrad.east[r],
							forceNorth: -beforeGrad.north[r],
						})
						const afterWind = SURFACE_BALANCE.balance({
							friction: 0.3,
							coriolis: trace.coriolis[r],
							forceEast: -afterGrad.east[r],
							forceNorth: -afterGrad.north[r],
						})
						const denom =
							(0.3 * 0.3 + trace.coriolis[r] * trace.coriolis[r]) *
							trace.rawPerMs
						bin.beforeZonalV += (trace.coriolis[r] * beforeGrad.east[r]) / denom
						bin.beforeMeridionalV += (-0.3 * beforeGrad.north[r]) / denom
						bin.afterZonalV += (trace.coriolis[r] * afterGrad.east[r]) / denom
						bin.afterMeridionalV += (-0.3 * afterGrad.north[r]) / denom
						bin.beforeV += beforeWind.v / trace.rawPerMs
						bin.afterV += afterWind.v / trace.rawPerMs
						bin.finalV += windV[r] * windSpeed[r]
						bin.observedV += obsV[r] * obsSpeed[r]
					}
					let teq = 0,
						teqCount = 0
					for (let i = 0; i < trace.teqByLon.length; i++) {
						const lon = -180 + ((i + 0.5) * 360) / trace.teqByLon.length
						if (lon >= -40 && lon <= -10) {
							teq += trace.teqByLon[i]
							teqCount++
						}
					}
					stageRows.push({
						month: m,
						actualTeq: teq / teqCount,
						troughByLon: Array.from(trace.teqByLon)
							.map((lat, i) => ({
								lat,
								lon: -180 + ((i + 0.5) * 360) / trace.teqByLon.length,
							}))
							.filter((row) => row.lon >= -40 && row.lon <= -10),
						scales: trace.hadleyScale,
						bins: bins.map((bin, i) =>
							Object.fromEntries([
								["lat", -29 + 2 * i],
								...Object.entries(bin).map(([key, value]) => [
									key,
									key === "n" ? value : bin.n ? value / bin.n : null,
								]),
							]),
						),
					})
				}
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
					if (!Number.isFinite(oSpeed) || oSpeed <= 1e-9) continue
					const s = {
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
						const troughBin = Math.floor(
							(lat - TROUGH_MIN_LAT) / TROUGH_BIN_DEG,
						)
						if (troughBin >= 0 && troughBin < TROUGH_BINS)
							for (let b = 0; b < TROUGH_BASINS.length; b++) {
								if (
									!inLonRange({ lon: lonDeg[r], range: TROUGH_BASINS[b].lon })
								)
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
			reportTable(perMonthRows)
			console.info("All months pooled, land only")
			reportTable(summarize(overall))
			console.info("All months pooled, land only, by latitude band")
			reportTable(bandAcc.map((b) => ({ band: b.label, ...summarize(b.acc) })))
			console.info("All months pooled, OCEAN only, by latitude band")
			reportTable(
				oceanBandAcc.map((b) => ({ band: b.label, ...summarize(b.acc) })),
			)
			console.info("All months pooled, OCEAN only")
			reportTable(summarize(oceanOverall))
			const troughLat = (v) => {
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
			const troughRows = []
			const troughByBasin = TROUGH_BASINS.map((basin, b) => {
				const model = []
				const observed = []
				for (let m = 0; m < months; m++) {
					const profile = (source) =>
						Array.from({ length: TROUGH_BINS }, (_, i) => {
							const idx = m * TROUGH_BINS + i
							const count = troughSums[b].count[idx]
							return count > 0 ? troughSums[b][source][idx] / count : Number.NaN
						})
					model.push(troughLat(profile("model")))
					observed.push(troughLat(profile("observed")))
				}
				return { basin: basin.label, model, observed }
			})
			for (let m = 0; m < months; m++) {
				const row = {
					month: MONTH_LABELS[m] ?? String(m),
				}
				for (const basin of troughByBasin)
					row[basin.basin] =
						`${basin.model[m].toFixed(1)} / ${basin.observed[m].toFixed(1)}`
				troughRows.push(row)
			}
			console.info("Ocean surface trough latitude by month (model / observed)")
			reportTable(troughRows)
			reportTable(
				troughByBasin.map((basin) => {
					const finite = (xs) => xs.filter(Number.isFinite)
					const stats = (xs) => ({
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
			reportTable(
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
			const profileRows = []
			for (const basin of OCEAN_BASINS) {
				const inLon = (lon) =>
					basin.lon[0] <= basin.lon[1]
						? lon >= basin.lon[0] && lon <= basin.lon[1]
						: lon >= basin.lon[0] || lon <= basin.lon[1]
				const lats = Array.from({ length: 15 }, (_, i) => basin.side * i * 5)
				const profile = (source) =>
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
				for (const source of ["model", "observed"]) {
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
			reportTable(profileRows)
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
			reportTable(steadinessRows)
			expect.soft(overall.n).toBeGreaterThan(0)
			const ocean = Object.fromEntries(
				oceanBandAcc.map((b) => [b.label, summarize(b.acc)]),
			)
			expect
				.soft(ocean["0-30N (trades)"].speedRatio)
				.toBeGreaterThan(MIN_OCEAN_TRADE_SPEED_RATIO)
			expect
				.soft(ocean["0-30S (trades)"].speedRatio)
				.toBeGreaterThan(MIN_OCEAN_TRADE_SPEED_RATIO)
			expect
				.soft(ocean["30N-60N (westerlies)"].speedRatio)
				.toBeGreaterThan(MIN_OCEAN_WESTERLY_SPEED_RATIO)
			expect
				.soft(ocean["30N-60N (westerlies)"].speedRatio)
				.toBeLessThan(MAX_OCEAN_WESTERLY_SPEED_RATIO)
			expect
				.soft(summarize(overall).meanAbsSpeedErrorMs)
				.toBeLessThanOrEqual(MAX_LAND_MEAN_ABS_SPEED_ERROR_MS)
			console.log("REGIONAL", JSON.stringify(regionalRows))
			console.log("STAGES", JSON.stringify(stageRows))
		}
		world.climate = originalClimate
	}, 600_000)
})
