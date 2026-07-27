import { MECHANICS } from "@/model/celestial/moons/mechanics"
import {
	type AttachParentTideLocksInput,
	DEFAULT_MOON_ATMOSPHERE as DEFAULT_MOON_ATMOSPHERE_VALUE,
	type GenerateMoonsInput,
	type MoonBody,
	type MoonOrbitRange,
	type PendingMoon,
	type PlaceMoonOrbitsInput,
	type RollDieInput,
	type RollMoonCountInput,
	type RollMoonDiameterInput,
	type RollMoonEccentricityInput,
	type RollMoonOrbitCandidateInput,
	type RollMoonSizeClassInput,
} from "@/model/celestial/moons/types"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import { DICE } from "@/model/shared/dice"
import { RNG } from "@/model/shared/rng"
import { TIME } from "@/model/shared/time"

const TWO_PI = 2 * Math.PI

const ROCHE_PD = 2
const MINIMUM_MOON_SPACING_PD = 0.6
const MINIMUM_MOON_SPACING_SCALE = 0.03
const EXTREME_ORBIT_SKIP_CHANCE = 0.65
const ORBIT_RANGE_CONFIG: Record<
	MoonOrbitRange,
	{ minFactor: number; maxFactor: number; weight: number }
> = {
	inner: { minFactor: 0, maxFactor: 0.24, weight: 5 },
	middle: { minFactor: 0.24, maxFactor: 0.56, weight: 4.2 },
	outer: { minFactor: 0.56, maxFactor: 0.92, weight: 2.4 },
	extreme: { minFactor: 0.92, maxFactor: 1.1, weight: 0.65 },
}
const MOON_ORBIT_RANGE_ORDER: MoonOrbitRange[] = [
	"inner",
	"middle",
	"outer",
	"extreme",
]

function rollDie({ rng, sides }: RollDieInput): number {
	return rng.randint(1, sides)
}

// Values >90° are kept as-is (not folded back into 0–90) — same convention
// planets use, where axial tilt past 90° is itself what makes a body's spin
// read as retrograde once composed with the render's tilt quaternion (see
// buildMoonMesh), rather than needing a separate retrograde flag.
function rollMoonAxialTiltDeg(rng: ReturnType<typeof RNG.createRng>): number {
	const standard = DICE.roll2d6(rng)
	if (standard <= 4) return rng.uniform(0.01, 0.1)
	if (standard <= 5) return rng.uniform(0.2, 1.2)
	if (standard <= 6) return rng.uniform(1, 6)
	if (standard <= 7) return rng.uniform(7, 12)
	if (standard <= 9) return rng.uniform(10, 35)
	const extreme = rollDie({ rng, sides: 6 })
	if (extreme <= 2) return rng.uniform(20, 70)
	if (extreme <= 4) return rng.uniform(40, 90)
	if (extreme <= 5) return rng.uniform(91, 126)
	return rng.uniform(144, 180)
}

// Rolls a moon's own pre-lock, "naturally" independent sidereal rotation
// period -- the same role rollSiderealDayHours plays for a sibling planet
// (see generate-system-bodies.ts). Tidal locking itself is no longer decided
// here by a flat per-range chance; generate-system-bodies.ts's real-moon path
// now runs the actual DM+roll tide-lock mechanic on top of this baseline (see
// tide-lock.ts's rollMoonTideLock), same as it does for planets. This
// baseline still stands unmodified for callers that don't run that
// enrichment step (post-elevation.ts's tidal-schedule-only moon, whose own
// rotation period is never read downstream).
function rollMoonSiderealDayHours(
	rng: ReturnType<typeof RNG.createRng>,
): number {
	let base = (DICE.roll2d6(rng) - 2) * 3 + 2 + rng.randint(1, 6)
	let rotation = base
	while (base > 40 && rng.randint(1, 6) >= 5) {
		base = (DICE.roll2d6(rng) - 2) * 3 + rng.randint(1, 6)
		rotation += base
	}
	return rotation * rng.uniform(0.95, 1.05)
}

function rollMoonSizeClass({
	rng,
	parentSizeClass,
	parentGroup,
}: RollMoonSizeClassInput): number {
	const roll = rollDie({ rng, sides: 6 })
	let sizeClass = 0
	const giant = parentGroup === "jovian"
	if (roll <= 3 || parentGroup === "asteroid belt") sizeClass = 0
	else if (roll <= 5) sizeClass = rollDie({ rng, sides: 3 }) - 1
	else if (!giant) {
		sizeClass = parentSizeClass - 1 - rollDie({ rng, sides: 6 })
	} else {
		const roll2 = rollDie({ rng, sides: 6 })
		if (roll2 <= 3) sizeClass = rollDie({ rng, sides: 6 })
		else if (roll2 <= 5)
			sizeClass = rollDie({ rng, sides: 6 }) + rollDie({ rng, sides: 6 }) - 2
		else sizeClass = rollDie({ rng, sides: 6 }) + rollDie({ rng, sides: 6 }) + 4
		if (sizeClass === 16 && parentSizeClass === 16) sizeClass = 15
		else if (
			sizeClass === 16 &&
			parentSizeClass === 18 &&
			rollDie({ rng, sides: 6 }) + rollDie({ rng, sides: 6 }) >= 12
		) {
			sizeClass = 17
		}
	}

	if (!giant && sizeClass === parentSizeClass - 2) {
		const adjustmentRoll =
			rollDie({ rng, sides: 6 }) + rollDie({ rng, sides: 6 })
		if (adjustmentRoll === 2) sizeClass = parentSizeClass - 1
		else if (adjustmentRoll === 12) sizeClass = parentSizeClass
	}

	if (sizeClass > parentSizeClass) sizeClass = 0
	return Math.max(0, sizeClass)
}

function rollMoonDiameterKm({ rng, sizeClass }: RollMoonDiameterInput): number {
	const [minKm, maxKm] = ORBIT_BODY.sizeClassToRockyDiameterRangeKm(sizeClass)
	return rng.uniform(minKm, maxKm)
}

function rollMoonOrbitCandidate({
	rng,
	morPd,
	moonMinimumPd,
	maxPd,
}: RollMoonOrbitCandidateInput):
	| { range: MoonOrbitRange; pd: number }
	| undefined {
	const availableRanges = MOON_ORBIT_RANGE_ORDER.map((range) => {
		const config = ORBIT_RANGE_CONFIG[range]
		const rangeMinPd = ROCHE_PD + morPd * config.minFactor
		const rangeMaxPd = Math.min(maxPd, ROCHE_PD + morPd * config.maxFactor)
		const usableMinPd = Math.max(moonMinimumPd, rangeMinPd)
		const usableWidthPd = rangeMaxPd - usableMinPd
		if (usableWidthPd <= 0) return undefined
		return { range, weight: config.weight * usableWidthPd }
	}).filter((range) => range !== undefined)

	if (availableRanges.length === 0) return undefined
	const nonExtremeRanges = availableRanges.filter(
		(range) => range.range !== "extreme",
	)
	const sampledRanges =
		nonExtremeRanges.length > 0 && rng.uniform(0, 1) < EXTREME_ORBIT_SKIP_CHANCE
			? nonExtremeRanges
			: availableRanges
	const totalWeight = sampledRanges.reduce(
		// biome-ignore lint/nursery/useMaxParams: native Array callback signature
		(sum, range) => sum + range.weight,
		0,
	)
	let roll = rng.uniform(0, totalWeight)
	for (const range of sampledRanges) {
		roll -= range.weight
		if (roll <= 0) return { range: range.range, pd: 0 }
	}
	return { range: sampledRanges[sampledRanges.length - 1]!.range, pd: 0 }
}

function placeMoonOrbits({
	rng,
	moons,
	morPd,
	maxStablePd,
	minimumSpacingPd,
}: PlaceMoonOrbitsInput): Array<PendingMoon & { pd: number }> {
	const placedMoons: Array<PendingMoon & { pd: number }> = []
	let previousOuterPd = ROCHE_PD
	for (const range of MOON_ORBIT_RANGE_ORDER) {
		const rangeMoons = moons
			.filter((moon) => moon.orbitRange === range)
			// biome-ignore lint/nursery/useMaxParams: native Array callback signature
			.sort((a, b) => a.moonMinimumPd - b.moonMinimumPd)
		if (rangeMoons.length === 0) continue
		const config = ORBIT_RANGE_CONFIG[range]
		const rangeMinPd = ROCHE_PD + morPd * config.minFactor
		const rangeMaxPd = Math.min(
			maxStablePd,
			ROCHE_PD + morPd * config.maxFactor,
		)
		for (let index = 0; index < rangeMoons.length; index++) {
			const moon = rangeMoons[index]!
			const reservePd = rangeMoons.slice(index + 1).reduce(
				// biome-ignore lint/nursery/useMaxParams: native Array callback signature
				(sum, nextMoon) => sum + nextMoon.radiusPd * 2 + minimumSpacingPd,
				0,
			)
			const minPd = Math.max(
				moon.moonMinimumPd,
				rangeMinPd,
				previousOuterPd + moon.radiusPd + minimumSpacingPd,
			)
			const maxPd = rangeMaxPd - reservePd - moon.radiusPd
			if (maxPd <= minPd) continue
			const pd = rng.uniform(minPd, maxPd)
			placedMoons.push({ ...moon, pd })
			previousOuterPd = pd + moon.radiusPd
		}
	}
	return placedMoons
}

const TIDE_LOCK_TOLERANCE_HOURS = 1e-6

const defaultMoonAtmosphere = DEFAULT_MOON_ATMOSPHERE_VALUE

export const MOON = {
	/**
	 * Centralized orbital-inclination roll, shared by every planet, moon, and
	 * sibling body in the system so they all use the same table:
	 *
	 *   2D roll   Severity     Degrees
	 *   2–6       Very Low     1D ÷ 2
	 *   7         Low          1D
	 *   8         Moderate     2D
	 *   9         High         (2D × 3) + 1D
	 *   10        Very High    (1D + 1) × 5 + 1D
	 *   11        Extreme      (3D × 5) − 1D
	 *   12        Retrograde   roll again, result subtracted from 180
	 */
	rollInclinationDeg(rng: ReturnType<typeof RNG.createRng>): number {
		const roll = rollDie({ rng, sides: 2 })
		if (roll <= 6) return rollDie({ rng, sides: 1 }) / 2
		if (roll === 7) return rollDie({ rng, sides: 1 })
		if (roll === 8) return rollDie({ rng, sides: 2 })
		if (roll === 9)
			return rollDie({ rng, sides: 2 }) * 3 + rollDie({ rng, sides: 1 })
		if (roll === 10)
			return (rollDie({ rng, sides: 1 }) + 1) * 5 + rollDie({ rng, sides: 1 })
		if (roll === 11)
			return rollDie({ rng, sides: 3 }) * 5 - rollDie({ rng, sides: 1 })
		return 180 - MOON.rollInclinationDeg(rng)
	},

	estimateMoonSizeClassFromDiameter(diameterKm: number): number {
		return ORBIT_BODY.estimateRockySizeClassFromDiameterKm(diameterKm)
	},

	// Stamps each moon's tideLock now that its parent's SystemBody idx is known
	// (moons are generated/rolled before that idx is assigned). "Locked" is read
	// off siderealDayHours ≈ orbitalPeriodDays × HOURS_PER_DAY, which is how the lock roll
	// (rollMoonSiderealDayHours, or a preset's ported real rotation period) is
	// already expressed -- this just makes that fact explicit as data instead of
	// leaving callers to re-derive it via a float comparison. Uses a tolerance
	// rather than strict equality: orbitalPeriodDays is itself derived as
	// rotationHours / HOURS_PER_DAY for these ported presets, and re-multiplying by HOURS_PER_DAY
	// doesn't always round-trip exactly (e.g. Callisto's 400.54 comes back as
	// 400.5400000000001), which previously made an actually-locked moon read as
	// unlocked.
	attachParentTideLocks({
		moons,
		parentIdx,
	}: AttachParentTideLocksInput): MoonBody[] {
		return moons.map((moon) => ({
			...moon,
			tideLock:
				Math.abs(
					moon.siderealDayHours - moon.orbitalPeriodDays * TIME.hoursPerDay,
				) < TIDE_LOCK_TOLERANCE_HOURS
					? { type: "planet", target: parentIdx }
					: null,
		}))
	},

	rollMoonCountForParent({
		rng,
		parentGroup,
		parentSizeClass,
		orbitalDistanceAU,
	}: RollMoonCountInput): number {
		if (parentGroup === "asteroid belt") return 0
		let roll = rollDie({ rng, sides: 6 }) + 2
		if (parentSizeClass < 1) roll = 0
		else if (parentSizeClass <= 2) roll = rollDie({ rng, sides: 6 }) - 5
		else if (parentSizeClass <= 9)
			roll = rollDie({ rng, sides: 6 }) + rollDie({ rng, sides: 6 }) - 8
		else if (parentSizeClass <= 15)
			roll = rollDie({ rng, sides: 6 }) + rollDie({ rng, sides: 6 }) - 6
		else if (parentSizeClass <= 16)
			roll =
				rollDie({ rng, sides: 6 }) +
				rollDie({ rng, sides: 6 }) +
				rollDie({ rng, sides: 6 }) -
				7
		else
			roll =
				rollDie({ rng, sides: 6 }) +
				rollDie({ rng, sides: 6 }) +
				rollDie({ rng, sides: 6 }) +
				rollDie({ rng, sides: 6 }) -
				6

		if (orbitalDistanceAU < 0.5) {
			roll -=
				parentSizeClass > 16
					? 4
					: parentSizeClass > 15
						? 3
						: parentSizeClass > 2
							? 2
							: 1
		}
		return Math.max(roll, 0)
	},

	rollMoonEccentricity({
		rng,
		range,
		sizeClass,
	}: RollMoonEccentricityInput): number {
		let roll = rollDie({ rng, sides: 6 }) + rollDie({ rng, sides: 6 })
		if (range === "middle") roll += 2
		else if (range === "outer") roll += 4
		else if (range === "extreme") roll += 6
		if (sizeClass > 4) roll -= 6
		if (roll <= 5) return 0
		if (roll <= 7) return rng.uniform(0.01, 0.03)
		if (roll <= 9) return rng.uniform(0.04, 0.09)
		if (roll <= 10) return rng.uniform(0.1, 0.35)
		if (roll <= 11) return rng.uniform(0.15, 0.65)
		return rng.uniform(0.4, 0.9)
	},

	// Generate moons using the galaxy-gen-style size ladder and PD-based orbit bands.
	// Multiple moons may share inner/middle/outer bands as long as minimum spacing is preserved.
	generateMoons({
		count,
		seed,
		planetRadiusKm,
		orbitalDistanceAU,
		starMassKg,
		parentGroup = "terrestrial",
	}: GenerateMoonsInput): MoonBody[] {
		if (count <= 0) return []

		const rng = RNG.createRng({ seed })
		const planetMassKg = MECHANICS.derivePlanetMassKg(planetRadiusKm)
		const planetRadiusM = planetRadiusKm * 1000
		const planetDiameterM = planetRadiusM * 2
		const planetDiameterKm = planetRadiusKm * 2
		const planetOrbitalDistanceM =
			orbitalDistanceAU * ORBIT_BODY.astronomicalUnitM

		const hill = MECHANICS.hillSphereM({
			planetOrbitalDistanceM,
			planetMassKg,
			starMassKg,
		})
		const maxStableM = 0.5 * hill
		const maxStablePd = maxStableM / planetDiameterM
		if (maxStablePd <= ROCHE_PD) return []
		const morPd = Math.max((maxStablePd - ROCHE_PD) / 1.1, 0.25)
		const parentSizeClass =
			MOON.estimateMoonSizeClassFromDiameter(planetDiameterKm)
		const minimumSpacingPd = Math.max(
			MINIMUM_MOON_SPACING_PD,
			morPd * MINIMUM_MOON_SPACING_SCALE,
		)

		const periodFromDist = (distM: number) => {
			const T =
				TWO_PI *
				Math.sqrt(
					(distM * distM * distM) /
						(ORBIT_BODY.gravitationalConstantM3KgS2 * planetMassKg),
				)
			return T / TIME.secondsPerDay
		}

		const moons: MoonBody[] = []
		const pendingMoons: PendingMoon[] = []

		for (let i = 0; i < count; i++) {
			const sizeClass = rollMoonSizeClass({ rng, parentSizeClass, parentGroup })
			const diameterKm = rollMoonDiameterKm({ rng, sizeClass })
			const moonDensity = rng.uniform(2200, 4000)
			const moonRadiusM = diameterKm * 500
			const moonVol =
				(4 / 3) * Math.PI * moonRadiusM * moonRadiusM * moonRadiusM
			const massKg = moonVol * moonDensity
			const rochePd =
				MECHANICS.rocheLimitM({
					planetRadiusM,
					moonMassKg: massKg,
					moonDiameterM: moonRadiusM * 2,
				}) / planetDiameterM
			const moonMinimumPd = Math.max(rochePd * 1.2, ROCHE_PD + minimumSpacingPd)
			const orbit = rollMoonOrbitCandidate({
				rng,
				morPd,
				moonMinimumPd,
				maxPd: maxStablePd,
			})
			if (!orbit) continue

			pendingMoons.push({
				massKg,
				diameterKm,
				sizeClass,
				moonMinimumPd,
				orbitRange: orbit.range,
				radiusPd: diameterKm / planetDiameterKm / 2,
			})
		}

		for (const moon of placeMoonOrbits({
			rng,
			moons: pendingMoons,
			morPd,
			maxStablePd,
			minimumSpacingPd,
		})) {
			const { pd, orbitRange, massKg, diameterKm, sizeClass } = moon

			const semiMajorM = pd * planetDiameterM
			const orbitalPeriodDays = periodFromDist(semiMajorM)
			const eccentricity = MOON.rollMoonEccentricity({
				rng,
				range: orbitRange,
				sizeClass,
			})
			const inclinationDeg = MOON.rollInclinationDeg(rng)
			const longitudeOfAscendingNodeDeg = rng.uniform(0, 360)
			const longitudeOfPerihelionDeg = rng.uniform(0, 360)
			const meanAnomalyAtEpochDeg = rng.uniform(0, 360)
			const axialTiltDeg = rollMoonAxialTiltDeg(rng)

			moons.push({
				idx: moons.length + 1,
				massKg,
				diameterKm,
				orbitalPeriodDays,
				siderealDayHours: rollMoonSiderealDayHours(rng),
				eccentricity,
				inclinationDeg,
				longitudeOfAscendingNodeDeg,
				longitudeOfPerihelionDeg,
				meanAnomalyAtEpochDeg,
				axialTiltDeg,
				orbitRange,
				semiMajorAxisPlanetDiameters: pd,
				sizeClass,
				// Fallback only -- generate-system-bodies.ts's sibling-planet path
				// layers a real classification-derived atmosphere/landCoverage on top
				// of these via buildMoonEnvironment(); these defaults only stick for
				// callers (main world's own live moon preview, tidal-schedule-only
				// generation) that don't run that enrichment step.
				atmosphere: DEFAULT_MOON_ATMOSPHERE_VALUE,
				landCoverage: 0,
			})
		}

		return moons
	},
	defaultMoonAtmosphere,
}
