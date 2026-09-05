import { describe, expect, it } from "vitest"
import { WIND } from "@/model/climate/weather/wind"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
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
		const perMonthRows: Record<string, number | string>[] = []

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

			const monthAcc = newAcc()
			for (let r = 0; r < N; r++) {
				if (!isLand(r)) continue // land-only comparison
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

		expect(overall.n).toBeGreaterThan(0)
	}, 600_000)
})
