import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type {
	BlackbodyFractionInput,
	InterpolateSeriesInput,
	KeplerYearInput,
	LuminosityClass,
	MainSequenceClass,
	NeutronStarLuminosityClass,
	NonPrimaryStarColumn,
	NonPrimaryStarMethod,
	ParentStarLike,
	RolledStarAttributes,
	RollStarAgeInput,
	SpectralClass,
	StandardLuminosityClass,
	StarPrimordialInput,
	StarProtoInput,
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
// See rollStarAttributes' young-star-override [DEVIATION] comment below --
// the odds any given non-evolved, non-dead star independently rolls as
// freshly formed (regardless of mass), and the share of that pool narrow
// enough to also count as proto rather than just primordial.
const YOUNG_STAR_CHANCE = 0.01
const YOUNG_STAR_PROTO_SHARE = 0.25
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

// getStarTemperatureK/getStarDiameterSol/getStarMassSol/getStarMAO below all
// read off starTempFull/starDiameterByLuminosityClass.V/
// starMassByLuminosityClass.V/starMAOByLuminosityClass.V (defined further
// down alongside rollStarAttributes) -- there used to be a second,
// near-duplicate copy of these four tables up here that only the plain
// getStarXxx functions read, which is how the G0 entries drifted apart
// (temperature 5920 vs 6000, diameter 1.04 vs 1.1, mass 1.08 vs 1.1 -- the
// 1.08 was a deliberate nudge, per the comment on starMassByLuminosityClass
// below, "so G2 interpolates to exactly 1.0 M☉," that never made it into the
// second copy). Consolidated onto one copy so getStarXxx and
// rollStarAttributes can no longer disagree about what a given class/subtype
// actually is.

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

// starTempFull/starDiameterByLuminosityClass.V are already indexed across the
// full O0->Y9 domain (see their doc comments), so brown dwarfs (L/T/Y) have
// real data here -- they just aren't reachable through getStarSpectralPosition,
// which only maps the seven main-sequence SPECTRAL_RANGES keys. This sibling
// uses FULL_SPECTRAL_RANGES instead so L/T/Y resolve to their own position
// rather than collapsing to the default class (G) -- see
// getStarLuminositySolExtended, used wherever a caller needs a real
// (non-Sun-like) luminosity for an exotic dwarf without going through the
// separate rollStarAttributes model. D/NS/BH start past this array's domain
// and clamp to its last entry (Y9) -- callers needing those already have
// dedicated formulas elsewhere.
function getExtendedStarSpectralPosition({
	cls,
	subtype,
}: {
	cls: SpectralClass
	subtype: number
}): number {
	const maxPos = starTempFull.length - 1
	const [rawStart, rawEnd] =
		FULL_SPECTRAL_RANGES[cls] ?? SPECTRAL_RANGES[defaultSpectralClass]
	const start = Math.min(rawStart, maxPos)
	const end = Math.min(rawEnd, maxPos)
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
// Ports galaxy-gen's rollStarAttributes (stars/generation.ts) end to end: the
// giant/subgiant/subdwarf/supergiant luminosity-class ladder, the brown-
// dwarf/white-dwarf/neutron-star/black-hole branches, and their dedicated
// formulas. The V-class (main-sequence) mass/diameter/temperature series
// below (starMassByLuminosityClass.V/starDiameterByLuminosityClass.V/
// starTempFull) are the same tables STAR.getStarMassSol/getStarDiameterSol/
// getStarTemperatureK read via SPECTRAL_RANGES above -- there's only one copy
// of the main-sequence O-M data now, shared by both the plain lookup
// functions and rollStarAttributes.

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
	// Index 8 (G0) nudged from 1.1 -> 1.08 so G2 interpolates to exactly 1.0 M☉
	// (used by both getStarMassSol and rollStarAttributes -- see the note on
	// SPECTRAL_RANGES above).
	V: [
		90, 60, 18, 5, 2.2, 1.8, 1.5, 1.3, 1.08, 0.9, 0.8, 0.7, 0.5, 0.16, 0.08,
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
			20, 12, 7, 3.5, 2.2, 2, 1.7, 1.5, 1.04, 0.95, 0.9, 0.8, 0.7, 0.2, 0.1,
			0.08, 0.09, 0.11, 0.1, 0.1,
		],
		VI: [
			0.18, 0.18, 0.2, 0.5, 0.5, 0.6, 0.6, 0.8, 0.8, 0.7, 0.6, 0.5, 0.4, 0.1,
			0.08,
		],
	}

// Index 8 (G0) is 5920, not the more commonly cited 6000 -- kept consistent
// with getStarTemperatureK's pre-consolidation value (used by both here).
const starTempFull = [
	50000, 40000, 30000, 15000, 10000, 8000, 7500, 6500, 5920, 5600, 5200, 4400,
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

/** Root-only (parent-blind) giant/subgiant/subdwarf/supergiant ladder + O-M
 * spectral-class ladder -- galaxy-gen's rollStarAttributes primary path,
 * extracted so it can also serve as the Non-Primary Star Determination
 * table's "Random" method body ("Roll on the regular Star Type
 * Determination table"). `homeworld` only ever comes from the true system
 * primary's own call; companion rolls always pass `false`, which is also
 * what makes the giant ladder reachable for a companion's Random result
 * (the book's "regular" table isn't parent-gated). */
function rollUnconstrainedStarType(
	rng: SharedRng,
	homeworld: boolean,
): {
	spectralClass: MainSequenceClass
	luminosityClass: LuminosityClass
	subtype: number
} {
	let spectralRoll = DICE.rollDice({ rng, count: 2, sides: 6 })
	let luminosityClass: LuminosityClass = "V"
	let spectralClass: MainSequenceClass = "G"
	if (spectralRoll <= 3 && !homeworld) {
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
	if (spectralRoll <= 6) {
		spectralClass = "M"
	} else if (spectralRoll <= 8) {
		spectralClass = "K"
	} else if (spectralRoll <= 10) {
		spectralClass = "G"
	} else if (spectralRoll <= 11) {
		spectralClass = subDwarf ? "G" : "F"
	} else if (spectralRoll === 12) {
		spectralRoll = DICE.rollDice({ rng, count: 2, sides: 6 })
		if (spectralRoll <= 9 && !subDwarf) {
			spectralClass = "A"
		} else if (spectralRoll <= 11 || subGiant) {
			spectralClass = "B"
		} else {
			spectralClass = "O"
		}
	}
	let subtype = rng.randint(0, 9)
	if (spectralClass === "K" && subtype > 4) subtype -= 5
	return { spectralClass, luminosityClass, subtype }
}

/** Spectral-class hotness order for the book's Random-method demotion rule
 * ("if the new star result is hotter than the primary, treat as Lesser
 * instead") -- O is hottest, M coolest; within a class, lower subtype is
 * hotter. Exotic (non-main-sequence) classes have no comparable position on
 * this ladder, so callers skip the comparison entirely for post-stellar
 * parents rather than routing through here. */
function isHotterThanParent(
	candidate: { spectralClass: MainSequenceClass; subtype: number },
	parent: { spectralClass: SpectralClass; subtype: number },
): boolean {
	const parentIndex = (mainSequenceClasses as readonly string[]).indexOf(
		parent.spectralClass,
	)
	if (parentIndex === -1) return false
	const candidateIndex = mainSequenceClasses.indexOf(candidate.spectralClass)
	if (candidateIndex !== parentIndex) return candidateIndex < parentIndex
	return candidate.subtype < parent.subtype
}

// Same mass formula rollStarAttributes uses for an ordinary (non-exotic)
// star -- rollUnconstrainedStarType only ever returns a regular O-M class,
// never D/NS/BH/brown dwarf, so none of rollStarAttributes' other mass
// branches apply here. See resolveCompanionType's Random-vs-parent mass
// check for why this needs to be the real mass, not a luminosity-class
// ordering guess.
function estimateMainSequenceMassSol({
	spectralClass,
	luminosityClass,
	subtype,
}: {
	spectralClass: MainSequenceClass
	luminosityClass: LuminosityClass
	subtype: number
}): number {
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
	return fullInterpolateSeries(
		idx,
		starMassByLuminosityClass[physicalLuminosityClass],
		domainLength,
	)
}

const isPostStellar = (spectralClass: SpectralClass): boolean =>
	spectralClass === "D" || spectralClass === "NS" || spectralClass === "BH"

// Cooler-direction ordering for brown dwarf siblings -- these fall outside
// mainSequenceClasses entirely, so applySibling's ordinary O-M class-step
// logic can't index into it for them (brown dwarf parents are always
// forced to the Sibling method -- see resolveCompanionType -- so this is
// reachable on every such roll, not just an edge case).
const BROWN_DWARF_CLASSES = ["L", "T", "Y"] as const

// Minimums post-stellar Sibling results must not shrink past ("do not
// reduce size past minimums for that type of object") -- derived from each
// roller's own formula floor just below (whiteDwarfRoll/neutronStarRoll's
// smallest possible dice.rollDice/randint outcome).
const POST_STELLAR_MIN_MASS_SOL: Record<"D" | "NS" | "BH", number> = {
	D: 0.11,
	NS: 1.1,
	BH: 2.2,
}

/**
 * The Non-Primary Star Determination table's 2D+DM roll: which of
 * Random/Lesser/Sibling/Twin/Other applies, keyed by column (Secondary for
 * this codebase's inner/outer/distant StarRoles, Companion for epistellar,
 * Post-Stellar whenever the parent is D/NS/BH regardless of role). The
 * printed table has a fourth column, literally named "Other" (D-star, D, or
 * BD across all eleven rows, see NON_PRIMARY_OTHER_COLUMN) -- "Other: Roll
 * again on the other column" (p. 30) means a fresh 2D+DM roll resolved
 * against THAT column, not a swap between Secondary and Companion. [Bug fix]
 * this used to swap Secondary<->Companion instead, which could only ever
 * land back on rows 0-1 (the only rows either of those columns can produce
 * "other" from), so the Other column's own BD entries at rows 6-10 were
 * unreachable dead code -- no companion star could ever roll a fresh L/T/Y
 * brown dwarf this way. A single extra roll always resolves it now, since
 * the Other column has no "other" outcome of its own to chain into.
 */
const NON_PRIMARY_TABLE: Record<
	"secondary" | "companion" | "post-stellar",
	readonly ("other" | "random" | "lesser" | "sibling" | "twin")[]
> = {
	// rows: 2-, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12+
	secondary: [
		"other",
		"other",
		"random",
		"random",
		"random",
		"lesser",
		"lesser",
		"sibling",
		"sibling",
		"twin",
		"twin",
	],
	companion: [
		"other",
		"other",
		"random",
		"random",
		"lesser",
		"lesser",
		"sibling",
		"sibling",
		"twin",
		"twin",
		"twin",
	],
	"post-stellar": [
		"other",
		"other",
		"random",
		"random",
		"random",
		"random",
		"random",
		"lesser",
		"lesser",
		"twin",
		"twin",
	],
}
const NON_PRIMARY_OTHER_COLUMN: readonly ("D*" | "D" | "BD")[] = [
	"D*",
	"D",
	"D",
	"D",
	"D",
	"D",
	"BD",
	"BD",
	"BD",
	"BD",
	"BD",
]

function nonPrimaryRowIndex(roll: number): number {
	if (roll <= 2) return 0
	if (roll >= 12) return 10
	return roll - 2
}

function rollNonPrimaryMethod(
	rng: SharedRng,
	column: NonPrimaryStarColumn | "post-stellar",
	dm: number,
): NonPrimaryStarMethod {
	const roll = DICE.roll2d6(rng) + dm
	const rowIndex = nonPrimaryRowIndex(roll)
	const result = NON_PRIMARY_TABLE[column][rowIndex]!
	if (result !== "other") return result
	const otherRoll = DICE.roll2d6(rng) + dm
	const otherRowIndex = nonPrimaryRowIndex(otherRoll)
	return { exotic: NON_PRIMARY_OTHER_COLUMN[otherRowIndex]! }
}

interface ResolvedCompanionType {
	spectralClass: SpectralClass
	luminosityClass: LuminosityClass
	subtype: number
	/** Post-stellar Sibling/Twin bypass the ordinary mass roller entirely --
	 * their mass is defined relative to the parent's, not rolled fresh. */
	massSolOverride?: number
	/** Main-sequence Twin's "optional -1D-1%" mass/diameter jitter, applied
	 * on top of the ordinary interpolated mass/diameter (only set when
	 * massSolOverride isn't -- the two are mutually exclusive). */
	massJitterFactor?: number
}

/** Lesser: same class, one type cooler, subtype rerolled. The lesser of an
 * M-type is another M-type (rerolled subtype); if that reroll comes out
 * COOLER than the parent's own subtype (a higher subtype number -- see
 * applySibling's own G8+3->K1 worked example for why higher subtype means
 * cooler, not hotter), it demotes to a brown dwarf instead -- book's own
 * literal condition (p. 29), [Bug fix] previously inverted (checked hotter,
 * not cooler), which let this "Lesser" come out hotter and more massive
 * than the parent it was supposed to be lesser than. Class IV (subgiant)
 * lesser results that would be too cool for Class IV fall back to an
 * ordinary Class V lesser. Post-stellar chain: BH -> NS -> WD -> BD. */
function applyLesser(
	rng: SharedRng,
	parent: ParentStarLike,
): ResolvedCompanionType {
	if (parent.spectralClass === "BH") {
		return {
			spectralClass: "NS",
			luminosityClass: rollNeutronStarLuminosityClass(rng),
			subtype: rng.randint(0, 9),
		}
	}
	if (parent.spectralClass === "NS") {
		return {
			spectralClass: "D",
			luminosityClass: "V",
			subtype: rng.randint(0, 9),
		}
	}
	if (parent.spectralClass === "D") {
		return {
			spectralClass: rng.choice(["L", "T", "Y"] as const),
			luminosityClass: "V",
			subtype: rng.randint(0, 9),
		}
	}
	const parentIndex = mainSequenceClasses.indexOf(
		parent.spectralClass as MainSequenceClass,
	)
	const coolerIndex = Math.min(parentIndex + 1, mainSequenceClasses.length - 1)
	const spectralClass = mainSequenceClasses[coolerIndex]!
	const subtype = rng.randint(0, 9)
	// Book (p. 29): "The lesser of a M-type star is another M-type star, but
	// if this second star has a HIGHER subtype than its parent [i.e. cooler,
	// since subtype increases toward the next-cooler class -- see applySibling's
	// own G8+3->K1 worked example], it is a brown dwarf instead." [Bug fix]
	// this used to check `subtype < parent.subtype` (hotter, not cooler) --
	// inverted from the book's literal condition, which let a "Lesser" of an
	// M-class parent come out *hotter and more massive* than the parent it
	// was supposed to be lesser than.
	if (
		spectralClass === "M" &&
		parent.spectralClass === "M" &&
		subtype > parent.subtype
	) {
		return {
			spectralClass: rng.choice(["L", "T", "Y"] as const),
			luminosityClass: "V",
			subtype: rng.randint(0, 9),
		}
	}
	// Class IV lesser too cool for IV -> ordinary Class V lesser instead.
	const luminosityClass =
		parent.luminosityClass === "IV" ? "V" : parent.luminosityClass
	return { spectralClass, luminosityClass, subtype }
}

/** Sibling: subtype shifted by one roll of 1D; overflowing past 9 steps one
 * class cooler with the remainder (matches the book's own worked example:
 * G8 V + a roll of 3 becomes K1 V, not "G11 V" -- 8+3=11 overflows into K1,
 * despite the surrounding prose describing this as a subtraction). Post-
 * stellar sibling: same class, mass reduced by 1D x 10% of the parent's
 * mass, floored at POST_STELLAR_MIN_MASS_SOL. */
function applySibling(
	rng: SharedRng,
	parent: ParentStarLike,
): ResolvedCompanionType {
	if (isPostStellar(parent.spectralClass)) {
		const reduction = DICE.rollDice({ rng, count: 1, sides: 6 }) * 0.1
		const massSolOverride = Math.max(
			parent.massSol * (1 - reduction),
			POST_STELLAR_MIN_MASS_SOL[parent.spectralClass as "D" | "NS" | "BH"],
		)
		return {
			spectralClass: parent.spectralClass,
			luminosityClass: parent.luminosityClass,
			subtype: parent.subtype,
			massSolOverride,
		}
	}
	if (isBrownDwarf(parent.spectralClass)) {
		let subtype = parent.subtype + DICE.rollDice({ rng, count: 1, sides: 6 })
		let classIndex = BROWN_DWARF_CLASSES.indexOf(
			parent.spectralClass as (typeof BROWN_DWARF_CLASSES)[number],
		)
		if (subtype > 9) {
			subtype -= 10
			classIndex = Math.min(classIndex + 1, BROWN_DWARF_CLASSES.length - 1)
		}
		return {
			spectralClass: BROWN_DWARF_CLASSES[classIndex]!,
			luminosityClass: "V",
			subtype,
		}
	}
	let subtype = parent.subtype + DICE.rollDice({ rng, count: 1, sides: 6 })
	let classIndex = mainSequenceClasses.indexOf(
		parent.spectralClass as MainSequenceClass,
	)
	if (subtype > 9) {
		subtype -= 10
		classIndex = Math.min(classIndex + 1, mainSequenceClasses.length - 1)
	}
	return {
		spectralClass: mainSequenceClasses[classIndex]!,
		luminosityClass: parent.luminosityClass,
		subtype,
	}
}

/** Twin: same class/type/subtype as the parent, with an optional -1D-1%
 * jitter on mass/diameter ("Optional subtract 1D-1% from the mass and
 * diameter of the new star to allow for some variation" -- 1D rolled here
 * as a 0-5% reduction). */
function applyTwin(
	rng: SharedRng,
	parent: ParentStarLike,
): ResolvedCompanionType {
	const jitterFactor =
		1 - (DICE.rollDice({ rng, count: 1, sides: 6 }) - 1) * 0.01
	const base = {
		spectralClass: parent.spectralClass,
		luminosityClass: parent.luminosityClass,
		subtype: parent.subtype,
	}
	return isPostStellar(parent.spectralClass)
		? { ...base, massSolOverride: parent.massSol * jitterFactor }
		: { ...base, massJitterFactor: jitterFactor }
}

/** Brown dwarfs "may only have additional 'stars' of the same type; all
 * brown dwarfs use the sibling result" -- forces Sibling ahead of any table
 * roll, skipping the 2D entirely. */
function resolveCompanionTypeOnce(
	rng: SharedRng,
	parent: ParentStarLike,
	column: NonPrimaryStarColumn,
): ResolvedCompanionType {
	const postStellarParent = isPostStellar(parent.spectralClass)
	// Class III/IV primary (here: the immediate parent, treated as "primary"
	// for typing purposes per the book) applies DM-1 to every column.
	const dm =
		parent.luminosityClass === "III" || parent.luminosityClass === "IV" ? -1 : 0
	const method: NonPrimaryStarMethod = isBrownDwarf(parent.spectralClass)
		? "sibling"
		: rollNonPrimaryMethod(rng, postStellarParent ? "post-stellar" : column, dm)

	if (typeof method === "object") {
		if (method.exotic === "D*") {
			return {
				spectralClass: "NS",
				luminosityClass: rollNeutronStarLuminosityClass(rng),
				subtype: rng.randint(0, 9),
			}
		}
		if (method.exotic === "D") {
			return {
				spectralClass: "D",
				luminosityClass: "V",
				subtype: rng.randint(0, 9),
			}
		}
		return {
			spectralClass: rng.choice(["L", "T", "Y"] as const),
			luminosityClass: "V",
			subtype: rng.randint(0, 9),
		}
	}
	if (method === "twin") return applyTwin(rng, parent)
	if (method === "sibling") return applySibling(rng, parent)
	if (method === "lesser") return applyLesser(rng, parent)

	// Random: roll on the regular (unconstrained) Star Type Determination
	// table; demote to Lesser if the result comes out hotter than the
	// parent. Post-stellar parents have no comparable position on the
	// hotness ladder, so the demotion check is skipped for them entirely --
	// their Random result stands as an ordinary, independently-typed star.
	const rolled = rollUnconstrainedStarType(rng, false)
	// [DEVIATION] The book's own literal check here is "hotter type/subtype"
	// only -- but that compares temperature, not mass, and rollUnconstrained
	// StarType's own giant sub-roll (~8% of Random results) can independently
	// produce a giant/subgiant luminosity class regardless of spectral
	// class/subtype. A same-or-cooler-spectral-type giant can still be
	// dramatically MORE massive than a main-sequence parent (e.g. an M-type
	// giant outmasses a K-type dwarf), which silently violates the book's own
	// stated "key premise" for this whole table: "the primary star is the
	// most massive... the companion of any [star] is assumed to be less
	// massive than its parent" (p. 29). Checked directly against mass, not
	// reconstructed from luminosity-class ordering, so it's exact regardless
	// of which spectral/luminosity combination produced the excess.
	const isMoreMassiveThanParent =
		!postStellarParent && estimateMainSequenceMassSol(rolled) > parent.massSol
	if (
		!postStellarParent &&
		(isHotterThanParent(rolled, parent) || isMoreMassiveThanParent)
	) {
		return applyLesser(rng, parent)
	}
	return rolled
}

const MAX_MASS_SAFETY_RETRIES = 4

/** Book's own "key premise" for this whole table (p. 29): "the primary
 * star is the most massive... the companion of any [Close/Near/Far/
 * companion star] is assumed to be less massive than its parent." The
 * individual method formulas above (Random's hotter-only check; Lesser/
 * Sibling's M-class boundary handling) don't fully guarantee this on their
 * own even once each is itself book-correct -- e.g. a "Lesser" of an
 * M-class parent that rerolls hotter (not cooler) than the parent has
 * nowhere else in the book's own text to go, so it stays hotter and more
 * massive. This is the final backstop: retry the whole resolution a
 * bounded number of times if it still comes out more massive than the
 * parent, falling back to Lesser (which does at least normally step to a
 * cooler class) each retry. Skipped for a post-stellar parent or an exotic
 * (L/T/Y/D/NS/BH) result -- comparing mass across those regimes isn't what
 * this premise is about, and the book's own System Age Adjustment section
 * explicitly anticipates a post-stellar companion needing more mass than a
 * same-system primary would otherwise imply. */
function resolveCompanionType(
	rng: SharedRng,
	parent: ParentStarLike,
	column: NonPrimaryStarColumn,
): ResolvedCompanionType {
	const postStellarParent = isPostStellar(parent.spectralClass)
	let result = resolveCompanionTypeOnce(rng, parent, column)
	if (postStellarParent) return result
	for (let attempt = 0; attempt < MAX_MASS_SAFETY_RETRIES; attempt++) {
		const spectralClass = result.spectralClass
		if (!(mainSequenceClasses as readonly string[]).includes(spectralClass)) {
			return result
		}
		const massSol =
			result.massSolOverride ??
			estimateMainSequenceMassSol({
				spectralClass: spectralClass as MainSequenceClass,
				luminosityClass: result.luminosityClass,
				subtype: result.subtype,
			}) * (result.massJitterFactor ?? 1)
		if (massSol <= parent.massSol) return result
		result = applyLesser(rng, parent)
	}
	// Every retry still came out too massive -- most likely a parent already
	// sitting near the very bottom of the M-class mass range, where only a
	// couple of the ten possible fresh Lesser subtypes are actually light
	// enough. Force a brown dwarf rather than keep gambling on another
	// uniform reroll: it's guaranteed lighter than any M-class star, and the
	// book's own M-class Lesser rule already treats "cooler than M" as
	// exactly this outcome.
	return {
		spectralClass: rng.choice(["L", "T", "Y"] as const),
		luminosityClass: "V",
		subtype: rng.randint(0, 9),
	}
}

/** Independent post-death age progression for a companion that itself
 * resolved to a post-stellar class (D/NS/BH), mirroring the root primary's
 * own dead-star age bump below (progenitor main-sequence lifespan fraction
 * + post-death elapsed time). Needed so GALAXY_SYSTEMS' system-age-reset
 * pass -- mirroring the book's "if a new star is a post-stellar object but
 * the primary is a fusing star, the age of the entire stellar system could
 * be reset" rule -- has a real elapsed age to compare against the rest of
 * the system, instead of this companion just inheriting its parent's age
 * like every other (still-fusing) companion does. [DEVIATION] the book's
 * Referee-arbitrated fallback (reverse-engineering a larger post-stellar
 * mass when this age would exceed the *primary's own* main-sequence
 * lifespan, e.g. a young hot primary with an old white dwarf companion) has
 * no automated equivalent here -- GALAXY_SYSTEMS' post-pass only clamps to
 * the existing flat uniform(13, 14) ceiling below, so that specific
 * contradiction (a companion implying a system older than its own primary
 * could ever have lived) is accepted rather than resolved. */
function rollPostStellarCompanionAgeGyr(
	rng: SharedRng,
	massSol: number,
): number {
	const progenitorLifespanGyr = 10 / Math.max(massSol, 0.01) ** 2.5
	let ageGyr = progenitorLifespanGyr * rng.uniform(0.1, 0.9)
	ageGyr +=
		DICE.rollDice({ rng, count: 1, sides: 6 }) * 2 +
		DICE.rollDice({ rng, count: 2, sides: 3 }) * massSol -
		2 +
		rng.uniform(0.1, 0.9)
	if (ageGyr > 14) ageGyr = rng.uniform(13, 14)
	return ageGyr
}

/**
 * Ports galaxy-gen's rollStarAttributes (stars/generation.ts) for the root
 * primary path unchanged (giant/subgiant/subdwarf/supergiant ladder, the 5%
 * root-only exotic branch, the full age roll including giant/subgiant
 * lifespans and the young-star override), and replaces the companion path
 * with the Traveller Non-Primary Star Determination table (see
 * resolveCompanionType and its helpers above) in place of the previous
 * "always one class cooler than parent" approximation. `column` selects
 * Secondary vs. Companion for that table and is only meaningful when
 * `parent` is set (GALAXY_SYSTEMS passes it based on StarRole; the
 * post-stellar column is chosen automatically whenever the parent is
 * D/NS/BH, regardless of what's passed). Companion-orbit eccentricity is
 * rolled separately by GALAXY_SYSTEMS, where parent/role information is
 * available and the galaxy-gen star-companion modifier applies.
 */
export function rollStarAttributes(
	rng: SharedRng,
	parent?: ParentStarLike,
	homeworld?: boolean,
	column: NonPrimaryStarColumn = "secondary",
): RolledStarAttributes {
	let spectralClass: SpectralClass
	let luminosityClass: LuminosityClass
	let subtype: number
	let massSolOverride: number | undefined
	let massJitterFactor: number | undefined

	if (parent) {
		const resolved = resolveCompanionType(rng, parent, column)
		spectralClass = resolved.spectralClass
		luminosityClass = resolved.luminosityClass
		subtype = resolved.subtype
		massSolOverride = resolved.massSolOverride
		massJitterFactor = resolved.massJitterFactor
	} else {
		const rolled = rollUnconstrainedStarType(rng, homeworld ?? false)
		spectralClass = rolled.spectralClass
		luminosityClass = rolled.luminosityClass
		subtype = rolled.subtype
		if (rng.random() > 0.95 && !homeworld) {
			spectralClass =
				rng.weightedChoice([
					// [Bug fix] this used to be a single `{ v: rng.choice(["L",
					// "T"]), w: 0.1 }` entry -- rng.choice was evaluated once at
					// array-construction time, so its result was fixed before
					// weightedChoice ever ran, and "Y" was never actually a
					// reachable candidate despite the (stale) comment here
					// claiming it had been added. Split into three real
					// candidates, each getting an equal share of the same 0.1
					// total weight the brown-dwarf tail always had, matching the
					// companion Other-column exotic branch (resolveCompanionType
					// above), which already draws evenly from all three.
					{ v: "L" as const, w: 0.1 / 3 },
					{ v: "T" as const, w: 0.1 / 3 },
					{ v: "Y" as const, w: 0.1 / 3 },
					{ v: "D" as const, w: 0.5 },
					{ v: "NS" as const, w: 0.1 },
					{ v: "BH" as const, w: 0.1 },
				]) ?? "D"
			luminosityClass =
				spectralClass === "NS" ? rollNeutronStarLuminosityClass(rng) : "V"
			subtype = rng.randint(0, 9)
		}
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

	const massSol =
		massSolOverride ??
		(whiteDwarf
			? whiteDwarfRoll.massSol(rng, parent?.massSol)
			: neutronStar
				? neutronStarRoll.massSol(rng)
				: blackHole
					? blackHoleRoll.massSol(rng)
					: fullInterpolateSeries(
							idx,
							starMassByLuminosityClass[physicalLuminosityClass],
							domainLength,
						) * (massJitterFactor ?? 1))
	const temperatureK = whiteDwarf
		? whiteDwarfRoll.temperatureK(rng, massSol)
		: neutronStar
			? neutronStarRoll.temperatureK(rng, massSol)
			: blackHole
				? blackHoleRoll.temperatureK()
				: fullInterpolateSeries(idx, starTempFull, domainLength)
	const diameterSol =
		(whiteDwarf
			? whiteDwarfRoll.diameterSol(massSol)
			: neutronStar
				? neutronStarRoll.diameterSol(rng)
				: blackHole
					? blackHoleRoll.diameterSol(rng, massSol)
					: fullInterpolateSeries(
							idx,
							starDiameterByLuminosityClass[physicalLuminosityClass],
							domainLength,
						)) * (massSolOverride === undefined ? (massJitterFactor ?? 1) : 1)
	const luminositySol = blackHole
		? blackHoleRoll.luminositySol(rng)
		: diameterSol ** 2 * (temperatureK / 5772) ** 4

	// A black hole's own accretion disk (diameterSol, in solar diameters) can
	// physically extend well past the flat 0.001 floor white dwarfs/neutron
	// stars use -- e.g. a near-minimum-mass hole with a large diameter roll
	// can reach ~0.05 AU, comfortably inside where a planet could otherwise
	// land. MAO takes whichever is larger so a planet orbit is never placed
	// inside the visible disk itself.
	const blackHoleDiskRadiusAU =
		(diameterSol * ORBIT_BODY.solarDiameterKm * 1000) /
		ORBIT_BODY.astronomicalUnitM /
		2
	const mao = brownDwarf
		? 0.005
		: whiteDwarf || neutronStar
			? 0.001
			: blackHole
				? Math.max(blackHoleDiskRadiusAU, 0.001)
				: fullInterpolateSeries(
						idx,
						starMAOByLuminosityClass[physicalLuminosityClass],
						COMPACT_STAR_DOMAIN_LENGTH,
					)

	const deadStar = whiteDwarf || neutronStar || blackHole
	let ageGyr = parent?.ageGyr ?? 0
	if (parent && deadStar) {
		// A companion that resolved to post-stellar gets its own elapsed age
		// instead of inheriting the parent's -- see
		// rollPostStellarCompanionAgeGyr's doc comment and the [DEVIATION]
		// note there. Every other companion result (including a protostar
		// parent's -- see the plan's "protostar/primordial interaction"
		// section: sharing ageGyr verbatim is exactly what keeps a
		// protostar's companions proto-aged too) keeps copying parent.ageGyr
		// via the initialization above.
		ageGyr = rollPostStellarCompanionAgeGyr(rng, massSol)
	}
	if (!parent) {
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
		// [DEVIATION] galaxy-gen (and the block above) ties age entirely to a
		// fraction of the star's own main-sequence lifespan, so only short-lived
		// massive stars (upper-B/O, lifespan under ~0.1 Gyr) can ever roll young
		// enough for proto/primordial (see body/index.ts's proto/primordial
		// derivation) -- a G/K/M dwarf's multi-Gyr lifespan puts every possible
		// age roll for it far above the 0.1 Gyr primordial threshold, no matter
		// the dice. In reality a star's age reflects when it formed, not how
		// long it will eventually live, so any non-evolved, non-dead star gets
		// an independent chance here to be freshly formed regardless of mass.
		// Skipped for giants/subgiants (already evolved, can't be freshly
		// formed) and dead stars (already bumped older just above).
		if (
			!deadStar &&
			(luminosityClass === "V" || luminosityClass === "VI") &&
			rng.random() < YOUNG_STAR_CHANCE
		) {
			ageGyr =
				rng.random() < YOUNG_STAR_PROTO_SHARE
					? rng.uniform(0, 0.01)
					: rng.uniform(0.01, 0.1)
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
			values: starTempFull,
		})
	},

	getStarDiameterSol({ cls, subtype }: StarSpectralInput): number {
		return interpolateSeries({
			position: getStarSpectralPosition({ cls, subtype }),
			values: starDiameterByLuminosityClass.V,
		})
	},

	getStarLuminositySol({ cls, subtype }: StarSpectralInput): number {
		const d = STAR.getStarDiameterSol({ cls, subtype })
		const t = STAR.getStarTemperatureK({ cls, subtype })
		return d * d * Math.pow(t / T_SUN_K, 4)
	},

	// Same physics as getStarLuminositySol, but usable for any SpectralClass
	// (including brown dwarfs) instead of only the seven main-sequence
	// classes -- see getExtendedStarSpectralPosition's doc for why that
	// matters: a naive isValidSpectralClass(cls) ? cls : defaultSpectralClass
	// coercion before calling getStarLuminositySol silently substitutes a
	// Sun-like G star's luminosity for a Y-dwarf's, which is many orders of
	// magnitude too bright and makes every orbiting body's temperature/
	// texture/biosphere compute as if it were warm.
	getStarLuminositySolExtended({
		cls,
		subtype,
	}: {
		cls: SpectralClass
		subtype: number
	}): number {
		const position = getExtendedStarSpectralPosition({ cls, subtype })
		const d = interpolateSeries({
			position,
			values: starDiameterByLuminosityClass.V,
		})
		const t = interpolateSeries({ position, values: starTempFull })
		return d * d * Math.pow(t / T_SUN_K, 4)
	},

	getStarMassSol({ cls, subtype }: StarSpectralInput): number {
		return interpolateSeries({
			position: getStarSpectralPosition({ cls, subtype }),
			values: starMassByLuminosityClass.V,
		})
	},

	getStarMAO({ cls, subtype }: StarSpectralInput): number {
		return interpolateSeries({
			position: getStarSpectralPosition({ cls, subtype }),
			values: starMAOByLuminosityClass.V,
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
	isPostStellar,
	isProto({ ageGyr, massSol }: StarProtoInput): boolean {
		return ageGyr < 0.01 && massSol < 8
	},
	isPrimordial({ ageGyr }: StarPrimordialInput): boolean {
		return ageGyr < 0.1
	},
	isPulsar,
	isMagnetar,
	getNeutronStarColor,
	rollStarAttributes,
}
