import { describe, expect, it } from "vitest"
import type { SverdrupPlanet } from "@/model/climate/ocean/currents/sverdrup/circulation/types"
import { SVERDRUP_RASTER } from "@/model/climate/ocean/currents/sverdrup/raster"
import { SVERDRUP_SST_ANOMALY } from "@/model/climate/ocean/currents/sverdrup/sst-anomaly"
import { MIXED_LAYER } from "@/model/climate/ocean/mixed-layer"
import { RAIN } from "@/model/climate/precipitation/rain"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { UNITS } from "@/model/shared/units"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import { loadEarthGrayscale, loadEarthMonthlyRaster } from "./assets"

// DIAGNOSTIC ONLY -- asserts nothing about accuracy, and nothing here gates a
// build. N Atlantic Drift's SST anomaly stays near zero (0.05-0.34 C against
// a 3.39 C target) across every diagnostic run so far -- real current
// substituted, real background gradient substituted, every relaxation time
// from 20 to 320 days, every upwelling deficit from 2 to 16 C. None of that
// creates the missing warmth, because none of it asks the one question that
// actually matters here: does this model's advection operator connect the
// Gulf Stream to the N Atlantic Drift box at all? The real N Atlantic
// Current's warmth is created upstream (Gulf Stream separation, Cape
// Hatteras) and carried northeast; NAD needs no large local source if
// transport actually reaches it.
//
// This injects a synthetic tracer source at Cape Hatteras, drives it with
// real GODAS surface current (never fed into production), and solves the
// exact advection-diffusion-relaxation operator
// SVERDRUP_SST_ANOMALY.solveAnomaly uses, comparing relaxation configs: no
// relaxation at all (pure connectivity -- does the current topology reach N
// Atlantic Drift?) against production's fixed ~80-day relaxation, both under
// the annual-mean current and under each individual month's own current. The
// reported values are percentages of the source region's own level --
// SOURCE_VALUE is many orders of magnitude larger than a real heat-source
// rate, so the raw anomaly values are meaningless in isolation; what
// survival fraction reaches each downstream box is not.

const NAD_BOX = {
	lat: [45, 55] as [number, number],
	lon: [-45, -15] as [number, number],
}
const MID_ATLANTIC_BOX = {
	lat: [38, 42] as [number, number],
	lon: [-55, -35] as [number, number],
}
const SOURCE_LAT = [33, 37] as [number, number]
const SOURCE_LON = [-78, -70] as [number, number]
const SOURCE_VALUE = 1
// 1e12 s (~31700 years) stands in for "no relaxation at all" while keeping
// the linear system's diagonal strictly positive so Gauss-Seidel stays
// well-posed; MIXED_LAYER.relaxationSeconds (~80 days) is production's real
// value.
const NO_RELAXATION_SECONDS = 1e12

describe("SST tracer connectivity: Gulf Stream to N Atlantic Drift (diagnostic)", () => {
	it("reports how a Cape Hatteras tracer propagates under real GODAS current", () => {
		const earth = loadEarthGrayscale("earth.png")
		const coastline = loadEarthGrayscale("coastline-mask.png")
		const lake = loadEarthGrayscale("lake-mask.png")
		const currentU = loadEarthMonthlyRaster("earth-real-current-u")
		const currentV = loadEarthMonthlyRaster("earth-real-current-v")
		// Not used for evaluation -- only loaded because attachObservedEarthCurrent
		// requires both current and SST-anomaly rasters present together.
		const sstAnomaly = loadEarthMonthlyRaster("earth-real-sst-anomaly")

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
				realCurrentUMonthly: currentU.monthly,
				realCurrentVMonthly: currentV.monthly,
				realCurrentWidth: currentU.width,
				realCurrentHeight: currentU.height,
				realCurrentMonths: currentU.months,
				realCurrentScale: currentU.scale,
				realCurrentNoData: currentU.nodata,
				realSstAnomalyMonthly: sstAnomaly.monthly,
				realSstAnomalyWidth: sstAnomaly.width,
				realSstAnomalyHeight: sstAnomaly.height,
				realSstAnomalyMonths: sstAnomaly.months,
				realSstAnomalyScale: sstAnomaly.scale,
				realSstAnomalyNoData: sstAnomaly.nodata,
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

		const N = world.mesh.numRegions
		const { latDeg, lonDeg } = RAIN.getClimateGeometry(world.mesh)
		const observed = world.observedCurrent
		if (!observed?.real_u_monthly || !observed.real_v_monthly)
			throw new Error("Earth import is missing ocean-current data")

		const isLake = LANDMARKS.regionTypeMask({
			landmarks: world.landmarks,
			type: "lake",
		})
		const isOcean = new Uint8Array(N)
		for (let r = 0; r < N; r++)
			isOcean[r] = !world.isLand[r] && !isLake[r] ? 1 : 0
		const index = SVERDRUP_RASTER.buildIndex({ latDeg, lonDeg, isOcean })
		const planet: SverdrupPlanet = {
			coriolisSign: UNITS.isRetrogradeObliquity(world.params.obliquity)
				? -1
				: 1,
			rotationRateRadS: (2 * Math.PI) / (world.params.hoursPerDay * 3600),
			radiusM: world.params.planetRadiusKm * 1000,
			airDensityKgM3: 1.225 * (world.params.pressure ?? 1),
			seawaterDensityKgM3: MIXED_LAYER.seawaterDensityKgM3,
			gyreStrength: 1,
		}

		const annualMean = (monthly: Float32Array) => {
			const out = new Float32Array(N)
			const valid = new Uint8Array(N)
			for (let r = 0; r < N; r++) {
				let sum = 0
				let count = 0
				for (let m = 0; m < 12; m++) {
					const value = monthly[m * N + r]
					if (!Number.isFinite(value)) continue
					sum += value
					count++
				}
				if (count > 0) {
					out[r] = sum / count
					valid[r] = 1
				}
			}
			return { out, valid }
		}
		const meanU = annualMean(observed.real_u_monthly)
		const meanV = annualMean(observed.real_v_monthly)
		const validCurrent = new Uint8Array(N)
		for (let r = 0; r < N; r++)
			validCurrent[r] = isOcean[r] && meanU.valid[r] && meanV.valid[r] ? 1 : 0

		const flow = {
			x: SVERDRUP_RASTER.average({
				index,
				values: meanU.out,
				include: validCurrent,
			}),
			y: SVERDRUP_RASTER.average({
				index,
				values: meanV.out,
				include: validCurrent,
			}),
		}

		const W = SVERDRUP_RASTER.width
		const H = SVERDRUP_RASTER.height
		const CELLS = W * H

		const source = new Float32Array(CELLS)
		let sourceCells = 0
		for (let j = 0; j < H; j++) {
			const lat = j - 90
			if (lat < SOURCE_LAT[0] || lat > SOURCE_LAT[1]) continue
			for (let i = 0; i < W; i++) {
				const lon = i - 180
				if (lon < SOURCE_LON[0] || lon > SOURCE_LON[1]) continue
				const idx = j * W + i
				if (!index.ocean[idx]) continue
				source[idx] = SOURCE_VALUE
				sourceCells++
			}
		}
		console.log(`NADTRACER source cells=${sourceCells}`)

		const boxMean = (
			field: Float32Array,
			box: { lat: [number, number]; lon: [number, number] },
		) => {
			let sum = 0
			let count = 0
			for (let j = 0; j < H; j++) {
				const lat = j - 90
				if (lat < box.lat[0] || lat > box.lat[1]) continue
				for (let i = 0; i < W; i++) {
					const lon = i - 180
					if (lon < box.lon[0] || lon > box.lon[1]) continue
					const idx = j * W + i
					if (!index.ocean[idx]) continue
					sum += field[idx]
					count++
				}
			}
			return count > 0 ? sum / count : Number.NaN
		}

		const bandMean = (field: Float32Array, lat: number) => {
			let sum = 0
			let count = 0
			const j = lat + 90
			for (let i = 0; i < W; i++) {
				const lon = i - 180
				if (lon < -60 || lon > -10) continue
				const idx = j * W + i
				if (!index.ocean[idx]) continue
				sum += field[idx]
				count++
			}
			return count > 0 ? sum / count : Number.NaN
		}

		// The arbitrary SOURCE_VALUE is many orders of magnitude larger than a
		// real heat-source rate (diffusion/relaxation coefficients here are
		// ~1e-7 to 1e-12 /s, so a source of 1 balloons into millions of "degrees"
		// -- meaningless in isolation). What's meaningful is the fraction of the
		// source region's own level that survives to each downstream box, which
		// is unit-free and answers the actual question: does it connect, and how
		// much decays before it arrives.
		const runConfig = (
			label: string,
			relaxationSeconds: Float32Array,
			configFlow = flow,
		) => {
			const anomaly = SVERDRUP_SST_ANOMALY.solveAnomaly({
				flow: configFlow,
				ocean: index.ocean,
				source,
				planet,
				relaxationSeconds,
			})
			const at = boxMean(anomaly, { lat: SOURCE_LAT, lon: SOURCE_LON })
			const pct = (value: number) => `${((100 * value) / at).toFixed(2)}%`
			console.log(
				`NADTRACER ${label.padEnd(28)} ` +
					`source=100% ` +
					`40N=${pct(bandMean(anomaly, 40))} ` +
					`45N=${pct(bandMean(anomaly, 45))} ` +
					`50N=${pct(bandMean(anomaly, 50))} ` +
					`midAtl=${pct(boxMean(anomaly, MID_ATLANTIC_BOX))} ` +
					`NAD=${pct(boxMean(anomaly, NAD_BOX))}`,
			)
		}

		const uniform = (seconds: number) => new Float32Array(CELLS).fill(seconds)
		runConfig("no relaxation (connectivity)", uniform(NO_RELAXATION_SECONDS))
		runConfig(
			"production relaxation (80d)",
			uniform(MIXED_LAYER.relaxationSeconds),
		)

		// The annual mean of a meandering, eddying current (the real North
		// Atlantic Current) can be far weaker than the actual month-to-month
		// pathway -- averaging directions that shift or loop can cancel real
		// transport rather than represent it. No relaxation in every month here,
		// to isolate connectivity alone, the same as the annual-mean config above.
		for (let month = 0; month < 12; month++) {
			const monthU = new Float32Array(N)
			const monthV = new Float32Array(N)
			const monthValid = new Uint8Array(N)
			for (let r = 0; r < N; r++) {
				const u = observed.real_u_monthly[month * N + r]
				const v = observed.real_v_monthly[month * N + r]
				if (!isOcean[r] || !Number.isFinite(u) || !Number.isFinite(v)) continue
				monthU[r] = u
				monthV[r] = v
				monthValid[r] = 1
			}
			const monthFlow = {
				x: SVERDRUP_RASTER.average({
					index,
					values: monthU,
					include: monthValid,
				}),
				y: SVERDRUP_RASTER.average({
					index,
					values: monthV,
					include: monthValid,
				}),
			}
			runConfig(
				`month ${month} real current (connectivity)`,
				uniform(NO_RELAXATION_SECONDS),
				monthFlow,
			)
		}

		expect(sourceCells).toBeGreaterThan(0)
	})
}, 600_000)
