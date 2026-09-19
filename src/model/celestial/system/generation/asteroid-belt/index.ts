import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import { STAR } from "@/model/celestial/star"
import type {
	BeltCrossingInput,
	CrossesAnyBeltInput,
	RollBeltBulkInput,
	RollBeltCompositionInput,
	RollBeltProfileInput,
	RollBeltResourceRatingInput,
	RollBeltSpanOrbitNumberInput,
} from "@/model/celestial/system/generation/asteroid-belt/types"
import type {
	BeltComposition,
	BeltProfile,
} from "@/model/celestial/system/types"
import { DICE } from "@/model/shared/random/dice"
import { RNG } from "@/model/shared/random/rng"

// Book's Belt Span (p. 73): Spread x (2D+DMs) / 10, using the system's own
// spread value where the Stage 8 walk supplied one, otherwise the book's own
// substitute (2D x 0.1 Orbit#). DM-1 for an adjacent gas giant (its clearing
// narrows the belt), DM+3 for the system's outermost slot (Kuiper/scattered-
// disk-style sprawl).
function _rollSpanOrbitNumber({
	rng,
	spreadOrbitNumber,
	hasAdjacentGasGiant,
	isOutermostOrbitSlot,
	primordial = false,
}: RollBeltSpanOrbitNumberInput): number {
	const spread = spreadOrbitNumber ?? DICE.roll2d6(rng) * 0.1
	const dm = (hasAdjacentGasGiant ? -1 : 0) + (isOutermostOrbitSlot ? 3 : 0)
	const span = spread * ((DICE.roll2d6(rng) + dm) * 0.1)
	// Book p. 226: "all planetoid belt spans are doubled and may overlap
	// other planetary or planetoid belt orbits" in a primordial system --
	// the overlap clause needs no separate mechanic, since the existing
	// belt-crossing check (crossesAnyBelt below) already reacts to whatever
	// span a belt reports.
	return primordial ? span * 2 : span
}

const oneD5 = (rng: ReturnType<typeof RNG.createRng>) => rng.randint(1, 6) * 5
const oneD = (rng: ReturnType<typeof RNG.createRng>) => rng.randint(1, 6)

// Book's Belt Composition Percentages table (p. 74), verbatim -- each column
// (m-type/s-type/c-type) rolls its own independent dice, not a shared roll
// split three ways. Indexed 0 ("0-") through 12 ("12+") by a 2D+DM roll,
// clamped at both ends.
const BELT_COMPOSITION_TABLE: {
	m: (rng: ReturnType<typeof RNG.createRng>) => number
	s: (rng: ReturnType<typeof RNG.createRng>) => number
	c: (rng: ReturnType<typeof RNG.createRng>) => number
}[] = [
	{ m: (rng) => 60 + oneD5(rng), s: (rng) => oneD5(rng), c: () => 0 },
	{
		m: (rng) => 50 + oneD5(rng),
		s: (rng) => 5 + oneD5(rng),
		c: (rng) => DICE.rollD3(rng),
	},
	{
		m: (rng) => 40 + oneD5(rng),
		s: (rng) => 15 + oneD5(rng),
		c: (rng) => oneD(rng),
	},
	{
		m: (rng) => 25 + oneD5(rng),
		s: (rng) => 30 + oneD5(rng),
		c: (rng) => oneD(rng),
	},
	{
		m: (rng) => 15 + oneD5(rng),
		s: (rng) => 35 + oneD5(rng),
		c: (rng) => 5 + oneD(rng),
	},
	{
		m: (rng) => 5 + oneD5(rng),
		s: (rng) => 40 + oneD5(rng),
		c: (rng) => 5 + oneD(rng) * 2,
	},
	{
		m: (rng) => oneD5(rng),
		s: (rng) => 40 + oneD5(rng),
		c: (rng) => oneD5(rng),
	},
	{
		m: (rng) => 5 + oneD(rng) * 2,
		s: (rng) => 35 + oneD5(rng),
		c: (rng) => 10 + oneD5(rng),
	},
	{
		m: (rng) => 5 + oneD(rng),
		s: (rng) => 30 + oneD5(rng),
		c: (rng) => 20 + oneD5(rng),
	},
	{
		m: (rng) => oneD(rng),
		s: (rng) => 15 + oneD5(rng),
		c: (rng) => 40 + oneD5(rng),
	},
	{
		m: (rng) => oneD(rng),
		s: (rng) => 5 + oneD5(rng),
		c: (rng) => 50 + oneD5(rng),
	},
	{
		m: (rng) => DICE.rollD3(rng),
		s: (rng) => 5 + oneD(rng) * 2,
		c: (rng) => 60 + oneD5(rng),
	},
	{ m: () => 0, s: (rng) => oneD(rng), c: (rng) => 70 + oneD5(rng) },
]

// Book's Belt Composition (p. 74): a belt inside its star's HZCO has DM-4
// (few icy c-type bodies survive that close), one beyond HZCO+2 has DM+4
// (c-type predominates in the outer system).
function _rollComposition({
	rng,
	orbitNumber,
	hzcoOrbitNumber,
}: RollBeltCompositionInput): BeltComposition {
	const dm =
		orbitNumber < hzcoOrbitNumber
			? -4
			: orbitNumber > hzcoOrbitNumber + 2
				? 4
				: 0
	const rowIndex = Math.min(12, Math.max(0, DICE.roll2d6(rng) + dm))
	const row = BELT_COMPOSITION_TABLE[rowIndex]!
	let mTypePct = row.m(rng)
	let sTypePct = row.s(rng)
	const cTypePct = row.c(rng)

	// "If the total of m-, s-, and t-types exceed 100%, remove any excess %
	// first from m-type, then from s-type."
	let excess = mTypePct + sTypePct + cTypePct - 100
	if (excess > 0) {
		const takenFromM = Math.min(mTypePct, excess)
		mTypePct -= takenFromM
		excess -= takenFromM
		sTypePct -= Math.min(sTypePct, excess)
	}
	const otherPct = Math.max(0, 100 - (mTypePct + sTypePct + cTypePct))
	return { mTypePct, sTypePct, cTypePct, otherPct }
}

// Book's Belt Bulk (p. 73): 2D, -1 per 2 Gyr of system age (older belts have
// been depleted by ejection/collision), +1 per 10% c-type composition
// (icier belts retain more bulk). Never less than 1.
function _rollBulk({ rng, starAgeGyr, cTypePct }: RollBeltBulkInput): number {
	const ageDM = -Math.floor(starAgeGyr / 2)
	const compositionDM = Math.floor(cTypePct / 10)
	return Math.max(1, DICE.roll2d6(rng) + ageDM + compositionDM)
}

// Book's Belt Resource Rating (p. 73): 2D-7, +bulk, +1 per 10% m-type
// (metals are valuable), -1 per 10% c-type (ice is comparatively cheap).
// Clamped to 2-12 -- belts always have some resources, and 12 is the book's
// own cap. The book's further industrial-exploitation reduction (inhabited
// system, trade code, TL8+) is skipped: this codebase's system generation
// has no trade-code/TL model at this stage to key it off.
function _rollResourceRating({
	rng,
	bulk,
	mTypePct,
	cTypePct,
}: RollBeltResourceRatingInput): number {
	const mDM = Math.floor(mTypePct / 10)
	const cDM = -Math.ceil(cTypePct / 10)
	const rating = DICE.roll2d6(rng) - 7 + bulk + mDM + cDM
	return Math.min(12, Math.max(2, rating))
}

// World Builder's Handbook pp. 72-75's full Planetoid Belt Characteristics,
// rolled together in the book's own order (span, then composition, since
// bulk and resource rating both depend on composition).
function rollProfile({
	rng,
	orbitalDistanceAU,
	luminositySol,
	starAgeGyr,
	spreadOrbitNumber,
	hasAdjacentGasGiant,
	isOutermostOrbitSlot,
	primordial,
}: RollBeltProfileInput): BeltProfile {
	const orbitNumber = ORBIT_BODY.auToOrbitNumber({ au: orbitalDistanceAU })
	const hzcoOrbitNumber = ORBIT_BODY.auToOrbitNumber({
		au: STAR.getHabitableZoneAU(luminositySol),
	})
	const composition = _rollComposition({ rng, orbitNumber, hzcoOrbitNumber })
	const bulk = _rollBulk({ rng, starAgeGyr, cTypePct: composition.cTypePct })
	return {
		spanOrbitNumber: _rollSpanOrbitNumber({
			rng,
			spreadOrbitNumber,
			hasAdjacentGasGiant,
			isOutermostOrbitSlot,
			primordial,
		}),
		composition,
		bulk,
		resourceRating: _rollResourceRating({
			rng,
			bulk,
			mTypePct: composition.mTypePct,
			cTypePct: composition.cTypePct,
		}),
	}
}

// A belt's occupied AU range: p. 73's Belt Span, centred on the belt's own
// orbitalDistanceAU, converted through the shared Orbit# table (which is
// where the belt's actual physical width in AU comes from -- span itself is
// stored in Orbit# units, see BeltProfile.spanOrbitNumber).
function _beltAURange({
	orbitalDistanceAU,
	spanOrbitNumber,
}: BeltCrossingInput): { minAU: number; maxAU: number } {
	const beltOrbitNumber = ORBIT_BODY.auToOrbitNumber({ au: orbitalDistanceAU })
	const halfSpan = spanOrbitNumber / 2
	return {
		minAU: ORBIT_BODY.orbitNumberToAU({
			orbitNumber: Math.max(0, beltOrbitNumber - halfSpan),
		}),
		maxAU: ORBIT_BODY.orbitNumberToAU({
			orbitNumber: beltOrbitNumber + halfSpan,
		}),
	}
}

// True when this body's own perihelion-aphelion range (from its
// orbitalDistanceAU/eccentricity) overlaps any belt's occupied AU range.
// Unlike two planet-mass bodies (where the book's own Step 9 notes a
// resonance typically keeps a "crossing" pair from ever actually colliding,
// e.g. real Neptune/Pluto), a belt is a diffuse swarm spread across its
// whole span rather than one body in a resonant lock -- there's no single
// resonance that protects a crossing body from all of it at once, so this is
// a meaningfully different, real hazard signal.
function crossesAnyBelt({
	bodyOrbitalDistanceAU,
	bodyEccentricity,
	belts,
}: CrossesAnyBeltInput): boolean {
	const perihelionAU = bodyOrbitalDistanceAU * (1 - bodyEccentricity)
	const aphelionAU = bodyOrbitalDistanceAU * (1 + bodyEccentricity)
	return belts.some((belt) => {
		const { minAU, maxAU } = _beltAURange(belt)
		return maxAU >= perihelionAU && minAU <= aphelionAU
	})
}

export const ASTEROID_BELT = {
	rollProfile,
	crossesAnyBelt,
}
