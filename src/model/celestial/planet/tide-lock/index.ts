import type { MoonBody } from "@/model/celestial/moons/types"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type { TideLock } from "@/model/celestial/orbit-body/types"
import type {
	MoonTideLockResult,
	PlanetTideLockResult,
	TideLockEffectResult,
	TideLockTraceEntry,
} from "@/model/celestial/planet/tide-lock/types"
import { DICE } from "@/model/shared/random/dice"
import { RNG } from "@/model/shared/random/rng"
import { TIME } from "@/model/shared/time"

// Ported from galaxy-gen's rotation/index.ts createCollector -- accumulates a
// DM total alongside a human-readable trace of the individual modifiers that
// produced it (skipping any that contributed 0), so a UI detail panel can
// show exactly why a body did or didn't end up tide-locked.
type DmBreakdown = { value: number; trace: TideLockTraceEntry[] }

function createDmCollector() {
	let value = 0
	const trace: TideLockTraceEntry[] = []
	return {
		add: (delta: number, description: string) => {
			value += delta
			if (delta !== 0) trace.push({ value: delta, description })
		},
		result: (): DmBreakdown => ({ value, trace }),
	}
}

// Relative (not absolute) tolerance on the sidereal:orbital ratio -- these
// periods span everything from hours (close-in moons) to centuries (distant
// dwarf planets), so a fixed hour tolerance would either miss real matches at
// the large end or false-positive at the small end.
const RESONANCE_32_RATIO_TOLERANCE = 1e-3

/**
 * Derives the explicit "1:1"/"3:2"/none rotation descriptor (OrbitBody.
 * tideLockStatus) from data every body already carries -- never a separate
 * roll of its own. A full lock is just "tideLock is set" (this file's own
 * rolls above always leave tideLock set exactly when the result was a 1:1
 * lock); a 3:2 resonance is read off the ratio between siderealDayHours and
 * the orbital period -- both rollTideLockEffect's roll===11 outcome (this
 * file) and real Mercury's authored data in sol-system.ts express it the
 * same way: sidereal day = 2/3 of the orbital period (3 rotations per 2
 * orbits, rotation faster than the orbit). The inverse ratio (1.5x) is also
 * accepted for robustness -- it's not produced by anything in this codebase
 * anymore (see rollTideLockEffect's own comment for why that direction is
 * wrong: it makes computeSolarDayHours read the body as never completing a
 * solar day), but a "3:2 resonance" is the same fact read either direction,
 * so treat both as equivalent rather than silently mislabeling one of them
 * "none" if it ever shows up in hand-authored data. Called for every
 * procedurally generated body/moon (generate-system-bodies.ts) AND for
 * Sol's real, hand-authored ones (sol-system.ts's buildPlanet/buildMoon),
 * so Mercury's real 3:2 resonance shows the same descriptor without needing
 * its own authored flag.
 */
function deriveTideLockStatus(params: {
	siderealDayHours: number
	orbitalPeriodDays: number
	tideLock: TideLock | null | undefined
}): "1:1" | "3:2" | undefined {
	if (params.tideLock) return "1:1"
	const orbitalHours = params.orbitalPeriodDays * TIME.hoursPerDay
	if (orbitalHours <= 0 || params.siderealDayHours <= 0) return undefined
	const ratio = params.siderealDayHours / orbitalHours
	if (Math.abs(ratio - 1.5) < RESONANCE_32_RATIO_TOLERANCE) return "3:2"
	if (Math.abs(ratio - 2 / 3) < RESONANCE_32_RATIO_TOLERANCE) return "3:2"
	return undefined
}

// Ported from galaxy-gen's ROTATION.locks.general (orbits/rotation/index.ts)
// -- how hard THIS body itself resists being spun down, independent of what
// it might lock to.
function rollGeneralLockDM(params: {
	sizeClass: number
	eccentricity: number
	axialTiltDeg: number
	atmospherePressureBar: number
	starAgeGyr: number
}): DmBreakdown {
	const dm = createDmCollector()
	if (params.sizeClass > 0)
		dm.add(Math.ceil(params.sizeClass / 3), `Planet size (${params.sizeClass})`)
	if (params.eccentricity > 0.1)
		dm.add(
			-Math.floor(params.eccentricity * 10),
			`Eccentric (${params.eccentricity.toFixed(1)})`,
		)
	if (params.axialTiltDeg > 30)
		dm.add(-2, `Axial tilt (${params.axialTiltDeg.toFixed(0)}°)`)
	if (params.axialTiltDeg >= 60 && params.axialTiltDeg <= 120)
		dm.add(-4, "Axial tilt 60°-120°")
	if (params.axialTiltDeg >= 80 && params.axialTiltDeg <= 100)
		dm.add(-4, "Axial tilt 80°-100°")
	if (params.atmospherePressureBar > 2.5)
		dm.add(-2, `Atmosphere (${params.atmospherePressureBar.toFixed(1)} bar)`)
	const systemNote = `System age (${params.starAgeGyr.toFixed(1)} Gyr)`
	if (params.starAgeGyr < 1) dm.add(-2, systemNote)
	else if (params.starAgeGyr < 10) dm.add(2, systemNote)
	else dm.add(4, systemNote)
	return dm.result()
}

// Ported from galaxy-gen's ROTATION.locks.planet.star -- the DM for this
// planet locking to its STAR (as opposed to one of its own moons, below).
function rollStarLockDM(params: {
	orbitalDistanceAU: number
	starMassSol: number
	totalMoonSizeClass: number
}): DmBreakdown {
	const dm = createDmCollector()
	dm.add(-4, "Star modifier")

	const orbitNumber = ORBIT_BODY.auToOrbitNumber({
		au: params.orbitalDistanceAU,
	})
	const orbitNote = `Distance (orbit #${orbitNumber.toFixed(1)})`
	if (orbitNumber < 1) dm.add(4 + Math.floor(10 * (1 - orbitNumber)), orbitNote)
	else if (orbitNumber < 2) dm.add(4, orbitNote)
	else if (orbitNumber < 3) dm.add(1, orbitNote)
	else dm.add(-Math.floor(orbitNumber * 2), orbitNote)

	const starMassNote = `Star mass (${params.starMassSol.toFixed(1)} M☉)`
	if (params.starMassSol < 0.5) dm.add(-2, starMassNote)
	else if (params.starMassSol < 1) dm.add(-1, starMassNote)
	else if (params.starMassSol < 5) dm.add(1, starMassNote)
	else dm.add(2, starMassNote)

	if (params.totalMoonSizeClass > 0)
		dm.add(-params.totalMoonSizeClass, "Large moons")
	return dm.result()
}

// Ported from galaxy-gen's ROTATION.locks.planet.moon -- the DM for this
// planet locking to one of its own (already planet-locked, e.g. a
// Pluto/Charon-style mutual lock) moons instead of its star.
function rollMoonLockDM(params: {
	moonSizeClass: number
	moonSemiMajorAxisPlanetDiameters: number
	siblingMoonCount: number
}): DmBreakdown {
	const dm = createDmCollector()
	dm.add(-10 + params.moonSizeClass, `Moon size (${params.moonSizeClass})`)
	const pd = params.moonSemiMajorAxisPlanetDiameters
	const pdNote = `Moon orbit (PD ${pd.toFixed(0)})`
	if (pd < 5) dm.add(5 + Math.ceil((5 - pd) * 5), pdNote)
	else if (pd < 10) dm.add(4, pdNote)
	else if (pd < 20) dm.add(2, pdNote)
	else if (pd < 40) dm.add(1, pdNote)
	else if (pd > 60) dm.add(-6, pdNote)
	if (params.siblingMoonCount > 0)
		dm.add(
			-2 * params.siblingMoonCount,
			`Sibling moons (${params.siblingMoonCount})`,
		)
	return dm.result()
}

// Ported from galaxy-gen's ROTATION.locks.effect -- the 2d6+dm roll that
// turns the winning prospect's DM into an actual rotation outcome: unlocked
// (roll<=4), a partial spin-down multiplier (5-8), a random slow rotation
// (9-10, with a retrograde flip on 10), a 3:2 spin-orbit resonance (11, real
// Mercury's case), or a full 1:1 lock (12+, unless an unmodified reroll --
// forced for a homeworld, or a 1-in-36 chance otherwise -- knocks it back
// down to a lower outcome instead).
function rollTideLockEffect(params: {
	rng: ReturnType<typeof RNG.createRng>
	dm: number
	periodHours: number
	axialTiltDeg: number
	eccentricity: number
	rerollEccentricity: () => number
	homeworld: boolean
	baseSiderealDayHours: number
	broke: boolean
	/** The previous roll, only set on the recursive "broke" reroll -- lets the
	 * trace record the swing a broken lock made, mirroring galaxy-gen's
	 * comparison against the stashed orbit.rotation.roll. */
	prevRoll?: number
}): TideLockEffectResult {
	const { rng, dm, periodHours, homeworld, baseSiderealDayHours, broke } =
		params
	const roll = DICE.roll2d6(rng) + dm
	const trace: TideLockTraceEntry[] = []
	if (broke && params.prevRoll !== undefined && params.prevRoll !== roll)
		trace.push({ value: roll - params.prevRoll, description: "Broken lock" })

	if (roll <= 4) {
		trace.push({ value: roll - dm, description: "Base roll (2d6)" })
		return {
			siderealDayHours: baseSiderealDayHours,
			axialTiltDeg: params.axialTiltDeg,
			eccentricity: params.eccentricity,
			locked: false,
			trace,
		}
	}

	let axialTiltDeg = params.axialTiltDeg
	let eccentricity = params.eccentricity
	let siderealDayHours = baseSiderealDayHours
	let locked = false

	if (roll === 5) siderealDayHours = baseSiderealDayHours * 1.5
	else if (roll === 6) siderealDayHours = baseSiderealDayHours * 2
	else if (roll === 7) siderealDayHours = baseSiderealDayHours * 3
	else if (roll === 8) siderealDayHours = baseSiderealDayHours * 5
	else if (roll === 9)
		siderealDayHours = rng.randint(1, 6) * 5 * TIME.hoursPerDay
	else if (roll === 10)
		siderealDayHours = rng.randint(1, 6) * 10 * TIME.hoursPerDay
	// A "3:2" spin-orbit resonance means 3 rotations per 2 orbits (real
	// Mercury's case) -- i.e. the sidereal day is 2/3 of the orbital period
	// (rotation is FASTER than the orbit), not periodHours*3/2 (which would
	// be a day 1.5x LONGER than the year -- the opposite direction, and the
	// literal value galaxy-gen's own `(period * 3) / 2` computes). That
	// inverted ratio also breaks computeSolarDayHours: with a sidereal day
	// longer than the orbital period, 1/sidereal - 1/orbital goes negative
	// and reads as "Day Infinite" in the UI instead of the correct
	// (finite, if long) 2-years-per-solar-day result real Mercury has.
	else if (roll === 11) siderealDayHours = (periodHours * 2) / 3
	else if (!broke && (DICE.roll2d6(rng) === 12 || homeworld)) {
		return rollTideLockEffect({
			...params,
			dm: 0,
			broke: true,
			prevRoll: roll,
		})
	} else {
		siderealDayHours = periodHours
		locked = true
	}

	trace.push({ value: roll - dm, description: "Base roll (2d6)" })

	if (roll === 10 && axialTiltDeg < 90) axialTiltDeg = 180 - axialTiltDeg
	if (roll >= 11 && axialTiltDeg > 3) {
		axialTiltDeg = DICE.roll2d6(rng) / 10
	}
	if (roll >= 12 && eccentricity > 0.1) {
		eccentricity = Math.min(eccentricity, params.rerollEccentricity())
	}

	return { siderealDayHours, axialTiltDeg, eccentricity, locked, trace }
}

/**
 * Ported from galaxy-gen's ROTATION.locks.get (orbits/rotation/index.ts) --
 * the planet-side prospects (a planet locking to its star, or to one of its
 * own already-planet-locked moons). See rollMoonTideLock below for the
 * moon-side prospect (a moon locking to ITS planet) -- galaxy-gen rolls both
 * within the same locks.get, but generate-system-bodies.ts calls them
 * separately since a moon's own lock has to be decided (and its resulting
 * MoonBody.tideLock read back here for the "already planet-locked" moon
 * check below) before this planet-side roll runs.
 *
 * Call this AFTER a body's moons have already had rollMoonTideLock applied
 * and its own eccentricity/axialTiltDeg/atmosphere have been rolled -- every
 * input here mirrors what galaxy-gen's roll reads off the already-mostly-
 * built `orbit` at the point it calls ROTATION.locks.get.
 */
function rollPlanetTideLock(params: {
	rng: ReturnType<typeof RNG.createRng>
	sizeClass: number
	eccentricity: number
	axialTiltDeg: number
	atmospherePressureBar: number
	starAgeGyr: number
	starMassSol: number
	orbitalDistanceAU: number
	orbitalPeriodDays: number
	baseSiderealDayHours: number
	moons: MoonBody[]
	homeworld: boolean
	rerollEccentricity: () => number
}): PlanetTideLockResult {
	const general = rollGeneralLockDM({
		sizeClass: params.sizeClass,
		eccentricity: params.eccentricity,
		axialTiltDeg: params.axialTiltDeg,
		atmospherePressureBar: params.atmospherePressureBar,
		starAgeGyr: params.starAgeGyr,
	})
	const totalMoonSizeClass = params.moons.reduce(
		(sum, moon) => sum + (moon.sizeClass ?? 0),
		0,
	)
	const star = rollStarLockDM({
		orbitalDistanceAU: params.orbitalDistanceAU,
		starMassSol: params.starMassSol,
		totalMoonSizeClass,
	})

	let winnerDM = star.value + general.value
	let winnerTideLock: TideLock = { type: "solar", target: 0 }
	let winnerPeriodHours = params.orbitalPeriodDays * TIME.hoursPerDay
	let winnerTrace = star.trace

	// Only an already-planet-locked moon (mirroring galaxy-gen's
	// lockedMoons -- a moon that already keeps one face toward this planet)
	// can be a candidate for this planet locking back to it, and only for a
	// body small enough that a moon could plausibly dominate its spin (galaxy-
	// gen's sizeClass 0 < size < 16 guard -- never for an asteroid-belt-sized
	// body, never for a jovian/helian-scale giant).
	const lockedMoons =
		params.sizeClass > 0 && params.sizeClass < 16
			? params.moons.filter((moon) => moon.tideLock?.type === "planet")
			: []
	lockedMoons.forEach((moon, index) => {
		const siblingMoonCount = lockedMoons.length - 1
		const moonBreakdown = rollMoonLockDM({
			moonSizeClass: moon.sizeClass ?? 0,
			moonSemiMajorAxisPlanetDiameters: moon.semiMajorAxisPlanetDiameters ?? 0,
			siblingMoonCount,
		})
		const moonDM = moonBreakdown.value + general.value
		if (moonDM >= winnerDM) {
			winnerDM = moonDM
			winnerTideLock = { type: "lunar", target: moon.idx }
			winnerPeriodHours = moon.orbitalPeriodDays * TIME.hoursPerDay
			winnerTrace = moonBreakdown.trace
		}
		void index
	})

	const effect = rollTideLockEffect({
		rng: params.rng,
		dm: winnerDM,
		periodHours: winnerPeriodHours,
		axialTiltDeg: params.axialTiltDeg,
		eccentricity: params.eccentricity,
		rerollEccentricity: params.rerollEccentricity,
		homeworld: params.homeworld,
		baseSiderealDayHours: params.baseSiderealDayHours,
		broke: false,
	})

	return {
		siderealDayHours: effect.siderealDayHours,
		axialTiltDeg: effect.axialTiltDeg,
		eccentricity: effect.eccentricity,
		tideLock: effect.locked ? winnerTideLock : null,
		starLocked: effect.locked && winnerTideLock.type === "solar",
		trace: [...general.trace, ...winnerTrace, ...effect.trace],
	}
}

// Ported from galaxy-gen's ROTATION.locks.moon.planet -- the DM for a moon
// locking to ITS planet (the mirror image of rollMoonLockDM above, which is
// the planet's own DM for locking back to an already-locked moon). Replaces
// the flat per-orbit-range probability moon-utils.ts/orbital-mechanics.ts
// used to approximate this with (see TIDAL_LOCK_CHANCE_BY_RANGE, now
// removed) with the same DM+roll mechanic every other lock in this file
// uses.
function rollMoonToPlanetLockDM(params: {
	moonSemiMajorAxisPlanetDiameters: number
	moonRetrograde: boolean
	planetMassEarths: number
}): DmBreakdown {
	const dm = createDmCollector()
	dm.add(6, "Planet modifier")
	const pd = params.moonSemiMajorAxisPlanetDiameters
	const pdNote = `Moon orbit (PD ${pd.toFixed(0)})`
	if (pd > 20) dm.add(-Math.floor(pd / 20), pdNote)
	if (params.moonRetrograde) dm.add(-2, "Retrograde")
	const planetMassNote = `Planet mass (${params.planetMassEarths.toFixed(0)} M⊕)`
	if (params.planetMassEarths <= 10) dm.add(2, planetMassNote)
	else if (params.planetMassEarths < 100) dm.add(4, planetMassNote)
	else if (params.planetMassEarths < 1000) dm.add(6, planetMassNote)
	else dm.add(8, planetMassNote)
	return dm.result()
}

/**
 * Ported from galaxy-gen's ROTATION.locks.get's per-moon loop (orbits/
 * rotation/index.ts) -- rolls whether a moon ends up 1:1 locked to (always
 * showing the same face toward) its own planet, using the same general DM
 * (this moon's own size/eccentricity/tilt/atmosphere/star age) plus a
 * moon-specific DM (its distance from the planet in planet-diameters, its
 * spin direction, and the planet's own mass) run through the same 2d6+dm
 * effect roll every other lock in this file uses.
 *
 * Call this once per moon, after its own environment (sizeClass/atmosphere)
 * has been built but before generate-system-bodies.ts's planet-side
 * rollPlanetTideLock call, which needs to see the resulting locked/unlocked
 * moons to decide whether the PLANET should lock back to one of them.
 */
function rollMoonTideLock(params: {
	rng: ReturnType<typeof RNG.createRng>
	sizeClass: number
	eccentricity: number
	axialTiltDeg: number
	atmospherePressureBar: number
	starAgeGyr: number
	semiMajorAxisPlanetDiameters: number
	orbitalPeriodDays: number
	planetMassEarths: number
	baseSiderealDayHours: number
	rerollEccentricity: () => number
}): MoonTideLockResult {
	const general = rollGeneralLockDM({
		sizeClass: params.sizeClass,
		eccentricity: params.eccentricity,
		axialTiltDeg: params.axialTiltDeg,
		atmospherePressureBar: params.atmospherePressureBar,
		starAgeGyr: params.starAgeGyr,
	})
	const moon = rollMoonToPlanetLockDM({
		moonSemiMajorAxisPlanetDiameters: params.semiMajorAxisPlanetDiameters,
		moonRetrograde: params.axialTiltDeg > 90,
		planetMassEarths: params.planetMassEarths,
	})

	const effect = rollTideLockEffect({
		rng: params.rng,
		dm: general.value + moon.value,
		periodHours: params.orbitalPeriodDays * TIME.hoursPerDay,
		axialTiltDeg: params.axialTiltDeg,
		eccentricity: params.eccentricity,
		rerollEccentricity: params.rerollEccentricity,
		// Unlike a planet's rollPlanetTideLock, galaxy-gen's per-moon lock
		// call never passes `homeworld` -- only a homeworld PLANET gets the
		// "give it a fairer, unmodified reroll" protection, never its moons.
		homeworld: false,
		baseSiderealDayHours: params.baseSiderealDayHours,
		broke: false,
	})

	return {
		siderealDayHours: effect.siderealDayHours,
		axialTiltDeg: effect.axialTiltDeg,
		eccentricity: effect.eccentricity,
		locked: effect.locked,
		trace: [...moon.trace, ...general.trace, ...effect.trace],
	}
}

export const TIDE_LOCK = {
	deriveTideLockStatus,
	rollPlanetTideLock,
	rollMoonTideLock,
}
