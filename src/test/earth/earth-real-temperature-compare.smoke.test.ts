import fs from "node:fs"
import { gunzipSync } from "node:zlib"
import { describe, expect, it } from "vitest"
import { STAR } from "@/model/celestial/star"
import { CONSTANTS } from "@/model/climate/temperature/ebm/constants"
import { EnergyBalanceModel } from "@/model/climate/temperature/ebm/energy-balance-model"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { UNITS } from "@/model/shared/units"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import {
	loadEarthElevationRaster,
	loadEarthGrayscale,
	loadEarthMonthlyRaster,
	loadEarthRiverLines,
} from "./assets"
import type { VplanetReference } from "./vplanet/types"

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

const SAHARA_BOUNDS = {
	minLat: 15,
	maxLat: 33,
	minLon: -17,
	maxLon: 35,
}

const SIBERIA_BOUNDS = {
	minLat: 50,
	maxLat: 70,
	minLon: 60,
	maxLon: 140,
}

describe("EBM temperature vs observed Earth climate (land only)", () => {
	it("imports the real Earth heightmap and compares modeled vs WorldClim land temperatures", () => {
		const earth = loadEarthGrayscale("earth.png")
		const coastline = loadEarthGrayscale("coastline-mask.png")
		const lake = loadEarthGrayscale("lake-mask.png")
		const riverLines = loadEarthRiverLines()
		const realClimate = loadEarthMonthlyRaster("earth-real-temperature")
		const realPrecip = loadEarthMonthlyRaster("earth-real-precipitation")
		const realElevation = loadEarthElevationRaster()
		const realWindU = loadEarthMonthlyRaster("earth-real-wind-u")
		const realWindV = loadEarthMonthlyRaster("earth-real-wind-v")
		const realCloudCover = loadEarthMonthlyRaster("earth-real-cloud-cover")
		const vplanet: VplanetReference = JSON.parse(
			gunzipSync(
				fs.readFileSync(
					"src/test/earth/fixtures/vplanet-earth-climate.json.gz",
				),
			).toString(),
		)
		expect(vplanet.revision).toBe("dd55da7e1ff063f0ea7048f91c9d2d97d6ba9a5d")
		expect(vplanet.latitudeDegrees).toHaveLength(150)
		expect(vplanet.temperature).toHaveLength(60)

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
				realWindUMonthly: realWindU.monthly,
				realWindVMonthly: realWindV.monthly,
				realWindWidth: realWindU.width,
				realWindHeight: realWindU.height,
				realWindMonths: realWindU.months,
				realWindScale: realWindU.scale,
				realWindNoData: realWindU.nodata,
				realCloudCoverMonthly: realCloudCover.monthly,
				realCloudCoverWidth: realCloudCover.width,
				realCloudCoverHeight: realCloudCover.height,
				realCloudCoverMonths: realCloudCover.months,
				realCloudCoverScale: realCloudCover.scale,
				realCloudCoverNoData: realCloudCover.nodata,
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

		const { climate, isLand, mesh, elevation_km, oceanDist } = world
		expect(climate.real_temperature_avg).toBeDefined()
		expect(climate.temperature_diff_avg).toBeDefined()

		const realAvg = climate.real_temperature_avg!
		const diffAvg = climate.temperature_diff_avg!
		const noLapseMonthly = climate.temperature_monthly_nolapse
		const r_xyz = mesh.r_xyz
		function latDegAt(r: number): number {
			const z = r_xyz[r * 3 + 2]
			return (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI
		}

		// GBM training data dump: per-cell-month rows of (modeled temp,
		// elevation, dist-from-coast, landmass extent, lat) -> (modeled -
		// observed) diff, for a bias-correction GBM fit offline in
		// scripts/gbm-temp-bias-correction.
		if (process.env.DUMP_GBM_CSV) {
			// RAW EBM signal for temp_c: re-run the same 1D zonal model
			// computeTemperature() uses (climate/classification/climate/index.ts),
			// but stop right after the model solves -- no per-cell latitude
			// interpolation adjustment beyond the band itself, no elevation
			// lapse correction, no continentality inertia scaling, no ocean SST
			// noise. This is the model's actual physics output before any of
			// the per-cell post-processing that climate.temperature_monthly
			// already has baked in.
			const p = world.params
			const clsRaw = STAR.isValidSpectralClass(p.spectralClass)
				? p.spectralClass
				: "G"
			const T_star = STAR.getStarTemperatureK({
				cls: clsRaw,
				subtype: p.starSubtype,
			})
			const R_star_m =
				STAR.getStarDiameterSol({ cls: clsRaw, subtype: p.starSubtype }) *
				CONSTANTS.embConstants.stellar.R_SUN
			const d_m = p.orbitalDistanceAU * CONSTANTS.embConstants.stellar.AU
			const rawEbm = new EnergyBalanceModel({
				orbital: {
					OBLIQUITY: UNITS.getEffectiveObliquityDeg(p.obliquity),
					ECCENTRICITY: p.eccentricity,
					PERIHELION: p.perihelion,
				},
				stellar: {
					...CONSTANTS.embConstants.stellar,
					T_SUN: T_star,
					R_SUN: R_star_m,
					AU: d_m,
				},
				time: {
					YEAR_LENGTH_DAYS: p.daysPerYear,
					HOURS_PER_DAY: p.hoursPerDay,
				},
				pressure: p.pressure ?? 1.0,
				radius: p.planetRadiusKm * 1000,
				albedo: p.albedo,
				greenhouseFactor: p.greenhouseFactor,
				seismologyTotalHeatingK: p.seismologyTotalHeatingK,
			})
			rawEbm.runModel({ years: 30, dtDays: 0.5 })

			const NUM_LAT = CONSTANTS.embConstants.grid.NUM_LAT
			const MONTH_DAY_COUNTS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
			const rawMonthlyByBand: number[][] = new Array(12)
			let dayStart = 0
			for (let month = 0; month < 12; month++) {
				const start = dayStart
				const end = start + MONTH_DAY_COUNTS[month]
				dayStart = end
				rawMonthlyByBand[month] = rawEbm.temperature.map((row) => {
					let sum = 0
					for (let d = start; d < end; d++) sum += row[d]
					return sum / (end - start)
				})
			}
			function interpolateLatBandRaw(range: number[], latDeg: number): number {
				const pos = Math.max(
					0,
					Math.min(NUM_LAT - 1, ((latDeg + 90) * (NUM_LAT - 1)) / 180),
				)
				const i0 = Math.min(NUM_LAT - 2, pos | 0)
				const t = pos - i0
				return range[i0] + t * (range[i0 + 1] - range[i0])
			}
			const rawTempMonthly = new Float32Array(mesh.numRegions * 12)
			for (let month = 0; month < 12; month++) {
				for (let r = 0; r < mesh.numRegions; r++) {
					if (!isLand[r]) continue
					rawTempMonthly[month * mesh.numRegions + r] = interpolateLatBandRaw(
						rawMonthlyByBand[month],
						latDegAt(r),
					)
				}
			}

			// Continentality proxy: distCoast is the distance to the NEAREST
			// ocean point in any direction, so it can't tell a narrow peninsula
			// (small dist, correctly maritime) apart from a cell that happens to
			// sit near an enclosed/frozen sea deep inside a huge landmass (small
			// dist, but actually continental). Landmass extent -- the effective
			// radius of the whole connected land blob a cell belongs to --
			// captures that: same flood-fill approach as the coast-distance BFS
			// above, just labeling connected components over isLand instead of
			// measuring distance.
			const { adjOffset, adjList } = mesh
			const landmassId = new Int32Array(mesh.numRegions).fill(-1)
			const landmassCellCount: number[] = []
			for (let start = 0; start < mesh.numRegions; start++) {
				if (!isLand[start] || landmassId[start] !== -1) continue
				const id = landmassCellCount.length
				let count = 0
				const stack = [start]
				landmassId[start] = id
				while (stack.length > 0) {
					const r = stack.pop() as number
					count++
					for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
						const nb = adjList[j]
						if (isLand[nb] && landmassId[nb] === -1) {
							landmassId[nb] = id
							stack.push(nb)
						}
					}
				}
				landmassCellCount.push(count)
			}
			const sphereAreaKm2 =
				4 * Math.PI * DEFAULT_WORLD_PARAMS.planetRadiusKm ** 2
			const avgCellAreaKm2 = sphereAreaKm2 / mesh.numRegions
			const landmassExtentKm = landmassCellCount.map((count) =>
				Math.sqrt((count * avgCellAreaKm2) / Math.PI),
			)

			// Orographic barrier proxy: does this cell sit near mountains that
			// intercept moisture (like India near the Himalayas), or is it in
			// open flat terrain with nothing to force air to rise and rain out
			// -- like the Arabian Peninsula, which stays under persistent dry
			// subsidence with no comparable barrier. Regional max elevation via
			// iterative graph dilation (each pass replaces every cell's value
			// with the max over itself and its neighbors) approximates "highest
			// terrain within roughly N hops" far cheaper than a per-cell BFS.
			const DILATION_PASSES = 20
			let nearbyMaxElevKm = Float32Array.from(elevation_km ?? [])
			for (let pass = 0; pass < DILATION_PASSES; pass++) {
				const next = new Float32Array(nearbyMaxElevKm)
				for (let r = 0; r < mesh.numRegions; r++) {
					let m = nearbyMaxElevKm[r]
					for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
						const v = nearbyMaxElevKm[adjList[j]]
						if (v > m) m = v
					}
					next[r] = m
				}
				nearbyMaxElevKm = next
			}

			// Local terrain roughness: stddev of elevation among a cell's
			// immediate mesh neighbors -- valley cold-pooling / exposed-ridge
			// microclimate effects that raw elevation_km alone can't
			// distinguish from smooth terrain at the same height.
			const terrainRoughnessKm = new Float32Array(mesh.numRegions)
			for (let r = 0; r < mesh.numRegions; r++) {
				if (!isLand[r]) continue
				let sum = 0
				let sumSq = 0
				let count = 0
				for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
					const v = elevation_km ? elevation_km[adjList[j]] : 0
					sum += v
					sumSq += v * v
					count++
				}
				if (count > 0) {
					const mean = sum / count
					terrainRoughnessKm[r] = Math.sqrt(
						Math.max(0, sumSq / count - mean * mean),
					)
				}
			}

			// Observed wind (u/v components, real Earth reanalysis data --
			// see attachObservedEarthWind in climate/observed-earth). Unlike
			// everything else in this file, this is NOT derivable from
			// topology alone -- it's the actual atmospheric circulation
			// signature (subsidence, monsoon flow) that the zonal EBM has no
			// way to represent, targeting the Arabian-Peninsula-style errors
			// no geometric feature (local, regional, or whole-band) touched.
			const observedU = world.observedWind?.real_u_monthly
			const observedV = world.observedWind?.real_v_monthly

			// Observed cloud cover: the more direct mechanism than wind for
			// the Arabian-Peninsula-style cluster -- persistent clear skies
			// under a subsidence zone mean intense direct solar heating
			// almost independent of surface wind speed/direction.
			const observedCloud = world.observedCloudCover?.real_monthly

			// Which SIDE of the continent a cell sits on: mid-latitude
			// westerlies mean west coasts get onshore (maritime) flow while
			// east coasts at the same latitude get offshore (continental) flow
			// from the interior -- a real asymmetry (W Europe vs E Siberia)
			// that an omnidirectional distCoast can't distinguish. March along
			// the coastline raster row (same lon<->pixel convention as
			// SAMPLING.sampleCoastlineMask) due west and due east from each
			// cell's pixel until hitting ocean; convert pixel-steps to km via
			// the latitude-scaled circumference at that row.
			function coastDistDirectional(
				lat: number,
				lon: number,
			): { west: number; east: number } {
				const latRad = (lat * Math.PI) / 180
				const lonRad = (lon * Math.PI) / 180
				const px =
					((((lonRad / Math.PI + 1) * 0.5 * coastline.width) %
						coastline.width) +
						coastline.width) %
					coastline.width
				const py = Math.max(
					0,
					Math.min(
						coastline.height - 1,
						(0.5 - latRad / Math.PI) * coastline.height,
					),
				)
				const xi = Math.min(coastline.width - 1, Math.round(px))
				const yi = Math.min(coastline.height - 1, Math.round(py))
				const row = yi * coastline.width
				const maxSteps = coastline.width
				let west = maxSteps
				for (let step = 0; step < maxSteps; step++) {
					const x =
						(((xi - step) % coastline.width) + coastline.width) %
						coastline.width
					if (coastline.grayscale[row + x] < 128) {
						west = step
						break
					}
				}
				let east = maxSteps
				for (let step = 0; step < maxSteps; step++) {
					const x = (xi + step) % coastline.width
					if (coastline.grayscale[row + x] < 128) {
						east = step
						break
					}
				}
				const kmPerPixel =
					(2 *
						Math.PI *
						DEFAULT_WORLD_PARAMS.planetRadiusKm *
						Math.cos(latRad)) /
					coastline.width
				return { west: west * kmPerPixel, east: east * kmPerPixel }
			}

			// Per-cell, not per-cell-month -- lat/lon don't depend on month, and
			// the ray march is the expensive part here.
			const cellLat = new Float32Array(mesh.numRegions)
			const cellLon = new Float32Array(mesh.numRegions)
			const cellWest = new Float32Array(mesh.numRegions)
			const cellEast = new Float32Array(mesh.numRegions)
			for (let r = 0; r < mesh.numRegions; r++) {
				if (!isLand[r]) continue
				const lat = latDegAt(r)
				const lon = (Math.atan2(r_xyz[r * 3 + 1], r_xyz[r * 3]) * 180) / Math.PI
				cellLat[r] = lat
				cellLon[r] = lon
				const { west, east } = coastDistDirectional(lat, lon)
				cellWest[r] = west
				cellEast[r] = east
			}

			// Continentality signature straight from the EBM's own output, no
			// raster/mesh geometry needed: a large annual swing and many
			// months below freezing is exactly what marks a place like Siberia
			// as continental, independent of whether nearby water literally
			// freezes over. temperature_min/max are already per-cell annual
			// stats the EBM produces; monthsBelowZero is a straight count over
			// its own monthly output.
			//
			// [TRIED] Using the no-lapse series here and for temp_c below, on
			// the theory that the lapse-corrected value "double counts"
			// elevation_km as a separate feature -- measured WORSE on both
			// linreg (R2 0.469->0.423) and GBM (R2 0.897->0.862). diff_c is
			// defined against the lapse-corrected temperature_monthly, so
			// that value is a strictly more direct predictor of it; stripping
			// the lapse correction just makes the model reconstruct the same
			// relationship indirectly and less efficiently. Reverted.
			const annualRangeC = new Float32Array(mesh.numRegions)
			const monthsBelowZero = new Int32Array(mesh.numRegions)
			for (let r = 0; r < mesh.numRegions; r++) {
				if (!isLand[r]) continue
				annualRangeC[r] =
					climate.temperature_max[r] - climate.temperature_min[r]
				let count = 0
				for (let month = 0; month < 12; month++) {
					if (climate.temperature_monthly[month * mesh.numRegions + r] < 0)
						count++
				}
				monthsBelowZero[r] = count
			}

			const monthly = climate.temperature_monthly
			const realMonthly = climate.real_temperature_monthly!
			const rows: string[] = [
				"temp_c,elevation_km,dist_coast_km,landmass_extent_km,dist_coast_west_km,dist_coast_east_km,annual_range_c,months_below_zero,nearby_max_elev_km,terrain_roughness_km,wind_u,wind_v,cloud_cover,lat,lon,month,modeled_c,observed_c,diff_c",
			]
			for (let month = 0; month < 12; month++) {
				for (let r = 0; r < mesh.numRegions; r++) {
					if (!isLand[r]) continue
					const obs = realMonthly[month * mesh.numRegions + r]
					if (!Number.isFinite(obs)) continue
					const modeled = monthly[month * mesh.numRegions + r]
					const raw = rawTempMonthly[month * mesh.numRegions + r]
					const diff = modeled - obs
					const elevKm = elevation_km ? elevation_km[r] : 0
					const coastKm = oceanDist ? oceanDist[r] : 0
					const extentKm = landmassExtentKm[landmassId[r]]
					const windU = observedU ? observedU[month * mesh.numRegions + r] : 0
					const windV = observedV ? observedV[month * mesh.numRegions + r] : 0
					const cloud = observedCloud
						? observedCloud[month * mesh.numRegions + r]
						: 0
					rows.push(
						`${raw.toFixed(3)},${elevKm.toFixed(3)},${coastKm.toFixed(3)},${extentKm.toFixed(3)},${cellWest[r].toFixed(3)},${cellEast[r].toFixed(3)},${annualRangeC[r].toFixed(3)},${monthsBelowZero[r]},${nearbyMaxElevKm[r].toFixed(3)},${terrainRoughnessKm[r].toFixed(3)},${windU.toFixed(3)},${windV.toFixed(3)},${cloud.toFixed(3)},${cellLat[r].toFixed(3)},${cellLon[r].toFixed(3)},${month},${modeled.toFixed(3)},${obs.toFixed(3)},${diff.toFixed(3)}`,
					)
				}
			}
			fs.writeFileSync(process.env.DUMP_GBM_CSV as string, rows.join("\n"))
			console.info(
				`Wrote ${rows.length - 1} rows to ${process.env.DUMP_GBM_CSV}`,
			)
		}

		let n = 0
		let sumDiff = 0
		let sumAbsDiff = 0
		let sumSq = 0
		let tooWarm = 0 // model > observed by > 2C
		let tooCold = 0 // model < observed by > 2C
		let justRight = 0 // within +-2C

		const bandStats = LAT_BANDS.map((b) => ({
			...b,
			n: 0,
			sumDiff: 0,
			tooWarm: 0,
			tooCold: 0,
			justRight: 0,
		}))
		const hemisphereStats = HEMISPHERE_BANDS.map((b) => ({
			...b,
			n: 0,
			sumDiff: 0,
		}))
		const elevationStats = ELEVATION_BINS.map((b) => ({
			...b,
			n: 0,
			sumDiff: 0,
		}))
		let saharaCells = 0
		let saharaModeledSum = 0
		let saharaNoLapseSum = 0
		let saharaObservedSum = 0
		let saharaElevationSum = 0
		let siberiaCells = 0
		let siberiaModeledSum = 0
		let siberiaObservedSum = 0

		for (let r = 0; r < mesh.numRegions; r++) {
			if (!isLand[r]) continue
			const observed = realAvg[r]
			if (!Number.isFinite(observed)) continue // nodata (e.g. Antarctica interior)
			const diff = diffAvg[r]
			n++
			sumDiff += diff
			sumAbsDiff += Math.abs(diff)
			sumSq += diff * diff
			if (diff > 2) tooWarm++
			else if (diff < -2) tooCold++
			else justRight++

			const lat = latDegAt(r)
			const lon = (Math.atan2(r_xyz[r * 3 + 1], r_xyz[r * 3]) * 180) / Math.PI
			if (
				lat >= SAHARA_BOUNDS.minLat &&
				lat < SAHARA_BOUNDS.maxLat &&
				lon >= SAHARA_BOUNDS.minLon &&
				lon < SAHARA_BOUNDS.maxLon
			) {
				let noLapseAnnual = 0
				for (let month = 0; month < 12; month++)
					noLapseAnnual += noLapseMonthly[month * mesh.numRegions + r]
				saharaCells++
				saharaModeledSum += climate.temperature_avg[r]
				saharaNoLapseSum += noLapseAnnual / 12
				saharaObservedSum += observed
				saharaElevationSum += elevation_km[r]
			}
			if (
				lat >= SIBERIA_BOUNDS.minLat &&
				lat < SIBERIA_BOUNDS.maxLat &&
				lon >= SIBERIA_BOUNDS.minLon &&
				lon < SIBERIA_BOUNDS.maxLon
			) {
				siberiaCells++
				siberiaModeledSum += climate.temperature_avg[r]
				siberiaObservedSum += observed
			}
			const band = bandStats.find((b) => lat >= b.lo && lat < b.hi)
			if (band) {
				band.n++
				band.sumDiff += diff
				if (diff > 2) band.tooWarm++
				else if (diff < -2) band.tooCold++
				else band.justRight++
			}

			const hemisphere = hemisphereStats.find((b) => lat >= b.lo && lat < b.hi)
			if (hemisphere) {
				hemisphere.n++
				hemisphere.sumDiff += diff
			}

			const elevKm = elevation_km ? elevation_km[r] : NaN
			const elevBin = elevationStats.find(
				(b) => elevKm >= b.lo && elevKm < b.hi,
			)
			if (elevBin) {
				elevBin.n++
				elevBin.sumDiff += diff
			}
		}

		const meanBiasC = sumDiff / Math.max(1, n)
		const meanAbsErrorC = sumAbsDiff / Math.max(1, n)
		const rmseC = Math.sqrt(sumSq / Math.max(1, n))
		const realMonthly = climate.real_temperature_monthly!
		let monthlyAbsError = 0
		let monthlyCount = 0
		let vplanetAnnualAbsError = 0
		let vplanetMonthlyAbsError = 0
		let vplanetCount = 0
		const vplanetAnnualByLatitude = vplanet.latitudeDegrees.map(
			(_, latitudeIndex) =>
				vplanet.temperature.reduce(
					(sum, temperatures) => sum + temperatures[latitudeIndex],
					0,
				) / vplanet.temperature.length,
		)
		const vplanetMonthlyByLatitude = Array.from(
			{ length: 12 },
			() => new Float64Array(vplanet.latitudeDegrees.length),
		)
		let calendarDay = 0
		const monthDayCounts = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
		for (let month = 0; month < monthDayCounts.length; month++) {
			for (let day = 0; day < monthDayCounts[month]; day++) {
				const daysSinceSolstice = (calendarDay + day + 0.5 - 354 + 365) % 365
				const samplePosition =
					(daysSinceSolstice * vplanet.temperature.length) / 365 - 1
				const lowerPosition = Math.floor(samplePosition)
				const fraction = samplePosition - lowerPosition
				const lowerSample =
					(lowerPosition + vplanet.temperature.length) %
					vplanet.temperature.length
				const upperSample = (lowerSample + 1) % vplanet.temperature.length
				for (
					let latitudeIndex = 0;
					latitudeIndex < vplanet.latitudeDegrees.length;
					latitudeIndex++
				) {
					const lower = vplanet.temperature[lowerSample][latitudeIndex]
					const upper = vplanet.temperature[upperSample][latitudeIndex]
					vplanetMonthlyByLatitude[month][latitudeIndex] +=
						(lower + (upper - lower) * fraction) / monthDayCounts[month]
				}
			}
			calendarDay += monthDayCounts[month]
		}
		let siberiaMonthlyDiffSum = 0
		let siberiaMonthlyCount = 0
		const siberiaMonthlyModeledSum = new Float64Array(12)
		const siberiaMonthlyObservedSum = new Float64Array(12)
		const siberiaMonthlyCounts = new Uint32Array(12)
		for (let r = 0; r < mesh.numRegions; r++) {
			if (!isLand[r]) continue
			const lat = latDegAt(r)
			let upperLatitudeIndex = vplanet.latitudeDegrees.findIndex(
				(latitude) => latitude >= lat,
			)
			if (upperLatitudeIndex < 1) upperLatitudeIndex = 1
			if (upperLatitudeIndex >= vplanet.latitudeDegrees.length)
				upperLatitudeIndex = vplanet.latitudeDegrees.length - 1
			const lowerLatitudeIndex = upperLatitudeIndex - 1
			const latitudeFraction =
				(lat - vplanet.latitudeDegrees[lowerLatitudeIndex]) /
				(vplanet.latitudeDegrees[upperLatitudeIndex] -
					vplanet.latitudeDegrees[lowerLatitudeIndex])
			const vplanetAnnual =
				vplanetAnnualByLatitude[lowerLatitudeIndex] +
				(vplanetAnnualByLatitude[upperLatitudeIndex] -
					vplanetAnnualByLatitude[lowerLatitudeIndex]) *
					latitudeFraction
			if (Number.isFinite(realAvg[r]))
				vplanetAnnualAbsError += Math.abs(vplanetAnnual - realAvg[r])
			const lon = (Math.atan2(r_xyz[r * 3 + 1], r_xyz[r * 3]) * 180) / Math.PI
			for (let month = 0; month < 12; month++) {
				const index = month * mesh.numRegions + r
				if (!Number.isFinite(realMonthly[index])) continue
				const vplanetMonthly =
					vplanetMonthlyByLatitude[month][lowerLatitudeIndex] +
					(vplanetMonthlyByLatitude[month][upperLatitudeIndex] -
						vplanetMonthlyByLatitude[month][lowerLatitudeIndex]) *
						latitudeFraction
				vplanetMonthlyAbsError += Math.abs(vplanetMonthly - realMonthly[index])
				vplanetCount++
				monthlyAbsError += Math.abs(
					climate.temperature_monthly[index] - realMonthly[index],
				)
				monthlyCount++
				if (
					lat >= SIBERIA_BOUNDS.minLat &&
					lat < SIBERIA_BOUNDS.maxLat &&
					lon >= SIBERIA_BOUNDS.minLon &&
					lon < SIBERIA_BOUNDS.maxLon
				) {
					siberiaMonthlyDiffSum +=
						climate.temperature_monthly[index] - realMonthly[index]
					siberiaMonthlyCount++
					siberiaMonthlyModeledSum[month] += climate.temperature_monthly[index]
					siberiaMonthlyObservedSum[month] += realMonthly[index]
					siberiaMonthlyCounts[month]++
				}
			}
		}
		const monthlyMeanAbsErrorC = monthlyAbsError / Math.max(1, monthlyCount)
		expect(monthlyMeanAbsErrorC).toBeLessThan(3.75)
		expect(meanAbsErrorC).toBeLessThan(3.1)
		const vplanetAnnualMeanAbsErrorC = vplanetAnnualAbsError / Math.max(1, n)
		const vplanetMonthlyMeanAbsErrorC =
			vplanetMonthlyAbsError / Math.max(1, vplanetCount)
		expect(vplanetCount).toBe(monthlyCount)

		console.info("Land cells compared", n, "of", mesh.numRegions)
		console.info("Overall EBM vs WorldClim (land only, annual mean)")
		console.table({
			meanBiasC: Number(meanBiasC.toFixed(2)),
			meanAbsErrorC: Number(meanAbsErrorC.toFixed(2)),
			monthlyMeanAbsErrorC: Number(monthlyMeanAbsErrorC.toFixed(4)),
			rmseC: Number(rmseC.toFixed(2)),
			tooWarmPct: Number(((tooWarm / Math.max(1, n)) * 100).toFixed(1)),
			tooColdPct: Number(((tooCold / Math.max(1, n)) * 100).toFixed(1)),
			justRightPct: Number(((justRight / Math.max(1, n)) * 100).toFixed(1)),
		})
		console.info("Native VPLanet POISE vs WorldClim (same land cells)")
		console.table({
			revision: vplanet.revision.slice(0, 12),
			meanAbsErrorC: Number(vplanetAnnualMeanAbsErrorC.toFixed(2)),
			monthlyMeanAbsErrorC: Number(vplanetMonthlyMeanAbsErrorC.toFixed(4)),
		})
		console.info("Siberia diagnostic (50–70°N, 60–140°E; land only)")
		console.table({
			cells: siberiaCells,
			modeledC: Number((siberiaModeledSum / siberiaCells).toFixed(2)),
			observedC: Number((siberiaObservedSum / siberiaCells).toFixed(2)),
			biasC: Number(
				((siberiaModeledSum - siberiaObservedSum) / siberiaCells).toFixed(2),
			),
			monthlyBiasC: Number(
				(siberiaMonthlyDiffSum / siberiaMonthlyCount).toFixed(2),
			),
		})
		console.table(
			Array.from({ length: 12 }, (_, month) => ({
				month: month + 1,
				modeledC: Number(
					(
						siberiaMonthlyModeledSum[month] / siberiaMonthlyCounts[month]
					).toFixed(2),
				),
				observedC: Number(
					(
						siberiaMonthlyObservedSum[month] / siberiaMonthlyCounts[month]
					).toFixed(2),
				),
				biasC: Number(
					(
						siberiaMonthlyModeledSum[month] / siberiaMonthlyCounts[month] -
						siberiaMonthlyObservedSum[month] / siberiaMonthlyCounts[month]
					).toFixed(2),
				),
			})),
		)

		console.info("By latitude band (bias = model minus observed, °C)")
		console.table(
			bandStats.map((b) => ({
				band: b.label,
				landCells: b.n,
				meanBiasC: b.n > 0 ? Number((b.sumDiff / b.n).toFixed(2)) : NaN,
				tooWarmPct:
					b.n > 0 ? Number(((b.tooWarm / b.n) * 100).toFixed(1)) : NaN,
				tooColdPct:
					b.n > 0 ? Number(((b.tooCold / b.n) * 100).toFixed(1)) : NaN,
				justRightPct:
					b.n > 0 ? Number(((b.justRight / b.n) * 100).toFixed(1)) : NaN,
			})),
		)

		console.info("By hemisphere (bias = model minus observed, °C)")
		console.table(
			hemisphereStats.map((b) => ({
				hemisphere: b.label,
				landCells: b.n,
				meanBiasC: b.n > 0 ? Number((b.sumDiff / b.n).toFixed(2)) : NaN,
			})),
		)

		console.info("By land elevation (bias = model minus observed, °C)")
		console.table(
			elevationStats.map((b) => ({
				elevation: b.label,
				landCells: b.n,
				meanBiasC: b.n > 0 ? Number((b.sumDiff / b.n).toFixed(2)) : NaN,
			})),
		)
		console.info("Sahara diagnostic (15–33°N, 17°W–35°E; land only)")
		console.table({
			cells: saharaCells,
			modeledC: Number((saharaModeledSum / saharaCells).toFixed(2)),
			noLapseC: Number((saharaNoLapseSum / saharaCells).toFixed(2)),
			observedC: Number((saharaObservedSum / saharaCells).toFixed(2)),
			elevationKm: Number((saharaElevationSum / saharaCells).toFixed(2)),
		})

		expect(n).toBeGreaterThan(0)
		expect(saharaCells).toBeGreaterThan(0)
		expect(Number.isFinite(meanBiasC)).toBe(true)
	}, 600_000)
})
