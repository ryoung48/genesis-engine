import { describe, expect, it } from "vitest"
import { WIND } from "@/model/climate/weather/wind"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import { loadEarthGrayscale, loadEarthMonthlyRaster } from "./assets"

// NOTE ON COMPARABILITY:
// The model's wind field (WIND.computeWindVectors) is a coarse geostrophic /
// ageostrophic blend driven by a *synthesized* pressure field: a hard-coded
// Hadley-cell pressure template keyed off latitude + hoursPerDay
// (bgPressureForRotation/CELL_BOUNDARY_PRESSURES), perturbed by a small
// thermal anomaly term derived from the model's own (already-idealized)
// temperature field, then smoothed. It has no concept of real orography's
// dynamical effect on airflow (Tibetan Plateau/Rockies deflection), monsoon
// land-sea heating asymmetry, ENSO, jet streaks, or actual observed pressure
// systems -- it only sees terrain through a surface-drag multiplier (canopy/
// slope/coastal fetch) applied *after* direction+raw-speed are computed.
// Calibration is likewise global and statistical, not physical: speed is
// rescaled so the 90th-percentile pressure-gradient cell maps to ~10 m/s,
// then scaled by log(hoursPerDay) and 1/sqrt(surfacePressure) fudge factors.
//
// The comparison data (earth-real-wind-u/v, derived from NCEP/NCAR reanalysis
// 10m monthly wind) is an actual assimilation of decades of real observations
// and captures monsoons, jet streams, orographic channeling, etc.
//
// So: agreement on the big zonal-mean structure (easterly trades in the
// tropics, westerlies in the midlatitudes, polar easterlies, sign flips at
// ~30N/S and ~60N/S) is a meaningful check that the model's circulation is
// "Earth-like." Cell-by-cell direction/speed agreement is NOT expected to be
// tight the way EBM temperature is -- there is no mechanism in the model for
// regional wind features, so per-cell errors here mostly measure "how much
// regional detail is the model missing," not "is the model broken."

const LAT_BANDS = [
	{ label: "60N-90N (polar E)", lo: 60, hi: 90 },
	{ label: "30N-60N (westerlies)", lo: 30, hi: 60 },
	{ label: "0-30N (trades)", lo: 0, hi: 30 },
	{ label: "0-30S (trades)", lo: -30, hi: 0 },
	{ label: "30S-60S (westerlies)", lo: -60, hi: -30 },
	{ label: "60S-90S (polar E)", lo: -90, hi: -60 },
]

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

		const { windU, windV, windSpeed } = WIND.computeWindVectors({
			mesh: world.mesh,
			climate: world.climate,
			elevation_km: world.elevation_km,
			params: world.params,
			surface: {
				vegetation: world.vegetation,
				topography: world.topography,
				slopeScore: world.slopeScore,
				oceanDist: world.oceanDist,
			},
		})

		const {
			windU: obsU,
			windV: obsV,
			windSpeed: obsSpeed,
		} = WIND.observedWindVectorsForMonth({
			observedWind: world.observedWind,
			numRegions: world.mesh.numRegions,
		})

		const r_xyz = world.mesh.r_xyz
		function latDegAt(r: number): number {
			const z = r_xyz[r * 3 + 2]
			return (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI
		}

		let n = 0
		let sumSpeedDiff = 0
		let sumAbsSpeedDiff = 0
		let sumSpeedSq = 0
		let sumCos = 0 // mean cosine similarity of direction unit vectors (1 = same dir, -1 = opposite)
		let sumAngleErr = 0 // mean absolute angular error in degrees

		const bandStats = LAT_BANDS.map((b) => ({
			...b,
			n: 0,
			sumU: 0,
			sumV: 0,
			sumObsU: 0,
			sumObsV: 0,
			sumSpeedDiff: 0,
			sumCos: 0,
		}))

		for (let r = 0; r < world.mesh.numRegions; r++) {
			const oSpeed = obsSpeed[r]
			if (!Number.isFinite(oSpeed) || oSpeed <= 1e-9) continue // nodata or calm

			const mu = windU[r]
			const mv = windV[r]
			const ou = obsU[r]
			const ov = obsV[r]
			const mSpeed = windSpeed[r]

			n++
			const speedDiff = mSpeed - oSpeed
			sumSpeedDiff += speedDiff
			sumAbsSpeedDiff += Math.abs(speedDiff)
			sumSpeedSq += speedDiff * speedDiff

			const cos = mu * ou + mv * ov // both are unit vectors
			sumCos += cos
			const angleErr =
				(Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI
			sumAngleErr += angleErr

			const lat = latDegAt(r)
			const band = bandStats.find((b) => lat >= b.lo && lat < b.hi)
			if (band) {
				band.n++
				// Accumulate real (speed-scaled) vectors so the band mean shows the
				// dominant zonal direction, not just the unit-vector average.
				band.sumU += mu * mSpeed
				band.sumV += mv * mSpeed
				band.sumObsU += ou * oSpeed
				band.sumObsV += ov * oSpeed
				band.sumSpeedDiff += speedDiff
				band.sumCos += cos
			}
		}

		const meanSpeedBias = sumSpeedDiff / Math.max(1, n)
		const meanAbsSpeedError = sumAbsSpeedDiff / Math.max(1, n)
		const rmseSpeed = Math.sqrt(sumSpeedSq / Math.max(1, n))
		const meanCos = sumCos / Math.max(1, n)
		const meanAngleErrDeg = sumAngleErr / Math.max(1, n)

		console.info("Cells compared", n, "of", world.mesh.numRegions)
		console.info("Overall model vs NCEP/NCAR wind (annual mean)")
		console.table({
			meanSpeedBiasMs: Number(meanSpeedBias.toFixed(2)),
			meanAbsSpeedErrorMs: Number(meanAbsSpeedError.toFixed(2)),
			rmseSpeedMs: Number(rmseSpeed.toFixed(2)),
			meanDirectionCos: Number(meanCos.toFixed(3)),
			meanAngleErrDeg: Number(meanAngleErrDeg.toFixed(1)),
		})

		console.info(
			"By latitude band -- mean zonal (east+) / meridional (north+) m/s, model vs observed",
		)
		console.table(
			bandStats.map((b) => ({
				band: b.label,
				cells: b.n,
				modelU: b.n > 0 ? Number((b.sumU / b.n).toFixed(2)) : NaN,
				obsU: b.n > 0 ? Number((b.sumObsU / b.n).toFixed(2)) : NaN,
				modelV: b.n > 0 ? Number((b.sumV / b.n).toFixed(2)) : NaN,
				obsV: b.n > 0 ? Number((b.sumObsV / b.n).toFixed(2)) : NaN,
				meanSpeedBiasMs:
					b.n > 0 ? Number((b.sumSpeedDiff / b.n).toFixed(2)) : NaN,
				meanDirectionCos: b.n > 0 ? Number((b.sumCos / b.n).toFixed(3)) : NaN,
			})),
		)

		expect(n).toBeGreaterThan(0)
		expect(Number.isFinite(meanSpeedBias)).toBe(true)
	}, 600_000)
})
