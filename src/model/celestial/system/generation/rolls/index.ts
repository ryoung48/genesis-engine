import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type { OrbitGroup } from "@/model/celestial/orbit-body/types"
import type { Zone } from "@/model/celestial/planet/types"
import { STAR } from "@/model/celestial/star"
import type {
	PickDensityEarthRelativeInput,
	RollAnomalousInclinationDegInput,
	RollEccentricityInput,
	RollPlanetRingsInput,
	RollTerrestrialCompositionInput,
	TerrestrialCompositionCategory,
} from "@/model/celestial/system/generation/rolls/types"
import type { RingProfile } from "@/model/celestial/system/types"
import { DICE } from "@/model/shared/random/dice"
import { RNG } from "@/model/shared/random/rng"

// Ported from galaxy-gen's ORBIT.spawn group weightedChoice + star-age
// overrides (orbits/index.ts) -- dwarf and helian weights are fixed
// regardless of zone (galaxy-gen never varies them), asteroid-belt/
// terrestrial/jovian vary only by a binary zone split (inner vs. not, outer
// vs. not), not three distinct per-zone tables. proto/primordial (young-star
// protoplanetary-disk-age) boost the asteroid-belt weight the same way
// postStellar does -- see body/index.ts's inline derivation (starAgeGyr<0.01
// && starMassSol<8 for proto, starAgeGyr<0.1 for primordial) and
// environment/index.ts's matching hydrosphere/atmosphere youth override.
function rollOrbitGroup({
	rng,
	zone,
	postStellar,
	starAgeGyr,
	proto,
	primordial,
}: {
	rng: ReturnType<typeof RNG.createRng>
	zone: Zone
	/** True for a spectralClass "D"/"NS"/"BH" host star -- a dead/degenerate
	 * remnant, same condition as generateSystemBodies' own `deadStar`. */
	postStellar: boolean
	starAgeGyr: number
	/** starAgeGyr<0.01 && starMassSol<8 -- see body/index.ts. */
	proto?: boolean
	/** starAgeGyr<0.1 -- see body/index.ts. */
	primordial?: boolean
}): OrbitGroup {
	const weights: Record<OrbitGroup, number> = {
		"asteroid belt": proto
			? 6
			: primordial || postStellar
				? 4
				: zone === "inner"
					? 1
					: 2,
		dwarf: 2,
		terrestrial: zone === "inner" ? 3 : 2,
		helian: 1,
		jovian: zone === "outer" || postStellar ? 2 : 0.5,
	}
	const total = Object.values(weights).reduce((sum, value) => sum + value, 0)
	let roll = rng.uniform(0, total)
	let selected: OrbitGroup = "dwarf"
	for (const group of [
		"asteroid belt",
		"dwarf",
		"terrestrial",
		"helian",
		"jovian",
	] as const) {
		roll -= weights[group]
		if (roll <= 0) {
			selected = group
			break
		}
	}
	if (starAgeGyr < 0.002 && selected !== "jovian") return "asteroid belt"
	if (
		starAgeGyr < 0.005 &&
		(selected === "terrestrial" || selected === "helian")
	) {
		return "dwarf"
	}
	if (starAgeGyr < 0.011 && selected === "helian") {
		return rng.choice(["terrestrial", "dwarf"])
	}
	return selected
}

// Same dwarf/terrestrial/helian relative weights rollOrbitGroup already
// used for these three groups (terrestrial favored in the inner zone) --
// scoped to just this three-way split since Stage 8 (galaxy/systems/
// index.ts) now decides gas-giant/belt/terrestrial counts itself from the
// book's own World Types and Quantities roll; this only resolves what kind
// of rocky world a slot Stage 8 already booked as "terrestrial" turns out
// to be.
function rollTerrestrialSubgroup({
	rng,
	zone,
}: {
	rng: ReturnType<typeof RNG.createRng>
	zone: Zone
}): OrbitGroup {
	return (
		rng.weightedChoice([
			{ v: "dwarf" as const, w: 2 },
			{ v: "terrestrial" as const, w: zone === "inner" ? 3 : 2 },
			{ v: "helian" as const, w: 1 },
		]) ?? "terrestrial"
	)
}

function rollSizeClass({
	rng,
	group,
}: {
	rng: ReturnType<typeof RNG.createRng>
	group: OrbitGroup
}): number {
	if (group === "asteroid belt") return -1
	if (group === "dwarf") return rng.randint(0, 4)
	if (group === "terrestrial") return rng.randint(5, 10)
	if (group === "helian") return rng.randint(11, 15)
	return rng.randint(16, 18)
}

function rollDiameterKmFromSizeClass({
	rng,
	sizeClass,
}: {
	rng: ReturnType<typeof RNG.createRng>
	sizeClass: number
}): number {
	if (sizeClass < 0) return 0
	const [minKm, maxKm] = ORBIT_BODY.sizeClassToDiameterRangeKm({ sizeClass })
	return rng.uniform(minKm, maxKm)
}

// Book's Terrestrial Density table (p. 72), verbatim -- indexed by a plain
// 2D-2 roll (0-10) within whichever TerrestrialCompositionCategory
// rollTerrestrialComposition picks. No DMs; the book itself notes the
// Referee may interpolate linearly between values for extra variance.
const DENSITY_TABLE: Record<TerrestrialCompositionCategory, number[]> = {
	"Exotic Ice": [
		0.03, 0.06, 0.09, 0.12, 0.15, 0.18, 0.21, 0.24, 0.27, 0.3, 0.33,
	],
	"Mostly Ice": [
		0.18, 0.21, 0.24, 0.27, 0.3, 0.33, 0.36, 0.39, 0.41, 0.44, 0.47,
	],
	"Mostly Rock": [
		0.5, 0.53, 0.56, 0.59, 0.62, 0.65, 0.68, 0.71, 0.74, 0.77, 0.8,
	],
	"Rock and Metal": [
		0.82, 0.85, 0.88, 0.91, 0.94, 0.97, 1.0, 1.03, 1.06, 1.09, 1.12,
	],
	"Mostly Metal": [
		1.15, 1.18, 1.21, 1.24, 1.27, 1.3, 1.33, 1.36, 1.39, 1.42, 1.45,
	],
	"Compressed Metal": [
		1.5, 1.55, 1.6, 1.65, 1.7, 1.75, 1.8, 1.85, 1.9, 1.95, 2.0,
	],
}

// Book's Terrestrial Composition table (p. 71-72), verbatim: 2D + DMs for
// size (Size 0-4 -1, Size 6-9 +1, Size A-F, i.e. sizeClass 10-15, +3),
// position relative to HZCO (at/inside it +1; beyond it -1, and another -1
// per full Orbit# further out), and old systems (age > 10 Gyr, -1). This
// table -- not this codebase's own climate Classification -- is what
// actually determines a rocky body's composition/density in the book; the
// two are independent rolls on independent inputs.
function rollTerrestrialComposition({
	rng,
	sizeClass,
	orbitalDistanceAU,
	luminositySol,
	starAgeGyr,
}: RollTerrestrialCompositionInput): TerrestrialCompositionCategory {
	const sizeDM =
		sizeClass <= 4 ? -1 : sizeClass <= 5 ? 0 : sizeClass <= 9 ? 1 : 3
	const orbitNumber = ORBIT_BODY.auToOrbitNumber({ au: orbitalDistanceAU })
	const hzcOrbitNumber = ORBIT_BODY.auToOrbitNumber({
		au: STAR.getHabitableZoneAU(luminositySol),
	})
	const positionDM =
		orbitNumber <= hzcOrbitNumber
			? 1
			: -1 - Math.floor(orbitNumber - hzcOrbitNumber)
	const ageDM = starAgeGyr > 10 ? -1 : 0
	const roll = DICE.roll2d6(rng) + sizeDM + positionDM + ageDM
	if (roll <= -4) return "Exotic Ice"
	if (roll <= 2) return "Mostly Ice"
	if (roll <= 6) return "Mostly Rock"
	if (roll <= 11) return "Rock and Metal"
	if (roll <= 14) return "Mostly Metal"
	return "Compressed Metal"
}

function pickDensityEarthRelative({
	rng,
	group,
	classification,
	sizeClass,
	orbitalDistanceAU,
	luminositySol,
	starAgeGyr,
}: PickDensityEarthRelativeInput): number {
	if (group === "jovian" || classification === "chthonian") {
		return rng.uniform(0.08, 0.35)
	}
	const compositionCategory = rollTerrestrialComposition({
		rng,
		sizeClass,
		orbitalDistanceAU,
		luminositySol,
		starAgeGyr,
	})
	const densityRoll = DICE.roll2d6(rng) - 2
	return DENSITY_TABLE[compositionCategory][densityRoll]!
}

// Ported from galaxy-gen's MATH.orbits.eccentricity (orbits/index.ts), plus
// the book's own Eccentricity Values DM table (p. 27-28) for companion
// stars: DM+2 for any stellar orbit, DM+1 per star an object orbits beyond
// the first (starsOrbitedBeyondFirst), DM-1 for an old, tight-orbiting
// binary (oldTightOrbit). A planet has none of these DMs.
function rollEccentricity({
	rng,
	orbitKind,
	starsOrbitedBeyondFirst = 0,
	oldTightOrbit = false,
	anomalyEccentricityDM = 0,
}: RollEccentricityInput): number {
	const dm =
		(orbitKind === "companion-star" ? 2 : 0) +
		starsOrbitedBeyondFirst -
		(oldTightOrbit ? 1 : 0) +
		anomalyEccentricityDM
	const roll = DICE.roll2d6(rng) + dm
	if (roll <= 5) return 0
	if (roll <= 7) return rng.uniform(0.01, 0.03)
	if (roll <= 9) return rng.uniform(0.04, 0.09)
	if (roll <= 10) return rng.uniform(0.1, 0.35)
	if (roll <= 11) return rng.uniform(0.15, 0.65)
	return rng.uniform(0.4, 0.9)
}

// Book's Inclined Orbit procedure (p. 51): "Determine inclination by
// rolling 1D+2 x 10 degrees and possibly adding d10 for additional
// variance." Retrograde reuses this and adds 90 degrees (p. 51) -- see
// callers.
function rollAnomalousInclinationDeg({
	rng,
}: RollAnomalousInclinationDegInput): number {
	return (rng.randint(1, 6) + 2) * 10 + rng.randint(0, 9)
}

// Ported from galaxy-gen's MATH.tilt.compute (non-homeworld branch).
function rollAxialTiltDeg(rng: ReturnType<typeof RNG.createRng>): number {
	const standard = DICE.roll2d6(rng)
	if (standard <= 4) return rng.uniform(0.01, 0.1)
	if (standard <= 5) return rng.uniform(0.2, 1.2)
	if (standard <= 6) return rng.uniform(1, 6)
	if (standard <= 7) return rng.uniform(7, 12)
	if (standard <= 9) return rng.uniform(10, 35)
	const extreme = rng.randint(1, 6)
	if (extreme <= 2) return rng.uniform(20, 70)
	if (extreme <= 4) return rng.uniform(40, 90)
	if (extreme <= 5) return rng.uniform(91, 126)
	return rng.uniform(144, 180)
}

// Ported from galaxy-gen's orbit.rings roll (orbits/index.ts). Jovians roll
// none/minor/complex rings; non-jovian planets, except dwarf planets and
// asteroid belts, have a deliberately rarer 1-in-100 chance of minor rings.
// The concrete geometry/color bands have no galaxy-gen equivalent (it only
// stores a flavor string, "none" / "minor" / "complex" -- rendering real
// geometry is this codebase's own addition); authored against Saturn's real
// values (sol-system.ts's SOL_PLANET_RINGS_BY_NAME: inner 1.52, outer 2.08,
// opacity 0.52) as an anchor for "complex", with "minor" scaled down to a
// fainter, narrower band.
const JOVIAN_RING_COLOR_CHOICES = [0xd8c69a, 0xcac2b0, 0xb8c4cf, 0xa89f8f]

function rollPlanetRings({
	rng,
	group,
}: RollPlanetRingsInput): RingProfile | undefined {
	if (group === "asteroid belt" || group === "dwarf") return undefined
	const tier =
		group === "jovian"
			? rng.weightedChoice([
					{ v: "none", w: 6 },
					{ v: "minor", w: 2 },
					{ v: "complex", w: 1 },
				] as const)
			: rng.randint(1, 100) === 1
				? "minor"
				: "none"
	if (!tier || tier === "none") return undefined
	const color = rng.choice(JOVIAN_RING_COLOR_CHOICES)
	const innerRadiusRelative = rng.uniform(1.3, 1.7)
	const outerRadiusRelative =
		innerRadiusRelative +
		(tier === "complex" ? rng.uniform(0.4, 0.7) : rng.uniform(0.15, 0.35))
	const opacity =
		tier === "complex" ? rng.uniform(0.35, 0.6) : rng.uniform(0.22, 0.35)
	return { innerRadiusRelative, outerRadiusRelative, color, opacity }
}

// Ported from galaxy-gen's ROTATION.get — the sidereal-day-length dice
// table, including its stellar-age modifier (older stars' systems roll
// slower base rotations), but without the tidal-lock cascade (locks/effect),
// since decorative siblings don't need the full lock simulation.
function rollSiderealDayHours({
	rng,
	isJovian,
	starAgeGyr,
}: {
	rng: ReturnType<typeof RNG.createRng>
	isJovian: boolean
	starAgeGyr: number
}): number {
	const mult = isJovian ? 2 : 4
	const ageMod = Math.floor(starAgeGyr / 2)
	let base = (DICE.roll2d6(rng) - 2) * mult + 2 + rng.randint(1, 6) + ageMod
	let rotation = base
	while (base > 40 && rng.randint(1, 6) >= 5) {
		base = (DICE.roll2d6(rng) - 2) * mult + rng.randint(1, 6)
		rotation += base
	}
	return rotation * rng.uniform(0.95, 1.05)
}

export const ROLLS = {
	rollOrbitGroup,
	rollTerrestrialSubgroup,
	rollSizeClass,
	rollDiameterKmFromSizeClass,
	rollAnomalousInclinationDeg,
	pickDensityEarthRelative,
	rollEccentricity,
	rollAxialTiltDeg,
	rollPlanetRings,
	rollSiderealDayHours,
}
