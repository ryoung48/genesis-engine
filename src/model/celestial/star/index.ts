import type {
	BlackbodyFractionInput,
	InterpolateSeriesInput,
	KeplerYearInput,
	LuminosityClass,
	MainSequenceClass,
	NeutronStarLuminosityClass,
	ParentStarLike,
	RolledStarAttributes,
	RollStarAgeInput,
	SpectralClass,
	StandardLuminosityClass,
	StarSpectralInput,
} from "@/model/celestial/star/types"
import {
	DEFAULT_ORBITAL_DISTANCE_AU as DEFAULT_ORBITAL_DISTANCE_AU_VALUE,
	DEFAULT_SPECTRAL_CLASS as DEFAULT_SPECTRAL_CLASS_VALUE,
	DEFAULT_STAR_SUBTYPE as DEFAULT_STAR_SUBTYPE_VALUE,
	MAIN_SEQUENCE_CLASSES as MAIN_SEQUENCE_CLASSES_VALUE,
} from "@/model/celestial/star/types"
import { MATH } from "@/model/shared/math/core"
import { DICE } from "@/model/shared/random/dice"
import type { SharedRng } from "@/model/shared/random/rng"

const defaultOrbitalDistanceAu = DEFAULT_ORBITAL_DISTANCE_AU_VALUE
const defaultSpectralClass = DEFAULT_SPECTRAL_CLASS_VALUE
const defaultStarSubtype = DEFAULT_STAR_SUBTYPE_VALUE
const mainSequenceClasses = MAIN_SEQUENCE_CLASSES_VALUE
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
const C2_UM_K = 14388 // second radiation constant in Î¼m·K

// Fraction of blackbody power emitted from 0 to Î» (wavelength in nm, T in K).
// Uses the standard series expansion of the fractional blackbody function.
function blackbodyFraction({
	lambdaNm,
	temperatureK,
}: BlackbodyFractionInput): number {
	const x = C2_UM_K / ((lambdaNm / 1000) * temperatureK)
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
	const par =
		blackbodyFraction({ lambdaNm: 700, temperatureK: T_K }) -
		blackbodyFraction({ lambdaNm: 400, temperatureK: T_K })
	const parSol =
		blackbodyFraction({ lambdaNm: 700, temperatureK: T_SUN_K }) -
		blackbodyFraction({ lambdaNm: 400, temperatureK: T_SUN_K })
	return par / parSol
}

function interpolateSeries({
	position,
	values,
}: InterpolateSeriesInput): number {
	const n = values.length
	if (n === 0) return 0
	if (n === 1) return values[0]
	if (position <= 0)
		return MATH.lerp({ start: values[0], end: values[1], position })
	const maxPos = n - 1
	if (position >= maxPos)
		return MATH.lerp({
			start: values[n - 2],
			end: values[n - 1],
			position: position - (n - 2),
		})
	const i = Math.floor(position)
	return MATH.lerp({
		start: values[i],
		end: values[i + 1],
		position: position - i,
	})
}

function getStarSpectralPosition({ cls, subtype }: StarSpectralInput): number {
	// SPECTRAL_RANGES only covers the seven main-sequence (V) classes -- a
	// caller passing one of the exotic SpectralClass values (giant, white
	// dwarf, etc. -- see rollStarAttributes/FULL_SPECTRAL_RANGES) has no entry
	// here. Every getStarXxx caller below is main-sequence-only by design (see
	// their doc comment), so fall back to the default class rather than
	// crashing on an out-of-domain input.
	const [start, end] =
		SPECTRAL_RANGES[cls] ?? SPECTRAL_RANGES[defaultSpectralClass]
	return start + (Math.max(0, Math.min(9, subtype)) / 9) * (end - start)
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

// --- Extended stellar-evolution model (galaxy-gen parity) -----------------
// Ports galaxy-gen's rollStarAttributes (stars/generation.ts) end to end:
// the giant/subgiant/subdwarf/supergiant luminosity-class ladder, the brown-
// dwarf/white-dwarf/neutron-star/black-hole branches, and their dedicated
// mass/diameter/temperature formulas. Deliberately kept separate from
// SPECTRAL_RANGES/STAR_TEMP_K/etc. above (which only ever modeled ordinary
// V-class O-M dwarfs) so no existing caller of STAR.getStarTemperatureK/
// getStarMassSol/etc. changes behavior -- those stay main-sequence-only.

const FULL_SPECTRAL_RANGES: Record<SpectralClass, [number, number]> = {
	O: [0, 2],
	B: [2, 4],
	A: [4, 6],
	F: [6, 8],
	G: [8, 10],
	K: [10, 12],
	M: [12, 14],
	L: [14, 16],
	T: [16, 18],
	Y: [18, 20],
	D: [20, 22],
	NS: [22, 24],
	BH: [24, 26],
}

const STAR_DOMAIN_LENGTH = 20
const COMPACT_STAR_DOMAIN_LENGTH = 15
const SUBTYPE_SCALE = 9

const starMassByLuminosityClass: Record<StandardLuminosityClass, number[]> = {
	Ia: [200, 80, 60, 30, 20, 15, 13, 12, 12, 13, 14, 18, 20, 25, 30],
	Ib: [150, 60, 40, 25, 15, 13, 12, 10, 10, 11, 12, 13, 15, 20, 25],
	II: [130, 40, 30, 20, 14, 11, 10, 8, 8, 10, 10, 12, 14, 16, 18],
	III: [110, 30, 20, 10, 8, 6, 4, 3, 2.5, 2.4, 1.1, 1.5, 1.8, 2.4, 8],
	IV: [20, 20, 20, 10, 4, 2.3, 2, 1.5, 1.7, 1.2, 1.5, 1.5, 1.5, 1.5, 1.5],
	V: [
		90, 60, 18, 5, 2.2, 1.8, 1.5, 1.3, 1.1, 0.9, 0.8, 0.7, 0.5, 0.16, 0.08,
		0.06, 0.05, 0.04, 0.025, 0.013, 0.01,
	],
	VI: [
		2, 1.5, 0.5, 0.4, 0.4, 0.5, 0.6, 0.7, 0.8, 0.7, 0.6, 0.5, 0.4, 0.12, 0.075,
	],
}

const starDiameterByLuminosityClass: Record<StandardLuminosityClass, number[]> =
	{
		Ia: [
			25, 22, 20, 60, 120, 180, 210, 280, 330, 360, 420, 600, 900, 1200, 1800,
		],
		Ib: [24, 20, 14, 25, 50, 75, 85, 115, 135, 150, 180, 260, 380, 600, 800],
		II: [22, 18, 12, 14, 30, 45, 50, 66, 77, 90, 110, 160, 230, 350, 500],
		III: [21, 15, 10, 6, 5, 5, 5, 5, 10, 15, 20, 40, 60, 100, 200],
		IV: [8, 8, 8, 5, 4, 3, 3, 2, 3, 4, 6, 6, 6, 6, 6],
		V: [
			20, 12, 7, 3.5, 2.2, 2, 1.7, 1.5, 1.1, 0.95, 0.9, 0.8, 0.7, 0.2, 0.1,
			0.08, 0.09, 0.11, 0.1, 0.1,
		],
		VI: [
			0.18, 0.18, 0.2, 0.5, 0.5, 0.6, 0.6, 0.8, 0.8, 0.7, 0.6, 0.5, 0.4, 0.1,
			0.08,
		],
	}

const starTempFull = [
	50000, 40000, 30000, 15000, 10000, 8000, 7500, 6500, 6000, 5600, 5200, 4400,
	3700, 3000, 2400, 1850, 1300, 900, 550, 300,
]

const starMAOByLuminosityClass: Record<StandardLuminosityClass, number[]> = {
	Ia: [
		0.63, 0.55, 0.5, 1.67, 3.34, 4.17, 4.42, 5.0, 5.21, 5.34, 5.59, 6.17, 6.8,
		7.2, 7.8,
	],
	Ib: [
		0.6, 0.5, 0.35, 0.63, 1.4, 2.17, 2.5, 3.25, 3.59, 3.84, 4.17, 4.84, 5.42,
		6.17, 6.59,
	],
	II: [
		0.55, 0.45, 0.3, 0.35, 0.75, 1.17, 1.33, 1.87, 2.24, 2.67, 3.17, 4.0, 4.59,
		5.3, 5.92,
	],
	III: [
		0.53, 0.38, 0.25, 0.15, 0.13, 0.13, 0.13, 0.13, 0.25, 0.38, 0.5, 1.0, 1.68,
		3.0, 4.34,
	],
	IV: [
		0.2, 0.2, 0.2, 0.13, 0.1, 0.07, 0.07, 0.06, 0.07, 0.1, 0.15, 0.15, 0.15,
		0.15, 0.15,
	],
	V: [
		0.5, 0.3, 0.18, 0.09, 0.06, 0.05, 0.04, 0.03, 0.03, 0.02, 0.02, 0.02, 0.02,
		0.01, 0.01,
	],
	VI: [
		0.01, 0.01, 0.01, 0.01, 0.015, 0.015, 0.015, 0.015, 0.02, 0.02, 0.02, 0.01,
		0.01, 0.01, 0.01,
	],
}

function fullInterpolateSeries(
	position: number,
	values: readonly number[],
	domainLength: number,
): number {
	const count = Math.min(domainLength, values.length)
	if (count === 0) return 0
	if (count === 1) return values[0]!
	if (position <= 0) {
		return MATH.lerp({ start: values[0]!, end: values[1]!, position })
	}
	const maxPosition = count - 1
	if (position >= maxPosition) {
		return MATH.lerp({
			start: values[count - 2]!,
			end: values[count - 1]!,
			position: position - (count - 2),
		})
	}
	const lowerIndex = Math.floor(position)
	return MATH.lerp({
		start: values[lowerIndex]!,
		end: values[lowerIndex + 1]!,
		position: position - lowerIndex,
	})
}

function mapSubtypeToSpectralPosition(
	subtype: number,
	[start, end]: readonly [number, number],
): number {
	return start + (end - start) * (subtype / SUBTYPE_SCALE)
}

export function isGiant(luminosityClass: LuminosityClass): boolean {
	return (
		luminosityClass === "III" ||
		luminosityClass === "II" ||
		luminosityClass === "Ib" ||
		luminosityClass === "Ia"
	)
}

export function isBrownDwarf(spectralClass: SpectralClass): boolean {
	return spectralClass === "L" || spectralClass === "T" || spectralClass === "Y"
}

function toPhysicalLuminosityClass(
	spectralClass: SpectralClass,
	luminosityClass: LuminosityClass,
): StandardLuminosityClass {
	return spectralClass === "NS"
		? "V"
		: (luminosityClass as StandardLuminosityClass)
}

// Ported from galaxy-gen's whiteDwarfs/neutronStars/blackHoles (stars/
// generation.ts) -- these three exotic classes never use the mass/diameter/
// temperature interpolation series above, so they get their own dedicated
// dice formulas instead. dice.randint(40e3, 1000)'s reversed argument order
// in the source is a quirk of that Dice.randint's min/max normalization
// (Math.ceil(min)/Math.floor(max) makes it tolerate either order); this
// repo's RNG.randint requires ascending args, so these call it as
// randint(1000, 40e3) -- same intended uniform range, cleaner call.
const whiteDwarfRoll = {
	massSol: (rng: SharedRng, parentMassSol?: number): number =>
		Math.min(
			(DICE.rollDice({ rng, count: 2, sides: 6 }) - 1) / 10 +
				rng.randint(1, 10) / 100,
			(parentMassSol ?? Infinity) * 0.9,
		),
	diameterSol: (massSol: number): number => (1 / massSol) * 0.01,
	temperatureK: (rng: SharedRng, massSol: number): number =>
		(rng.randint(1000, 40e3) * massSol) / 0.6,
}

const neutronStarRoll = {
	massSol: (rng: SharedRng): number => {
		const mass = DICE.rollDice({ rng, count: 1, sides: 6 })
		const extra =
			mass === 6 ? (DICE.rollDice({ rng, count: 1, sides: 6 }) - 1) / 10 : 0
		return 1 + mass / 10 + extra
	},
	diameterSol: (rng: SharedRng): number =>
		(19 + DICE.rollDice({ rng, count: 1, sides: 6 })) / 1.4e6,
	temperatureK: (rng: SharedRng, massSol: number): number =>
		(rng.randint(1000, 40e3) * massSol) / 0.6,
}

const blackHoleRoll = {
	// `diameterSol` deliberately models the visible accretion disk rather
	// than the event horizon. The disk's outer radius is one million
	// Schwarzschild radii, with a modest per-system variation so equal-mass
	// black holes do not all render identically. Planet placement must use
	// this host diameter as the disk-exclusion boundary.
	// The underlying event horizon is 2.953 km per solar mass.
	accretionDiskOuterRadiusEventHorizons: 1_000_000,
	massSol: (rng: SharedRng): number => {
		const mass = DICE.rollDice({ rng, count: 1, sides: 6 })
		const total = mass + (mass === 6 ? blackHoleRoll.massSol(rng) : 0)
		return 2.1 + total - 1 + rng.randint(1, 10) / 10
	},
	diameterSol: (rng: SharedRng, massSol: number): number =>
		((2 * 2.953 * blackHoleRoll.accretionDiskOuterRadiusEventHorizons) /
			1.4e6) *
		massSol *
		rng.uniform(0.75, 1.25),
	// Every modeled black hole has an active disk. This remains randomized in
	// brightness, while avoiding a visually indistinguishable inactive branch.
	luminositySol: (rng: SharedRng): number => rng.uniform(0.01, 10),
	temperatureK: (): number => 0,
}

function rollNeutronStarLuminosityClass(
	rng: SharedRng,
): NeutronStarLuminosityClass {
	return (
		rng.weightedChoice<NeutronStarLuminosityClass>([
			{ v: "O", w: 75 },
			{ v: "P", w: 20 },
			{ v: "M", w: 5 },
		]) ?? "O"
	)
}

export function isPulsar(
	star: Pick<RolledStarAttributes, "spectralClass" | "luminosityClass">,
): boolean {
	return star.spectralClass === "NS" && star.luminosityClass === "P"
}

export function isMagnetar(
	star: Pick<RolledStarAttributes, "spectralClass" | "luminosityClass">,
): boolean {
	return star.spectralClass === "NS" && star.luminosityClass === "M"
}

export function getNeutronStarColor(
	star: Pick<RolledStarAttributes, "spectralClass" | "luminosityClass">,
): string {
	if (isPulsar(star)) return "#00e5ff"
	if (isMagnetar(star)) return "#ff4dff"
	return "#002aff"
}

/**
 * Ports galaxy-gen's rollStarAttributes (stars/generation.ts) end to end --
 * the primary's initial 2d6 giant/subgiant/subdwarf/supergiant ladder (only
 * reachable when `!parent && !homeworld`), the O-M spectral-class ladder
 * with its baked-in "at least one step cooler than parent" floors, the
 * brown-dwarf-tail/white-dwarf-parent inheritance branch, the 5% root-only
 * exotic branch (brown dwarf/white dwarf/neutron star/black hole), and the
 * age roll including the now-reachable giant/subgiant lifespan branches and
 * the dead-star post-death age bump. Every dice.* call is translated to its
 * SharedRng/DICE equivalent 1:1 (see whiteDwarfRoll's doc for the one
 * intentional argument-order cleanup). Companion-orbit eccentricity is
 * rolled separately by GALAXY_SYSTEMS, where parent/role information is
 * available and the galaxy-gen star-companion modifier applies.
 */
export function rollStarAttributes(
	rng: SharedRng,
	parent?: ParentStarLike,
	homeworld?: boolean,
): RolledStarAttributes {
	const parentClass = parent?.spectralClass
	let spectralRoll = DICE.rollDice({ rng, count: 2, sides: 6 })
	let luminosityClass: LuminosityClass = "V"
	let spectralClass: SpectralClass = "G"
	if (spectralRoll <= 3 && !homeworld && !parent) {
		spectralRoll = DICE.rollDice({ rng, count: 2, sides: 6 }) + 2
		let lumRoll = DICE.rollDice({ rng, count: 2, sides: 6 })
		if (lumRoll <= 5) luminosityClass = "VI"
		else if (lumRoll <= 8) luminosityClass = "IV"
		else if (lumRoll <= 10) luminosityClass = "III"
		else {
			lumRoll = DICE.rollDice({ rng, count: 2, sides: 6 })
			if (lumRoll <= 8) luminosityClass = "III"
			else if (lumRoll <= 10) luminosityClass = "II"
			else if (lumRoll === 11) luminosityClass = "Ib"
			else luminosityClass = "Ia"
		}
	}
	const giant = luminosityClass === "III"
	const subGiant = luminosityClass === "IV"
	const subDwarf = luminosityClass === "VI"
	if (spectralRoll >= 12 && homeworld) spectralRoll -= 2
	if (spectralRoll <= 6 && (subGiant || giant)) spectralRoll += 5
	if (spectralRoll <= 6 || parentClass === "K" || parentClass === "M") {
		spectralClass = "M"
	} else if (spectralRoll <= 8 || parentClass === "G") {
		spectralClass = "K"
	} else if (spectralRoll <= 10 || parentClass === "F") {
		spectralClass = "G"
	} else if (spectralRoll <= 11 || parentClass === "A") {
		spectralClass = subDwarf ? "G" : "F"
	} else if (spectralRoll === 12) {
		spectralRoll = DICE.rollDice({ rng, count: 2, sides: 6 })
		if ((spectralRoll <= 9 || parentClass === "B") && !subDwarf) {
			spectralClass = "A"
		} else if (spectralRoll <= 11 || subGiant || parentClass === "O") {
			spectralClass = "B"
		} else {
			spectralClass = "O"
		}
	}
	let subtype = rng.randint(0, 9)
	if (spectralClass === "K" && subtype > 4) subtype -= 5
	if (spectralClass === "M" && parentClass === "M") {
		subtype = rng.randint((parent?.subtype ?? 0) + 1, 9)
	}

	const whiteDwarfParent = parent?.spectralClass === "D"
	const brownDwarfParent =
		parent?.spectralClass === "L" || parent?.spectralClass === "T"

	if (whiteDwarfParent || brownDwarfParent || (parent && rng.random() > 0.85)) {
		spectralClass =
			rng.weightedChoice([
				{
					v: "L" as const,
					w:
						parent?.spectralClass === "L" || parent?.spectralClass === "T"
							? 0
							: 0.4,
				},
				{ v: "T" as const, w: parent?.spectralClass === "T" ? 0 : 0.3 },
				{ v: "Y" as const, w: 0.3 },
				{ v: "D" as const, w: whiteDwarfParent ? 1 : 0 },
			]) ?? "D"
		luminosityClass = "V"
		subtype = rng.randint(0, 9)
	}

	if (rng.random() > 0.95 && !parent && !homeworld) {
		spectralClass =
			rng.weightedChoice([
				{ v: rng.choice(["L", "T"] as const), w: 0.1 },
				{ v: "D" as const, w: 0.5 },
				{ v: "NS" as const, w: 0.1 },
				{ v: "BH" as const, w: 0.1 },
			]) ?? "D"
		luminosityClass =
			spectralClass === "NS" ? rollNeutronStarLuminosityClass(rng) : "V"
		subtype = rng.randint(0, 9)
	}
	if (spectralClass === "Y" && subtype > 5) subtype = rng.randint(0, 5)

	const whiteDwarf = spectralClass === "D"
	const neutronStar = spectralClass === "NS"
	const blackHole = spectralClass === "BH"
	const brownDwarf = isBrownDwarf(spectralClass)
	const physicalLuminosityClass = toPhysicalLuminosityClass(
		spectralClass,
		luminosityClass,
	)
	const range = FULL_SPECTRAL_RANGES[spectralClass]
	const domainLength =
		physicalLuminosityClass === "V"
			? STAR_DOMAIN_LENGTH
			: COMPACT_STAR_DOMAIN_LENGTH
	const idx = mapSubtypeToSpectralPosition(subtype, range)

	const massSol = whiteDwarf
		? whiteDwarfRoll.massSol(rng, parent?.massSol)
		: neutronStar
			? neutronStarRoll.massSol(rng)
			: blackHole
				? blackHoleRoll.massSol(rng)
				: fullInterpolateSeries(
						idx,
						starMassByLuminosityClass[physicalLuminosityClass],
						domainLength,
					)
	const temperatureK = whiteDwarf
		? whiteDwarfRoll.temperatureK(rng, massSol)
		: neutronStar
			? neutronStarRoll.temperatureK(rng, massSol)
			: blackHole
				? blackHoleRoll.temperatureK()
				: fullInterpolateSeries(idx, starTempFull, domainLength)
	const diameterSol = whiteDwarf
		? whiteDwarfRoll.diameterSol(massSol)
		: neutronStar
			? neutronStarRoll.diameterSol(rng)
			: blackHole
				? blackHoleRoll.diameterSol(rng, massSol)
				: fullInterpolateSeries(
						idx,
						starDiameterByLuminosityClass[physicalLuminosityClass],
						domainLength,
					)
	const luminositySol = blackHole
		? blackHoleRoll.luminositySol(rng)
		: diameterSol ** 2 * (temperatureK / 5772) ** 4

	const mao = brownDwarf
		? 0.005
		: whiteDwarf || neutronStar || blackHole
			? 0.001
			: fullInterpolateSeries(
					idx,
					starMAOByLuminosityClass[physicalLuminosityClass],
					COMPACT_STAR_DOMAIN_LENGTH,
				)

	let ageGyr = parent?.ageGyr ?? 0
	if (!parent) {
		const deadStar = whiteDwarf || neutronStar || blackHole
		const mainSequenceMassSol = fullInterpolateSeries(
			idx,
			starMassByLuminosityClass.V,
			domainLength,
		)
		const mainSequenceLifespanGyr = 10 / mainSequenceMassSol ** 2.5
		const subgiantMassSol = fullInterpolateSeries(
			idx,
			starMassByLuminosityClass.IV,
			domainLength,
		)
		const subgiantLifespanGyr = mainSequenceLifespanGyr / (4 + subgiantMassSol)
		const giantLifespanGyr = mainSequenceLifespanGyr / (10 * massSol ** 3)

		ageGyr =
			DICE.rollDice({ rng, count: 1, sides: 6 }) * 2 +
			DICE.rollDice({ rng, count: 1, sides: 3 }) -
			2 +
			rng.uniform(0.1, 0.9)
		if (massSol > 0.9 && !deadStar) {
			ageGyr = mainSequenceLifespanGyr * rng.uniform(0.1, 0.9)
		}
		if (luminosityClass === "IV") {
			ageGyr =
				mainSequenceLifespanGyr + subgiantLifespanGyr * rng.uniform(0.1, 0.9)
		} else if (luminosityClass === "III") {
			ageGyr =
				mainSequenceLifespanGyr +
				subgiantLifespanGyr +
				giantLifespanGyr * rng.uniform(0.1, 0.9)
		}
		if (deadStar) {
			ageGyr +=
				DICE.rollDice({ rng, count: 1, sides: 6 }) * 2 +
				DICE.rollDice({ rng, count: 2, sides: 3 }) * massSol -
				2 +
				rng.uniform(0.1, 0.9)
		}
		if (ageGyr > 14) ageGyr = rng.uniform(13, 14)
	}

	return {
		spectralClass,
		luminosityClass,
		subtype,
		massSol,
		temperatureK,
		diameterSol,
		luminositySol,
		ageGyr,
		mao,
		// galaxy-gen's hzco applies its own AU-to-render-units conversion
		// (MATH.orbits.fromAU) since it's consumed directly by its renderer --
		// this repo has no equivalent render-unit system for stars, so this is
		// just the habitable-zone AU itself (same value STAR.getHabitableZoneAU
		// returns for an ordinary main-sequence star).
		hzco: Math.sqrt(Math.max(0, luminositySol)),
	}
}

export const STAR = {
	getStarTemperatureK({ cls, subtype }: StarSpectralInput): number {
		return interpolateSeries({
			position: getStarSpectralPosition({ cls, subtype }),
			values: STAR_TEMP_K,
		})
	},

	getStarDiameterSol({ cls, subtype }: StarSpectralInput): number {
		return interpolateSeries({
			position: getStarSpectralPosition({ cls, subtype }),
			values: STAR_DIAMETER_SOL,
		})
	},

	getStarLuminositySol({ cls, subtype }: StarSpectralInput): number {
		const d = STAR.getStarDiameterSol({ cls, subtype })
		const t = STAR.getStarTemperatureK({ cls, subtype })
		return d * d * Math.pow(t / T_SUN_K, 4)
	},

	getStarMassSol({ cls, subtype }: StarSpectralInput): number {
		return interpolateSeries({
			position: getStarSpectralPosition({ cls, subtype }),
			values: STAR_MASS_SOL,
		})
	},

	getStarMAO({ cls, subtype }: StarSpectralInput): number {
		return interpolateSeries({
			position: getStarSpectralPosition({ cls, subtype }),
			values: STAR_MAO_AU,
		})
	},

	getStarPARFactor({ cls, subtype }: StarSpectralInput): number {
		return parFractionNormalized(STAR.getStarTemperatureK({ cls, subtype }))
	},

	getKeplerYearYears({ orbitalDistanceAU, massSol }: KeplerYearInput): number {
		return Math.sqrt(orbitalDistanceAU ** 3 / Math.max(massSol, 0.001))
	},

	getHabitableZoneAU(luminositySol: number): number {
		return Math.sqrt(Math.max(0, luminositySol))
	},

	getStarLabel({ cls, subtype }: StarSpectralInput): string {
		return `${cls}${Math.round(subtype)}`
	},

	isValidSpectralClass(cls: string): cls is MainSequenceClass {
		return (mainSequenceClasses as readonly string[]).includes(cls)
	},

	getNonRealisticStarToPlanetRatio({
		cls,
		subtype,
	}: StarSpectralInput): number {
		const position = getStarSpectralPosition({ cls, subtype })
		const t = position / NON_REALISTIC_STAR_SPECTRAL_POSITION_MAX
		return (
			NON_REALISTIC_STAR_RATIO_AT_O0 +
			t * (NON_REALISTIC_STAR_RATIO_AT_M9 - NON_REALISTIC_STAR_RATIO_AT_O0)
		)
	},

	// Ported from galaxy-gen's rollStarAttributes age roll, restricted to the
	// main-sequence case — chaos-machine only models class V stars, so the
	// giant/subgiant/dead-star lifespan branches don't apply here.
	rollStarAgeGyr({ rng, massSol }: RollStarAgeInput): number {
		const mainSequenceLifespanGyr = 10 / massSol ** 2.5
		let age =
			rng.randint(1, 6) * 2 + rng.randint(1, 3) - 2 + rng.uniform(0.1, 0.9)
		if (massSol > 0.9) age = mainSequenceLifespanGyr * rng.uniform(0.1, 0.9)
		if (age > 14) age = rng.uniform(13, 14)
		return age
	},
	defaultOrbitalDistanceAu,
	defaultSpectralClass,
	defaultStarSubtype,
	mainSequenceClasses,
	isGiant,
	isBrownDwarf,
	isPulsar,
	isMagnetar,
	getNeutronStarColor,
	rollStarAttributes,
}
