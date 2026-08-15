import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type {
	OrbitClassification,
	OrbitGroup,
} from "@/model/celestial/orbit-body/types"
import type { Zone } from "@/model/celestial/planet/types"
import type {
	DensityComposition,
	RollEccentricityInput,
	RollPlanetRingsInput,
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

// Ported from galaxy-gen's getDensityFromTable/calculateDensity (orbits/groups.ts):
// composition (ice/rocky/metallic) picks a weighted density category, then a
// 2d6-2 roll indexes one of 11 specific values within that category -- a
// triangular distribution clustered around the category's middle, instead of
// a flat uniform range.
const DENSITY_TABLE: Record<string, number[]> = {
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

function classificationToComposition(
	classification: OrbitClassification,
): DensityComposition {
	if (
		classification === "snowball" ||
		classification === "panthalassic" ||
		classification === "helian"
	) {
		return "ice"
	}
	if (
		classification === "telluric" ||
		classification === "meltball" ||
		classification === "stygian" ||
		classification === "acheronian" ||
		classification === "asphodelian"
	) {
		return "metallic"
	}
	return "rocky"
}

function rollDensityFromComposition({
	rng,
	composition,
}: {
	rng: ReturnType<typeof RNG.createRng>
	composition: DensityComposition
}): number {
	const description = rng.weightedChoice([
		{ v: "Exotic Ice", w: composition === "ice" ? 1 : 0 },
		{ v: "Mostly Ice", w: composition === "ice" ? 5 : 0 },
		{ v: "Mostly Rock", w: composition === "rocky" ? 3 : 0 },
		{
			v: "Rock and Metal",
			w: composition === "metallic" || composition === "rocky" ? 4 : 0,
		},
		{ v: "Mostly Metal", w: composition === "metallic" ? 5 : 0 },
		{ v: "Compressed Metal", w: composition === "metallic" ? 1 : 0 },
	])
	const densityRoll = DICE.roll2d6(rng) - 2
	return DENSITY_TABLE[description as string][densityRoll]
}

function pickDensityEarthRelative({
	rng,
	group,
	classification,
	composition,
}: {
	rng: ReturnType<typeof RNG.createRng>
	group: OrbitGroup
	classification: OrbitClassification
	/** Omitted before classification has produced a composition; the
	 * classification table then provides the density-roll category. */
	composition?: string
}): number {
	if (group === "jovian" || classification === "chthonian") {
		return rng.uniform(0.08, 0.35)
	}
	const densityComposition: DensityComposition =
		composition === "ice" ||
		composition === "rocky" ||
		composition === "metallic"
			? composition
			: classificationToComposition(classification)
	return rollDensityFromComposition({ rng, composition: densityComposition })
}

// Ported from galaxy-gen's MATH.orbits.eccentricity (orbits/index.ts). A
// companion star gets the source's +2 modifier; a planet has no modifier.
function rollEccentricity({ rng, orbitKind }: RollEccentricityInput): number {
	const roll = DICE.roll2d6(rng) + (orbitKind === "companion-star" ? 2 : 0)
	if (roll <= 5) return 0
	if (roll <= 7) return rng.uniform(0.01, 0.03)
	if (roll <= 9) return rng.uniform(0.04, 0.09)
	if (roll <= 10) return rng.uniform(0.1, 0.35)
	if (roll <= 11) return rng.uniform(0.15, 0.65)
	return rng.uniform(0.4, 0.9)
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
	rollSizeClass,
	rollDiameterKmFromSizeClass,
	pickDensityEarthRelative,
	rollEccentricity,
	rollAxialTiltDeg,
	rollPlanetRings,
	rollSiderealDayHours,
}
