import type { SharedRng } from "@/model/shared/rng"

export const MAIN_SEQUENCE_CLASSES = [
	"O",
	"B",
	"A",
	"F",
	"G",
	"K",
	"M",
] as const
export type MainSequenceClass = (typeof MAIN_SEQUENCE_CLASSES)[number]

export const DEFAULT_SPECTRAL_CLASS: MainSequenceClass = "G"
export const DEFAULT_STAR_SUBTYPE = 2.0
export const DEFAULT_ORBITAL_DISTANCE_AU = 1.0

// Position ranges within the 20-entry V-class lookup tables
const SPECTRAL_RANGES: Record<MainSequenceClass, [number, number]> = {
	O: [0, 2],
	B: [2, 4],
	A: [4, 6],
	F: [6, 8],
	G: [8, 10],
	K: [10, 12],
	M: [12, 14],
}

// Temperature (K) indexed by spectral position 0–19 (O0 → Y9)
const STAR_TEMP_K = [
	50000, 40000, 30000, 15000, 10000, 8000, 7500, 6500, 5920, 5600, 5200, 4400,
	3700, 3000, 2400, 1850, 1300, 900, 550, 300,
]

// Diameter (solar radii) for main-sequence (V class), indexed 0–19
const STAR_DIAMETER_SOL = [
	20, 12, 7, 3.5, 2.2, 2, 1.7, 1.5, 1.04, 0.95, 0.9, 0.8, 0.7, 0.2, 0.1, 0.08,
	0.09, 0.11, 0.1, 0.1,
]

// Mass (solar masses) for main-sequence V class, indexed 0–19
// Index 8 (G0) nudged from 1.1 → 1.08 so G2 interpolates to exactly 1.0 M☉
const STAR_MASS_SOL = [
	90, 60, 18, 5, 2.2, 1.8, 1.5, 1.3, 1.08, 0.9, 0.8, 0.7, 0.5, 0.16, 0.08, 0.06,
	0.05, 0.04, 0.025, 0.013,
]

// Minimum allowable orbit (AU) for main-sequence V class, first 15 entries
const STAR_MAO_AU = [
	0.5, 0.3, 0.18, 0.09, 0.06, 0.05, 0.04, 0.03, 0.03, 0.02, 0.02, 0.02, 0.02,
	0.01, 0.01,
]

const T_SUN_K = 5778
const C2_UM_K = 14388 // second radiation constant in μm·K

// Fraction of blackbody power emitted from 0 to λ (wavelength in nm, T in K).
// Uses the standard series expansion of the fractional blackbody function.
function blackbodyFraction(lambdaNm: number, T_K: number): number {
	const x = C2_UM_K / ((lambdaNm / 1000) * T_K)
	let sum = 0
	for (let n = 1; n <= 10; n++) {
		const nx = n * x
		sum +=
			Math.exp(-nx) *
			(x ** 3 / n + (3 * x ** 2) / n ** 2 + (6 * x) / n ** 3 + 6 / n ** 4)
	}
	return (15 / Math.PI ** 4) * sum
}

// PAR energy fraction (400–700 nm) of a blackbody at T_K, normalized so G2 (5778 K) = 1.0
function parFractionNormalized(T_K: number): number {
	const par = blackbodyFraction(700, T_K) - blackbodyFraction(400, T_K)
	const parSol =
		blackbodyFraction(700, T_SUN_K) - blackbodyFraction(400, T_SUN_K)
	return par / parSol
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t
}

function interpolateSeries(position: number, values: number[]): number {
	const n = values.length
	if (n === 0) return 0
	if (n === 1) return values[0]
	if (position <= 0) return lerp(values[0], values[1], position)
	const maxPos = n - 1
	if (position >= maxPos)
		return lerp(values[n - 2], values[n - 1], position - (n - 2))
	const i = Math.floor(position)
	return lerp(values[i], values[i + 1], position - i)
}

function getStarSpectralPosition(
	cls: MainSequenceClass,
	subtype: number,
): number {
	const [start, end] = SPECTRAL_RANGES[cls]
	return start + (Math.max(0, Math.min(9, subtype)) / 9) * (end - start)
}

export function getStarTemperatureK(
	cls: MainSequenceClass,
	subtype: number,
): number {
	return interpolateSeries(getStarSpectralPosition(cls, subtype), STAR_TEMP_K)
}

export function getStarDiameterSol(
	cls: MainSequenceClass,
	subtype: number,
): number {
	return interpolateSeries(
		getStarSpectralPosition(cls, subtype),
		STAR_DIAMETER_SOL,
	)
}

export function getStarLuminositySol(
	cls: MainSequenceClass,
	subtype: number,
): number {
	const d = getStarDiameterSol(cls, subtype)
	const t = getStarTemperatureK(cls, subtype)
	return d * d * Math.pow(t / T_SUN_K, 4)
}

export function getStarMassSol(
	cls: MainSequenceClass,
	subtype: number,
): number {
	return interpolateSeries(getStarSpectralPosition(cls, subtype), STAR_MASS_SOL)
}

export function getStarMAO(cls: MainSequenceClass, subtype: number): number {
	return interpolateSeries(getStarSpectralPosition(cls, subtype), STAR_MAO_AU)
}

export function getStarPARFactor(
	cls: MainSequenceClass,
	subtype: number,
): number {
	return parFractionNormalized(getStarTemperatureK(cls, subtype))
}

export function getKeplerYearYears(
	orbitalDistanceAU: number,
	massSol: number,
): number {
	return Math.sqrt(orbitalDistanceAU ** 3 / Math.max(massSol, 0.001))
}

export function getHabitableZoneAU(luminositySol: number): number {
	return Math.sqrt(Math.max(0, luminositySol))
}

export function getStarLabel(cls: MainSequenceClass, subtype: number): string {
	return `${cls}${Math.round(subtype)}`
}

export function isValidSpectralClass(cls: string): cls is MainSequenceClass {
	return (MAIN_SEQUENCE_CLASSES as readonly string[]).includes(cls)
}

// Non-realistic-sizes star radius: same spirit as galaxy-gen's
// getStarRenderRadius (a handful of fixed radii instead of scaling
// continuously with the star's true diameter/luminosity), but interpolated
// linearly across the full O0→M9 spectral position instead of galaxy-gen's
// flat per-class buckets — so hotter/bigger subtypes within a class still
// read as a bit bigger than cooler/smaller ones in the same class, without
// ever reflecting the real (sqrt-of-hundreds-to-thousands-x) diameter ratio.
const NON_REALISTIC_STAR_RATIO_AT_O0 = 24
const NON_REALISTIC_STAR_RATIO_AT_M9 = 8
const NON_REALISTIC_STAR_SPECTRAL_POSITION_MAX = 14 // O0 = 0 … M9 = 14

export function getNonRealisticStarToPlanetRatio(
	cls: MainSequenceClass,
	subtype: number,
): number {
	const position = getStarSpectralPosition(cls, subtype)
	const t = position / NON_REALISTIC_STAR_SPECTRAL_POSITION_MAX
	return (
		NON_REALISTIC_STAR_RATIO_AT_O0 +
		t * (NON_REALISTIC_STAR_RATIO_AT_M9 - NON_REALISTIC_STAR_RATIO_AT_O0)
	)
}

// Ported from galaxy-gen's rollStarAttributes age roll, restricted to the
// main-sequence case — chaos-machine only models class V stars, so the
// giant/subgiant/dead-star lifespan branches don't apply here.
export function rollStarAgeGyr(
	rng: Pick<SharedRng, "randint" | "uniform">,
	massSol: number,
): number {
	const mainSequenceLifespanGyr = 10 / massSol ** 2.5
	let age =
		rng.randint(1, 6) * 2 + rng.randint(1, 3) - 2 + rng.uniform(0.1, 0.9)
	if (massSol > 0.9) age = mainSequenceLifespanGyr * rng.uniform(0.1, 0.9)
	if (age > 14) age = rng.uniform(13, 14)
	return age
}
