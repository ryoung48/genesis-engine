import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type {
	DeviationInput,
	FinalizeTemperatureInput,
	OrbitalTemperatureInput,
	TemperatureFinalizeResult,
	TemperatureInput,
	TemperatureTraceEntry,
	TemperatureTraceResult,
} from "@/model/celestial/planet/environment/temperature/types"
import type { Zone } from "@/model/celestial/planet/types"
import { SOL_DATA } from "@/model/celestial/system/sol-system/data"

// Earth's own real albedo/greenhouseFactor (see sol-system/data's Earth seed
// entry), used as the reference state for the mean-temperature permutation
// breakdown below -- rather than a second, independently hardcoded pair that
// could drift from the actual seed values.
const EARTH_SEED = SOL_DATA.solPlanetSeeds.find(
	(seed) => seed.name === SOL_DATA.solMainWorldName,
)
if (!EARTH_SEED || EARTH_SEED.albedo === undefined)
	throw new Error("sol-system data is missing Earth's seed albedo")
if (EARTH_SEED.greenhouseFactor === undefined)
	throw new Error("sol-system data is missing Earth's seed greenhouseFactor")
const EARTH_ALBEDO = EARTH_SEED.albedo
const EARTH_GREENHOUSE_FACTOR = EARTH_SEED.greenhouseFactor

const DEVIATION_DOMAIN = [
	-4.5, -4.0, -4.0, -3.5, -3.5, -3.0, -3.0, -2.5, -2.5, -2.0, -2.0, -1.5, -1.5,
	-1.0, -1.0, -0.5, -0.5, 0.5, 0.5, 1.0, 1.0, 1.5, 1.5, 2.0, 2.0, 2.5,
] as const
// The two breakpoints straddling deviation 0 (indices 16/17, at -0.5/0.5)
// were 5/25 -- interpolating to 15C at deviation 0 exactly. But
// auFromTemperature/celsiusForOrbitalDistance's blackbody formula only
// resolves deviation 0 back to exactly 1 AU (at luminositySol 1) for a
// 279K/5.85C target (279 being that formula's own equilibrium constant), not
// Earth's real warmed 15C surface temp. Recentered on 5.85C (keeping the
// same 20-wide spread the original 5/25 pair had) so a forced main world at
// the habitable-zone center actually lands at 1 AU around a Sol-like star.
const DEVIATION_RANGE = [
	-250, -230, -210, -190, -180, -160, -150, -130, -120, -100, -95, -75, -65,
	-50, -40, 0, -4.15, 15.85, 35, 75, 85, 180, 200, 300, 350, 450,
] as const
function deviationToCelsius(deviation: number): number {
	if (deviation <= DEVIATION_DOMAIN[0]) return DEVIATION_RANGE[0]
	const lastIndex = DEVIATION_DOMAIN.length - 1
	if (deviation >= DEVIATION_DOMAIN[lastIndex])
		return DEVIATION_RANGE[lastIndex]
	for (let i = 0; i < lastIndex; i++) {
		const x0 = DEVIATION_DOMAIN[i]
		const x1 = DEVIATION_DOMAIN[i + 1]
		if (deviation >= x0 && deviation <= x1) {
			if (x1 === x0) return DEVIATION_RANGE[i + 1]
			const t = (deviation - x0) / (x1 - x0)
			return (
				DEVIATION_RANGE[i] + t * (DEVIATION_RANGE[i + 1] - DEVIATION_RANGE[i])
			)
		}
	}
	return DEVIATION_RANGE[lastIndex]
}

function celsiusForOrbitalDistance({
	orbitalDistanceAU,
	luminositySol,
}: OrbitalTemperatureInput): number {
	return 279 * (luminositySol / orbitalDistanceAU ** 2) ** 0.25 - 273.15
}

function auFromTemperature({
	kelvinTemp,
	luminositySol,
}: TemperatureInput): number {
	return (luminositySol / (kelvinTemp / 279) ** 4) ** 0.5
}

function deviationToAU({ deviation, luminositySol }: DeviationInput): number {
	return auFromTemperature({
		kelvinTemp: deviationToCelsius(deviation) + 273.15,
		luminositySol,
	})
}

function estimateDeviationFromOrbitalDistance({
	orbitalDistanceAU,
	luminositySol,
}: OrbitalTemperatureInput): number {
	const targetCelsius = celsiusForOrbitalDistance({
		orbitalDistanceAU,
		luminositySol,
	})
	let closestDeviation = 0
	let closestDelta = Number.POSITIVE_INFINITY
	for (let step = -45; step <= 25; step++) {
		const deviation = step / 10
		const delta = Math.abs(deviationToCelsius(deviation) - targetCelsius)
		if (delta < closestDelta) {
			closestDelta = delta
			closestDeviation = deviation
		}
	}
	return closestDeviation
}

function zoneFromDeviation(deviation: number): Zone {
	if (deviation >= 1) return "epistellar"
	if (deviation <= -1) return "outer"
	return "inner"
}

// ---------- finalize (ported from galaxy-gen's TEMPERATURE.finalize, steps
// 4 onward -- orbits/temperature/index.ts) ----------

const seismologyMod = (value: number, seismology: number) =>
	(value ** 4 + seismology ** 4) ** 0.25

const temperatureBase = (
	luminosity: number,
	albedo: number,
	greenhouse: number,
	AU: number,
	seismology: number,
) =>
	seismologyMod(
		279 * ((luminosity * (1 - albedo) * (1 + greenhouse)) / AU ** 2) ** 0.25,
		seismology,
	)

const seasonality = (
	tilt: number,
	rotation: number,
	geography: number,
	atmospheric: number,
) => {
	const seasonalityNumerator = Math.min(
		1,
		Math.max(0, tilt + rotation + geography),
	)
	const seasonalityDenominator = 1 + atmospheric
	// Capped below 1: at exactly 1 the cold branch gets zero luminosity and
	// its temperature collapses to absolute zero (seen on Pallas, whose 84°
	// tilt saturates the numerator) -- no real body has a 0K night side.
	return Math.min(0.99, seasonalityNumerator / seasonalityDenominator)
}

const temperatureRange = (
	luminosityMod: number,
	luminosity: number,
	albedo: number,
	greenhouse: number,
	au: number,
	eccentricity: number,
	seismology: number,
) => {
	const highLuminosity = luminosity * (1 + luminosityMod)
	const lowLuminosity = luminosity * (1 - luminosityMod)
	const nearAU = au * (1 - eccentricity)
	const farAU = au * (1 + eccentricity)
	const high = temperatureBase(
		highLuminosity,
		albedo,
		greenhouse,
		nearAU,
		seismology,
	)
	const low = temperatureBase(
		lowLuminosity,
		albedo,
		greenhouse,
		farAU,
		seismology,
	)
	return { high, low, delta: high - low }
}

const permutations = <T>(xs: T[]): T[][] => {
	const out: T[][] = []
	const rec = (arr: T[], m: T[] = []) => {
		if (arr.length === 0) out.push(m)
		else
			for (let i = 0; i < arr.length; i++) {
				const next = arr.slice()
				const ch = next.splice(i, 1)[0]
				rec(next, m.concat(ch))
			}
	}
	rec(xs)
	return out
}

function traceMean(params: {
	luminosity: number
	albedo: number
	greenhouse: number
	au: number
	seismology: number
}): { baseline: number; trace: TemperatureTraceEntry[] } {
	const { luminosity, albedo, greenhouse, au, seismology } = params
	const factorsMean = ["L", "a", "g", "AU", "SE"] as const
	type FactorMean = (typeof factorsMean)[number]
	const permsMean = permutations([...factorsMean])
	const refMean = {
		L0: 1,
		AU0: 1,
		a0: EARTH_ALBEDO,
		g0: EARTH_GREENHOUSE_FACTOR,
		SE: 25,
	}

	const stateMean = (on: Set<FactorMean>) => ({
		L: on.has("L") ? luminosity : refMean.L0,
		a: on.has("a") ? albedo : refMean.a0,
		g: on.has("g") ? greenhouse : refMean.g0,
		AU: on.has("AU") ? au : refMean.AU0,
		SE: on.has("SE") ? seismology : refMean.SE,
	})

	const contribMean = {
		luminosity: 0,
		albedo: 0,
		greenhouse: 0,
		distance: 0,
		seismology: 0,
	}
	for (const order of permsMean) {
		const on = new Set<FactorMean>()
		const s0 = stateMean(on)
		let prev = temperatureBase(s0.L, s0.a, s0.g, s0.AU, s0.SE)
		for (const f of order) {
			on.add(f)
			const s1 = stateMean(on)
			const curr = temperatureBase(s1.L, s1.a, s1.g, s1.AU, s1.SE)
			const dK = curr - prev
			if (f === "L") contribMean.luminosity += dK
			if (f === "a") contribMean.albedo += dK
			if (f === "g") contribMean.greenhouse += dK
			if (f === "AU") contribMean.distance += dK
			if (f === "SE") contribMean.seismology += dK
			prev = curr
		}
	}
	const Nmean = permsMean.length
	contribMean.luminosity /= Nmean
	contribMean.albedo /= Nmean
	contribMean.greenhouse /= Nmean
	contribMean.distance /= Nmean
	contribMean.seismology /= Nmean
	const baselineRadiative = temperatureBase(
		refMean.L0,
		refMean.a0,
		refMean.g0,
		refMean.AU0,
		refMean.SE,
	)

	const trace: TemperatureTraceEntry[] = [
		{
			value: contribMean.luminosity,
			description: `luminosity (${luminosity.toFixed(2)})`,
		},
		{ value: contribMean.albedo, description: `albedo (${albedo.toFixed(2)})` },
		{
			value: contribMean.greenhouse,
			description: `greenhouse (${greenhouse.toFixed(2)})`,
		},
		{
			value: contribMean.distance,
			description: `distance (${au.toFixed(2)} AU)`,
		},
		{
			value: contribMean.seismology,
			description: `seismology (${seismology.toFixed(2)})`,
		},
	]
	return { baseline: baselineRadiative - 273.15, trace }
}

function traceDelta(params: {
	luminosity: number
	albedo: number
	greenhouse: number
	au: number
	tilt: number
	rotation: number
	geography: number
	atmospheric: number
	eccentricity: number
	seismology: number
	/** Raw physical inputs behind the transformed tilt/rotation/geography
	 * factors above, for display -- the factors themselves are
	 * model-internal (sin tilt, sqrt day length, hydro mapping). */
	tiltLabel: string
	rotationLabel: string
	geographyLabel: string
}): { baseline: number; trace: TemperatureTraceEntry[] } {
	const {
		luminosity,
		albedo,
		greenhouse,
		au,
		tilt,
		rotation,
		geography,
		atmospheric,
		eccentricity,
		seismology,
		tiltLabel,
		rotationLabel,
		geographyLabel,
	} = params

	const deltaF = (
		tilt: number,
		rotation: number,
		geography: number,
		atmospheric: number,
		eccentricity: number,
		seismology: number,
	) => {
		const luminosityMod = seasonality(tilt, rotation, geography, atmospheric)
		return temperatureRange(
			luminosityMod,
			luminosity,
			albedo,
			greenhouse,
			au,
			eccentricity,
			seismology,
		).delta
	}
	const refDelta = {
		tilt: 0,
		rotation: 0,
		geography: 0,
		atmospheric: 0,
		eccentricity: 0,
		seismology: 0,
	}
	const baseline = deltaF(
		refDelta.tilt,
		refDelta.rotation,
		refDelta.geography,
		refDelta.atmospheric,
		refDelta.eccentricity,
		refDelta.seismology,
	)

	const factorsDelta = [
		"tilt",
		"rotation",
		"geography",
		"atmospheric",
		"eccentricity",
		"seismology",
	] as const
	type FactorDelta = (typeof factorsDelta)[number]
	const permsDelta = permutations([...factorsDelta])
	const stateDelta = (on: Set<FactorDelta>) => ({
		tilt: on.has("tilt") ? tilt : refDelta.tilt,
		rotation: on.has("rotation") ? rotation : refDelta.rotation,
		geography: on.has("geography") ? geography : refDelta.geography,
		atmospheric: on.has("atmospheric") ? atmospheric : refDelta.atmospheric,
		eccentricity: on.has("eccentricity") ? eccentricity : refDelta.eccentricity,
		seismology: on.has("seismology") ? seismology : refDelta.seismology,
	})

	const deltaContrib = {
		tilt: 0,
		rotation: 0,
		geography: 0,
		atmospheric: 0,
		eccentricity: 0,
		seismology: 0,
	}
	for (const order of permsDelta) {
		const on = new Set<FactorDelta>()
		const s0 = stateDelta(on)
		let prev = deltaF(
			s0.tilt,
			s0.rotation,
			s0.geography,
			s0.atmospheric,
			s0.eccentricity,
			s0.seismology,
		)
		for (const f of order) {
			on.add(f)
			const s1 = stateDelta(on)
			const curr = deltaF(
				s1.tilt,
				s1.rotation,
				s1.geography,
				s1.atmospheric,
				s1.eccentricity,
				s1.seismology,
			)
			const dK = curr - prev
			deltaContrib[f] += dK
			prev = curr
		}
	}
	const Ndelta = permsDelta.length
	deltaContrib.tilt /= Ndelta
	deltaContrib.rotation /= Ndelta
	deltaContrib.geography /= Ndelta
	deltaContrib.atmospheric /= Ndelta
	deltaContrib.eccentricity /= Ndelta
	deltaContrib.seismology /= Ndelta

	const trace: TemperatureTraceEntry[] = [
		{
			value: deltaContrib.tilt,
			description: `tilt (${tiltLabel})`,
		},
		{
			value: deltaContrib.rotation,
			description: `rotation (${rotationLabel})`,
		},
		{
			value: deltaContrib.geography,
			description: `geography (${geographyLabel})`,
		},
		{
			value: deltaContrib.atmospheric,
			description: `atmospheric (${atmospheric.toFixed(2)} bar)`,
		},
		{
			value: deltaContrib.eccentricity,
			description: `eccentricity (${eccentricity.toFixed(2)})`,
		},
		{
			value: deltaContrib.seismology,
			description: `seismology (${seismology.toFixed(2)})`,
		},
	]

	return { baseline, trace }
}

function finalize(params: FinalizeTemperatureInput): TemperatureFinalizeResult {
	const {
		luminositySol,
		orbitalDistanceAU,
		eccentricity,
		albedo,
		greenhouseFactor,
		hydrosphereCode,
		pressureBar,
		axialTiltDeg,
		orbitalPeriodDays,
		siderealDayHours,
		tideLock,
		seismologyTotal,
		group,
	} = params

	// Excluded for jovians -- see ebm/index.ts's EBMConfig.seismologyTotalHeatingK
	// doc: system-seismology.ts's residual-heating formula is tuned for
	// rocky/icy geologic stress, not gas-giant internal heat, and produces
	// values so large for a jovian's huge sizeClass that they'd swamp its
	// individually-fitted temperature (same exclusion GenerationPlanetNavigator
	// applies before the EBM preview).
	const effectiveSeismology = group === "jovian" ? 0 : seismologyTotal

	const mean = temperatureBase(
		luminositySol,
		albedo,
		greenhouseFactor,
		orbitalDistanceAU,
		effectiveSeismology,
	)

	const boiledOffHydrosphereCode =
		mean > 1e3 && group !== "jovian" ? 12 : undefined

	const { tiltFactor, rotationFactor, geographicFactor } = seasonalFactors({
		axialTiltDeg,
		orbitalPeriodDays,
		tideLock,
		siderealDayHours,
		hydrosphereCode,
	})
	const luminosityMod = seasonality(
		tiltFactor,
		rotationFactor,
		geographicFactor,
		pressureBar,
	)

	const { high, low, delta } = temperatureRange(
		luminosityMod,
		luminositySol,
		albedo,
		greenhouseFactor,
		orbitalDistanceAU,
		eccentricity,
		effectiveSeismology,
	)

	return {
		mean,
		high,
		low,
		deltaK: delta,
		boiledOffHydrosphereCode,
	}
}

// Split out of finalize() so trace() (see below) doesn't need to duplicate
// this cheap, non-permutation part of the calculation.
function seasonalFactors(params: {
	axialTiltDeg: number
	orbitalPeriodDays: number
	tideLock?: FinalizeTemperatureInput["tideLock"]
	siderealDayHours: number
	hydrosphereCode: number
}): { tiltFactor: number; rotationFactor: number; geographicFactor: number } {
	const {
		axialTiltDeg,
		orbitalPeriodDays,
		tideLock,
		siderealDayHours,
		hydrosphereCode,
	} = params
	const tiltFactor = ORBIT_BODY.computeSeasonalTiltFactor({
		axialTiltDeg,
		orbitalPeriodDays,
	})

	const rotationFactor =
		tideLock?.type !== "solar" && siderealDayHours < 2500
			? siderealDayHours ** 0.5 / 50
			: 1
	const geographicFactor = (10 - Math.min(10, hydrosphereCode)) / 20
	return { tiltFactor, rotationFactor, geographicFactor }
}

// On-demand only -- NOT called by finalize(). The permutation-based
// contribution breakdown (5! + 6! orderings, each re-running temperatureBase/
// temperatureRange) was expensive enough to noticeably slow down bulk galaxy
// generation when computed eagerly for every body and moon. Call this
// separately (e.g. from a UI detail panel) only when a trace breakdown is
// actually being displayed for one body.
function trace(params: FinalizeTemperatureInput): TemperatureTraceResult {
	const {
		luminositySol,
		orbitalDistanceAU,
		eccentricity,
		albedo,
		greenhouseFactor,
		hydrosphereCode,
		pressureBar,
		axialTiltDeg,
		orbitalPeriodDays,
		siderealDayHours,
		tideLock,
		seismologyTotal,
		group,
	} = params
	// Same jovian exclusion as finalize() -- see its comment.
	const effectiveSeismology = group === "jovian" ? 0 : seismologyTotal
	const { tiltFactor, rotationFactor, geographicFactor } = seasonalFactors({
		axialTiltDeg,
		orbitalPeriodDays,
		tideLock,
		siderealDayHours,
		hydrosphereCode,
	})
	return {
		mean: traceMean({
			luminosity: luminositySol,
			albedo,
			greenhouse: greenhouseFactor,
			au: orbitalDistanceAU,
			seismology: effectiveSeismology,
		}),
		delta: traceDelta({
			luminosity: luminositySol,
			albedo,
			greenhouse: greenhouseFactor,
			au: orbitalDistanceAU,
			tilt: tiltFactor,
			rotation: rotationFactor,
			geography: geographicFactor,
			atmospheric: pressureBar,
			eccentricity,
			seismology: effectiveSeismology,
			tiltLabel: `${axialTiltDeg.toFixed(1)}°`,
			rotationLabel:
				tideLock?.type === "solar"
					? "locked"
					: `${siderealDayHours.toFixed(1)}h`,
			geographyLabel: `hydro ${hydrosphereCode}`,
		}),
	}
}

// Ported from galaxy-gen's TEMPERATURE.describe -- climate banding off a mean
// Kelvin temperature, used by BIOSPHERE's temperature modifiers.
function describe(
	kelvin: number,
): "frozen" | "cold" | "temperate" | "hot" | "burning" {
	if (kelvin <= 223) return "frozen"
	if (kelvin <= 273.15) return "cold"
	if (kelvin <= 303.15) return "temperate"
	if (kelvin <= 353.15) return "hot"
	return "burning"
}

export const TEMPERATURE = {
	deviationToCelsius,
	auFromTemperature,
	deviationToAU,
	estimateDeviationFromOrbitalDistance,
	zoneFromDeviation,
	describe,
	finalize,
	trace,
}
