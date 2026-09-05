import { describe, expect, it } from "vitest"
import { PASTA } from "@/model/climate/classification/pasta"
import { CONSTANTS } from "@/model/climate/temperature/ebm/constants"
import { INSOLATION } from "@/model/climate/temperature/ebm/insolation"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { UNITS } from "@/model/shared/units"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import {
	loadEarthElevationRaster,
	loadEarthGrayscale,
	loadEarthMonthlyRaster,
	loadEarthRiverLines,
} from "./assets"

// Only look at classes with at least this many assigned land regions --
// below that the within-class spread is just sampling noise.
const MIN_REGIONS_PER_CLASS = 15

// Number of solar-phase bins the year is resampled onto. 12 keeps it
// roughly "one bin per month" while being indexed by declination phase
// rather than the calendar.
const PHASE_BINS = 12

const MONTH_DAY_COUNTS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

const TAU = 2 * Math.PI

// Folded solar-phase angle (radians, 0..2pi) is measured so that 0 is the
// local summer solstice (sun maximally over the region's own hemisphere).
// Southern-hemisphere regions are rotated by pi so their seasons line up
// with the north -- that is the whole point of indexing by declination
// instead of by month.
function seasonLabel(angle: number): string {
	const x = ((angle % TAU) + TAU) % TAU
	if (x < Math.PI / 4 || x >= (7 * Math.PI) / 4) return "local summer"
	if (x < (3 * Math.PI) / 4) return "local autumn"
	if (x < (5 * Math.PI) / 4) return "local winter"
	return "local spring"
}

// Map each calendar month to a folded solar-phase angle, using the EBM's
// per-day solar declination. `flip` rotates by pi for the southern
// hemisphere. The month's mid-point day is used as its sample point.
function monthPhaseAngles(params: {
	declination: number[]
	flip: boolean
}): number[] {
	const { declination, flip } = params
	const days = declination.length
	let maxAbsDecl = 0
	let maxAbsRate = 0
	const rate: number[] = new Array(days)
	for (let d = 0; d < days; d++) {
		const next = declination[(d + 1) % days]
		const prev = declination[(d - 1 + days) % days]
		rate[d] = 0.5 * (next - prev)
		maxAbsDecl = Math.max(maxAbsDecl, Math.abs(declination[d]))
		maxAbsRate = Math.max(maxAbsRate, Math.abs(rate[d]))
	}

	const angles: number[] = new Array(12)
	let dayCursor = 0
	for (let m = 0; m < 12; m++) {
		const midDay = Math.floor(dayCursor + MONTH_DAY_COUNTS[m] / 2) % days
		dayCursor += MONTH_DAY_COUNTS[m]
		const decNorm = declination[midDay] / maxAbsDecl
		const rateNorm = rate[midDay] / maxAbsRate
		// atan2(-rateNorm, decNorm): 0 at max declination (summer solstice),
		// pi at min (winter solstice), -pi/2 at the rising equinox (spring),
		// +pi/2 at the falling equinox (autumn).
		let angle = Math.atan2(-rateNorm, decNorm)
		if (flip) angle += Math.PI
		angles[m] = ((angle % TAU) + TAU) % TAU
	}
	return angles
}

// Resample a region's 12 normalized monthly rain fractions onto PHASE_BINS
// evenly spaced solar-phase bins. Months landing in the same bin are
// averaged; empty bins are filled by circular interpolation of their
// nearest occupied neighbours. The result is renormalized to sum to 1.
function foldedProfile(params: {
	fractions: number[]
	angles: number[]
}): number[] {
	const { fractions, angles } = params
	const acc = new Array(PHASE_BINS).fill(0)
	const cnt = new Array(PHASE_BINS).fill(0)
	for (let m = 0; m < 12; m++) {
		const bin =
			((Math.round((angles[m] / TAU) * PHASE_BINS) % PHASE_BINS) + PHASE_BINS) %
			PHASE_BINS
		acc[bin] += fractions[m]
		cnt[bin] += 1
	}

	const profile = new Array(PHASE_BINS)
	for (let k = 0; k < PHASE_BINS; k++) {
		profile[k] = cnt[k] > 0 ? acc[k] / cnt[k] : Number.NaN
	}
	for (let k = 0; k < PHASE_BINS; k++) {
		if (Number.isFinite(profile[k])) continue
		let left = 1
		while (!Number.isFinite(profile[(k - left + PHASE_BINS) % PHASE_BINS]))
			left++
		let right = 1
		while (!Number.isFinite(profile[(k + right) % PHASE_BINS])) right++
		const lv = profile[(k - left + PHASE_BINS) % PHASE_BINS]
		const rv = profile[(k + right) % PHASE_BINS]
		profile[k] = (lv * right + rv * left) / (left + right)
	}

	const sum = profile.reduce((a: number, b: number) => a + b, 0)
	return sum > 0 ? profile.map((v: number) => v / sum) : profile
}

function circularResultant(angleList: number[]): { r: number; mean: number } {
	let sc = 0
	let ss = 0
	for (const a of angleList) {
		sc += Math.cos(a)
		ss += Math.sin(a)
	}
	const n = Math.max(1, angleList.length)
	return { r: Math.hypot(sc, ss) / n, mean: Math.atan2(ss, sc) }
}

describe("Pasta class monthly rain shape, indexed by EBM solar phase", () => {
	it("checks whether the normalized annual rain cycle is consistent within each pasta class", () => {
		const earth = loadEarthGrayscale("earth.png")
		const coastline = loadEarthGrayscale("coastline-mask.png")
		const lake = loadEarthGrayscale("lake-mask.png")
		const riverLines = loadEarthRiverLines()
		const realClimate = loadEarthMonthlyRaster("earth-real-temperature")
		const realPrecip = loadEarthMonthlyRaster("earth-real-precipitation")
		const realDtr = loadEarthMonthlyRaster("earth-real-dtr")
		const realElevation = loadEarthElevationRaster()

		const world = IMPORT_HEIGHTMAP.importGenesisWorld({
			params: {
				...DEFAULT_WORLD_PARAMS,
				seed: 14963991,
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
				realDtrMonthly: realDtr.monthly,
				realDtrWidth: realDtr.width,
				realDtrHeight: realDtr.height,
				realDtrMonths: realDtr.months,
				realDtrScale: realDtr.scale,
				realDtrNoData: realDtr.nodata,
				realElevationRaster: realElevation.raster,
				realElevationWidth: realElevation.width,
				realElevationHeight: realElevation.height,
				realElevationScale: realElevation.scale,
				realElevationNoData: realElevation.nodata,
				terrainWarp: 0,
				smoothing: 0,
				hydraulicErosion: 0,
				thermalErosion: 0,
				ridgeSharpening: 0,
				glacialErosion: 0,
			},
		})

		const { mesh, isLand } = world
		const N = mesh.numRegions
		expect(world.realPastaClimate).toBeDefined()
		const zones = world.realPastaClimate!
		const realRain = world.rainfall.real_monthly!

		const p = world.params
		const { _declination } = INSOLATION.compute({
			lats: [0],
			orbital: {
				OBLIQUITY: UNITS.getEffectiveObliquityDeg(p.obliquity),
				ECCENTRICITY: p.eccentricity,
				PERIHELION: p.perihelion,
			},
		})
		expect(_declination.length).toBe(CONSTANTS.embConstants.time.DAYS_PER_YEAR)

		const phaseNorth = monthPhaseAngles({
			declination: _declination,
			flip: false,
		})
		const phaseSouth = monthPhaseAngles({
			declination: _declination,
			flip: true,
		})
		const binCenters = Array.from(
			{ length: PHASE_BINS },
			(_, k) => (k / PHASE_BINS) * TAU,
		)

		type ClassAgg = {
			label: string
			name: string
			n: number
			profiles: number[][]
			psi1: number[]
			psi2: number[]
			amp1: number[]
			amp2: number[]
		}
		const agg = new Map<number, ClassAgg>()

		const r_xyz = mesh.r_xyz
		for (let r = 0; r < N; r++) {
			if (!isLand[r]) continue
			const zoneCode = zones[r]
			if (zoneCode <= 0) continue

			const fractions = new Array(12)
			let annual = 0
			let bad = false
			for (let m = 0; m < 12; m++) {
				const v = realRain[m * N + r]
				if (!Number.isFinite(v)) {
					bad = true
					break
				}
				fractions[m] = v
				annual += v
			}
			if (bad || annual <= 0) continue
			for (let m = 0; m < 12; m++) fractions[m] /= annual

			const lat =
				(Math.asin(Math.max(-1, Math.min(1, r_xyz[r * 3 + 2]))) * 180) / Math.PI
			const angles = lat < 0 ? phaseSouth : phaseNorth

			let c1 = 0
			let s1 = 0
			let c2 = 0
			let s2 = 0
			for (let m = 0; m < 12; m++) {
				c1 += fractions[m] * Math.cos(angles[m])
				s1 += fractions[m] * Math.sin(angles[m])
				c2 += fractions[m] * Math.cos(2 * angles[m])
				s2 += fractions[m] * Math.sin(2 * angles[m])
			}

			let entry = agg.get(zoneCode)
			if (!entry) {
				entry = {
					label: PASTA.pastaLabels[zoneCode],
					name: PASTA.pastaClimateName(zoneCode),
					n: 0,
					profiles: [],
					psi1: [],
					psi2: [],
					amp1: [],
					amp2: [],
				}
				agg.set(zoneCode, entry)
			}
			entry.n += 1
			entry.profiles.push(foldedProfile({ fractions, angles }))
			entry.psi1.push(Math.atan2(s1, c1))
			entry.psi2.push(Math.atan2(s2, c2))
			entry.amp1.push(Math.hypot(c1, s1))
			entry.amp2.push(Math.hypot(c2, s2))
		}

		const ordered = [...agg.entries()]
			.filter(([, e]) => e.n >= MIN_REGIONS_PER_CLASS)
			.sort((a, b) => a[0] - b[0])

		const mean = (xs: number[]) =>
			xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)

		const summary = ordered.map(([, e]) => {
			const res1 = circularResultant(e.psi1)
			const res2 = circularResultant(e.psi2)

			// Per-bin coefficient of variation across the class's regions,
			// averaged over bins -- how much the SHAPE (not just its timing)
			// wobbles region to region.
			let cvSum = 0
			for (let k = 0; k < PHASE_BINS; k++) {
				const col = e.profiles.map((pr) => pr[k])
				const mu = mean(col)
				const varr = mean(col.map((v) => (v - mu) * (v - mu)))
				cvSum += mu > 0 ? Math.sqrt(varr) / mu : 0
			}
			const meanProfileCV = cvSum / PHASE_BINS

			const meanProfile = binCenters.map((_, k) =>
				mean(e.profiles.map((pr) => pr[k])),
			)
			let wet = 0
			let dry = 0
			for (let k = 1; k < PHASE_BINS; k++) {
				if (meanProfile[k] > meanProfile[wet]) wet = k
				if (meanProfile[k] < meanProfile[dry]) dry = k
			}

			return {
				class: e.label,
				name: e.name,
				n: e.n,
				annualCycleAmp: Number(mean(e.amp1).toFixed(3)),
				annualPhaseR: Number(res1.r.toFixed(3)),
				annualPeak: seasonLabel(res1.mean),
				semiAnnualAmp: Number(mean(e.amp2).toFixed(3)),
				semiAnnualR: Number(res2.r.toFixed(3)),
				profileCV: Number(meanProfileCV.toFixed(2)),
				wettestPhase: seasonLabel(binCenters[wet]),
				driestPhase: seasonLabel(binCenters[dry]),
			}
		})

		console.info(
			`Solar-phase bins: 0 = local summer solstice, ${PHASE_BINS / 4} ≈ local autumn equinox, ` +
				`${PHASE_BINS / 2} ≈ local winter solstice, ${(3 * PHASE_BINS) / 4} ≈ local spring equinox. ` +
				"Southern-hemisphere regions are hemisphere-folded so seasons align.",
		)
		console.info(
			"Per pasta class: normalized annual rain cycle (land regions, WorldClim precip).\n" +
				"annualPhaseR ~1 => every region in the class peaks at the same point in the solar year (consistent timing).\n" +
				"profileCV low => the shape itself (bin magnitudes) is consistent region to region.\n" +
				"semiAnnualR flags a consistent TWO-peak (equatorial / monsoon) regime.",
		)
		console.table(summary)

		console.info(
			"Class mean normalized rain by solar-phase bin (rows sum to 1)",
		)
		console.table(
			ordered.map(([, e]) => {
				const row: Record<string, number | string> = { class: e.label }
				for (let k = 0; k < PHASE_BINS; k++) {
					row[`b${k}`] = Number(mean(e.profiles.map((pr) => pr[k])).toFixed(3))
				}
				return row
			}),
		)

		const consistent = summary
			.filter((s) => s.annualPhaseR >= 0.75 && s.profileCV <= 0.5)
			.map((s) => s.class)
		const inconsistent = summary
			.filter((s) => s.annualPhaseR < 0.5)
			.map((s) => s.class)
		console.info(
			`Consistent annual rain shape (phaseR>=0.75 & profileCV<=0.5): ${
				consistent.join(", ") || "none"
			}`,
		)
		console.info(
			`Inconsistent timing (phaseR<0.5): ${inconsistent.join(", ") || "none"}`,
		)

		expect(summary.length).toBeGreaterThan(0)
	}, 600_000)
})
