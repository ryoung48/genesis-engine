import { SEED_MAX } from "../../shared/planet-code"
import { createRng } from "../../shared/rng"
import { SOL_LUNA_DEFAULT } from "../system/sol-system"
import {
	DEFAULT_MOON_ATMOSPHERE,
	type MoonBody,
	type MoonOrbitRange,
	type TideLock,
} from "./moon-types"
import {
	estimateMoonSizeClassFromDiameter,
	MOON_SIZE_DIAMETER_BANDS_KM,
	rollInclinationDeg,
} from "./moon-utils"

const G = 6.674e-11
const M_SOL_KG = 1.989e30
const AU_M = 1.496e11
// Earth's real mean density -- with this value, derivePlanetMassKg() at
// Earth's default radius (EARTH_DIAMETER_KM/2) comes out to exactly
// EARTH_MASS_KG. gravityG is derived from mass/radius directly (relative to
// Earth, G cancels out -- see body-metrics.ts's computeGravityG), not from
// G and a rounded standard-gravity constant, so it comes out to exactly
// 1.000g at the same defaults without needing to detune this density.
const EARTH_DENSITY_KG_M3 = 5515
const TWO_PI = 2 * Math.PI
const SOLAR_LOCK_MOON_ORBIT_HOURS_PER_DAY = 24

export { M_SOL_KG, AU_M }
export const LUNA_MOON_SEED = SEED_MAX - 1

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

type ParentOrbitGroup =
	| "asteroid belt"
	| "dwarf"
	| "terrestrial"
	| "helian"
	| "jovian"

const LUNA_OUTER_COMPANION: MoonBody = {
	idx: 2,
	massKg: SOL_LUNA_DEFAULT.massKg * 0.34,
	diameterKm: SOL_LUNA_DEFAULT.diameterKm * 0.72,
	group: "dwarf",
	classification: "rockball",
	landCoverage: 1,
	atmosphere: SOL_LUNA_DEFAULT.atmosphere,
	orbitalPeriodDays: SOL_LUNA_DEFAULT.orbitalPeriodDays * 1.82,
	siderealDayHours: SOL_LUNA_DEFAULT.orbitalPeriodDays * 1.82 * 24,
	eccentricity: 0.038,
	inclinationDeg: 4.8,
	longitudeOfAscendingNodeDeg: 0,
	longitudeOfPerihelionDeg: 0,
	meanAnomalyAtEpochDeg: 0,
	axialTiltDeg: SOL_LUNA_DEFAULT.axialTiltDeg,
	orbitRange: "outer",
	semiMajorAxisPlanetDiameters: 44.86,
	sizeClass: 1,
	albedo: SOL_LUNA_DEFAULT.albedo,
	greenhouseFactor: SOL_LUNA_DEFAULT.greenhouseFactor,
}

const LUNA_INNER_COMPANION: MoonBody = {
	idx: 1,
	massKg: SOL_LUNA_DEFAULT.massKg * 0.18,
	diameterKm: SOL_LUNA_DEFAULT.diameterKm * 0.57,
	group: "dwarf",
	classification: "rockball",
	landCoverage: 1,
	atmosphere: SOL_LUNA_DEFAULT.atmosphere,
	orbitalPeriodDays: SOL_LUNA_DEFAULT.orbitalPeriodDays * 0.56,
	siderealDayHours: SOL_LUNA_DEFAULT.orbitalPeriodDays * 0.56 * 24,
	eccentricity: 0.024,
	inclinationDeg: 2.6,
	longitudeOfAscendingNodeDeg: 0,
	longitudeOfPerihelionDeg: 0,
	meanAnomalyAtEpochDeg: 0,
	axialTiltDeg: SOL_LUNA_DEFAULT.axialTiltDeg,
	orbitRange: "inner",
	semiMajorAxisPlanetDiameters: 20.48,
	sizeClass: 1,
	albedo: SOL_LUNA_DEFAULT.albedo,
	greenhouseFactor: SOL_LUNA_DEFAULT.greenhouseFactor,
}

function isLunaMoonSeed(seed: number): boolean {
	return seed === LUNA_MOON_SEED
}

function withRandomizedAngles(baseMoon: MoonBody, seed: number): MoonBody {
	const rng = createRng(seed)
	return {
		...baseMoon,
		longitudeOfAscendingNodeDeg: rng.uniform(0, 360),
		longitudeOfPerihelionDeg: rng.uniform(0, 360),
		meanAnomalyAtEpochDeg: rng.uniform(0, 360),
	}
}

function generateLunaMoonSystem(count: number): MoonBody[] {
	if (count <= 0) return []
	if (count === 1) return [{ ...SOL_LUNA_DEFAULT, idx: 1 }]
	if (count === 2) {
		return [
			{ ...SOL_LUNA_DEFAULT, idx: 1 },
			{
				...withRandomizedAngles(LUNA_OUTER_COMPANION, LUNA_MOON_SEED + 1),
				idx: 2,
			},
		]
	}

	return [
		{
			...withRandomizedAngles(LUNA_INNER_COMPANION, LUNA_MOON_SEED + 2),
			idx: 1,
		},
		{ ...SOL_LUNA_DEFAULT, idx: 2 },
		{
			...withRandomizedAngles(LUNA_OUTER_COMPANION, LUNA_MOON_SEED + 1),
			idx: 3,
		},
	]
}

function rollDie(rng: ReturnType<typeof createRng>, sides: number): number {
	return rng.randint(1, sides)
}

function roll2d6(rng: ReturnType<typeof createRng>): number {
	return rollDie(rng, 6) + rollDie(rng, 6)
}

// Values >90° are kept as-is (not folded back into 0–90) — same convention
// planets use, where axial tilt past 90° is itself what makes a body's spin
// read as retrograde once composed with the render's tilt quaternion (see
// buildMoonMesh), rather than needing a separate retrograde flag.
function rollMoonAxialTiltDeg(rng: ReturnType<typeof createRng>): number {
	const standard = rollDie(rng, 6) + rollDie(rng, 6)
	if (standard <= 4) return rng.uniform(0.01, 0.1)
	if (standard <= 5) return rng.uniform(0.2, 1.2)
	if (standard <= 6) return rng.uniform(1, 6)
	if (standard <= 7) return rng.uniform(7, 12)
	if (standard <= 9) return rng.uniform(10, 35)
	const extreme = rollDie(rng, 6)
	if (extreme <= 2) return rng.uniform(20, 70)
	if (extreme <= 4) return rng.uniform(40, 90)
	if (extreme <= 5) return rng.uniform(91, 126)
	return rng.uniform(144, 180)
}

// Tidal-locking timescale falls off steeply with orbital distance, so
// close-in moons (Io, our own Moon) end up locked almost universally while
// distant/irregular moons often aren't — approximated here as a per-range
// chance rather than a universal assumption.
const TIDAL_LOCK_CHANCE_BY_RANGE: Record<MoonOrbitRange, number> = {
	inner: 0.97,
	middle: 0.8,
	outer: 0.45,
	extreme: 0.15,
}

// Rolls a moon's own sidereal rotation period, independent of its orbital
// period. Ported/adapted from the same sidereal-day dice feel used for
// planets (see generate-system-bodies.ts's rollSiderealDayHours) but without
// the tidal-lock cascade there, since we're rolling the lock itself here.
function rollMoonSiderealDayHours(
	rng: ReturnType<typeof createRng>,
	orbitRange: MoonOrbitRange,
	orbitalPeriodDays: number,
): number {
	const lockChance = TIDAL_LOCK_CHANCE_BY_RANGE[orbitRange]
	if (rng.uniform(0, 1) < lockChance) return orbitalPeriodDays * 24
	// Not tidally locked — spins independently, on the order of a fast
	// rotator (a few hours to a couple of days), same rough scale real
	// un-locked minor moons/asteroids fall into.
	let base = (roll2d6(rng) - 2) * 3 + 2 + rng.randint(1, 6)
	let rotation = base
	while (base > 40 && rng.randint(1, 6) >= 5) {
		base = (roll2d6(rng) - 2) * 3 + rng.randint(1, 6)
		rotation += base
	}
	return rotation * rng.uniform(0.95, 1.05)
}

export function rollMoonCountForParent(
	rng: ReturnType<typeof createRng>,
	parentGroup: ParentOrbitGroup,
	parentSizeClass: number,
	orbitalDistanceAU: number,
): number {
	if (parentGroup === "asteroid belt") return 0
	let roll = rollDie(rng, 6) + 2
	if (parentSizeClass < 1) roll = 0
	else if (parentSizeClass <= 2) roll = rollDie(rng, 6) - 5
	else if (parentSizeClass <= 9) roll = rollDie(rng, 6) + rollDie(rng, 6) - 8
	else if (parentSizeClass <= 15) roll = rollDie(rng, 6) + rollDie(rng, 6) - 6
	else if (parentSizeClass <= 16)
		roll = rollDie(rng, 6) + rollDie(rng, 6) + rollDie(rng, 6) - 7
	else
		roll =
			rollDie(rng, 6) + rollDie(rng, 6) + rollDie(rng, 6) + rollDie(rng, 6) - 6

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
}

function rollMoonSizeClass(
	rng: ReturnType<typeof createRng>,
	parentSizeClass: number,
	parentGroup: ParentOrbitGroup,
): number {
	const roll = rollDie(rng, 6)
	let sizeClass = 0
	const giant = parentGroup === "jovian"
	if (roll <= 3 || parentGroup === "asteroid belt") sizeClass = 0
	else if (roll <= 5) sizeClass = rollDie(rng, 3) - 1
	else if (!giant) {
		sizeClass = parentSizeClass - 1 - rollDie(rng, 6)
	} else {
		const roll2 = rollDie(rng, 6)
		if (roll2 <= 3) sizeClass = rollDie(rng, 6)
		else if (roll2 <= 5) sizeClass = rollDie(rng, 6) + rollDie(rng, 6) - 2
		else sizeClass = rollDie(rng, 6) + rollDie(rng, 6) + 4
		if (sizeClass === 16 && parentSizeClass === 16) sizeClass = 15
		else if (
			sizeClass === 16 &&
			parentSizeClass === 18 &&
			rollDie(rng, 6) + rollDie(rng, 6) >= 12
		) {
			sizeClass = 17
		}
	}

	if (!giant && sizeClass === parentSizeClass - 2) {
		const adjustmentRoll = rollDie(rng, 6) + rollDie(rng, 6)
		if (adjustmentRoll === 2) sizeClass = parentSizeClass - 1
		else if (adjustmentRoll === 12) sizeClass = parentSizeClass
	}

	if (sizeClass > parentSizeClass) sizeClass = 0
	return Math.max(0, sizeClass)
}

function rollMoonDiameterKm(
	rng: ReturnType<typeof createRng>,
	sizeClass: number,
): number {
	const [minKm, maxKm] =
		MOON_SIZE_DIAMETER_BANDS_KM[
			Math.max(0, Math.min(sizeClass, MOON_SIZE_DIAMETER_BANDS_KM.length - 1))
		]!
	return rng.uniform(minKm, maxKm)
}

function rollMoonOrbitCandidate(
	rng: ReturnType<typeof createRng>,
	morPd: number,
	moonMinimumPd: number,
	maxPd: number,
): { range: MoonOrbitRange; pd: number } | undefined {
	const availableRanges = MOON_ORBIT_RANGE_ORDER.map((range) => {
		const config = ORBIT_RANGE_CONFIG[range]
		const rangeMinPd = ROCHE_PD + morPd * config.minFactor
		const rangeMaxPd = Math.min(maxPd, ROCHE_PD + morPd * config.maxFactor)
		const usableMinPd = Math.max(moonMinimumPd, rangeMinPd)
		const usableWidthPd = rangeMaxPd - usableMinPd
		if (usableWidthPd <= 0) return undefined
		return {
			range,
			weight: config.weight * usableWidthPd,
		}
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

interface PendingMoon {
	massKg: number
	diameterKm: number
	sizeClass: number
	moonMinimumPd: number
	orbitRange: MoonOrbitRange
	radiusPd: number
}

function placeMoonOrbits(
	rng: ReturnType<typeof createRng>,
	moons: PendingMoon[],
	morPd: number,
	maxStablePd: number,
	minimumSpacingPd: number,
): Array<PendingMoon & { pd: number }> {
	const placedMoons: Array<PendingMoon & { pd: number }> = []
	let previousOuterPd = ROCHE_PD

	for (const range of MOON_ORBIT_RANGE_ORDER) {
		const rangeMoons = moons
			.filter((moon) => moon.orbitRange === range)
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
			const reservePd = rangeMoons
				.slice(index + 1)
				.reduce(
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

function rollMoonEccentricity(
	rng: ReturnType<typeof createRng>,
	range: MoonOrbitRange,
	sizeClass: number,
): number {
	let roll = rollDie(rng, 6) + rollDie(rng, 6)
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
}

export function derivePlanetMassKg(radiusKm: number): number {
	const r = radiusKm * 1000
	return EARTH_DENSITY_KG_M3 * (4 / 3) * Math.PI * r * r * r
}

export function resolveMoonOrbitHoursPerDay(
	hoursPerDay: number,
	tideLock: TideLock | null,
): number {
	return tideLock?.type === "solar"
		? SOLAR_LOCK_MOON_ORBIT_HOURS_PER_DAY
		: hoursPerDay
}

export function moonSemiMajorAxisM(
	moon: MoonBody,
	planetMassKg: number,
	hoursPerDay: number,
): number {
	const T = moon.orbitalPeriodDays * hoursPerDay * 3600
	return Math.cbrt((G * planetMassKg * T * T) / (TWO_PI * TWO_PI))
}

export function moonOrbitalPeriodDaysFromSemiMajorAxisM(
	semiMajorAxisM: number,
	planetMassKg: number,
	hoursPerDay: number,
): number {
	const periodSeconds =
		TWO_PI * Math.sqrt(semiMajorAxisM ** 3 / (G * planetMassKg))
	return periodSeconds / (hoursPerDay * 3600)
}

function hillSphereM(
	planetOrbitalDistanceM: number,
	planetMassKg: number,
	starMassKg: number,
): number {
	return planetOrbitalDistanceM * Math.cbrt(planetMassKg / (3 * starMassKg))
}

export function rocheLimitM(
	planetRadiusM: number,
	moonMassKg: number,
	moonDiameterM: number,
): number {
	const moonRadiusM = moonDiameterM / 2
	const moonVol = (4 / 3) * Math.PI * moonRadiusM * moonRadiusM * moonRadiusM
	const moonDensity = moonMassKg / moonVol
	return planetRadiusM * Math.cbrt((2 * EARTH_DENSITY_KG_M3) / moonDensity)
}

interface MoonPeriodBounds {
	minDays: number
	maxDays: number
	valid: boolean
}

export function moonPeriodBoundsDay(
	moon: MoonBody,
	planetMassKg: number,
	starMassKg: number,
	planetRadiusKm: number,
	orbitalDistanceAU: number,
	hoursPerDay: number,
): MoonPeriodBounds {
	const planetRadiusM = planetRadiusKm * 1000
	const moonDiameterM = moon.diameterKm * 1000
	const planetOrbitalDistanceM = orbitalDistanceAU * AU_M

	const roche = rocheLimitM(planetRadiusM, moon.massKg, moonDiameterM)
	const hill = hillSphereM(planetOrbitalDistanceM, planetMassKg, starMassKg)
	const maxStable = 0.5 * hill

	if (roche >= maxStable) {
		return { minDays: 0, maxDays: 0, valid: false }
	}

	const periodFromDist = (distM: number) => {
		const T = TWO_PI * Math.sqrt((distM * distM * distM) / (G * planetMassKg))
		return T / (hoursPerDay * 3600)
	}

	return {
		minDays: periodFromDist(roche * 1.5),
		maxDays: periodFromDist(maxStable),
		valid: true,
	}
}

interface OrbitalPosition {
	latRad: number
	lonRad: number
	distanceM: number
	trueAnomalyRad: number
}

interface OrbitalPositionVector {
	x: number
	y: number
	z: number
	distanceM: number
	trueAnomalyRad: number
}

function solveKeplersEquation(
	meanAnomalyRad: number,
	eccentricity: number,
): number {
	let E = meanAnomalyRad
	for (let i = 0; i < 10; i++) {
		const dE =
			(E - eccentricity * Math.sin(E) - meanAnomalyRad) /
			(1 - eccentricity * Math.cos(E))
		E -= dE
		if (Math.abs(dE) < 1e-10) break
	}
	return E
}

function keplerMoonPositionVector(
	moon: MoonBody,
	semiMajorAxisM: number,
	t: number,
): OrbitalPositionVector {
	const M0 = (moon.meanAnomalyAtEpochDeg * Math.PI) / 180
	const M = M0 + TWO_PI * (t / moon.orbitalPeriodDays)
	const Mnorm = ((M % TWO_PI) + TWO_PI) % TWO_PI

	const E = solveKeplersEquation(Mnorm, moon.eccentricity)

	const nu =
		2 *
		Math.atan2(
			Math.sqrt(1 + moon.eccentricity) * Math.sin(E / 2),
			Math.sqrt(1 - moon.eccentricity) * Math.cos(E / 2),
		)

	const r =
		(semiMajorAxisM * (1 - moon.eccentricity * moon.eccentricity)) /
		(1 + moon.eccentricity * Math.cos(nu))

	// Position in orbital plane (perifocal)
	const xOrb = r * Math.cos(nu)
	const yOrb = r * Math.sin(nu)

	// Euler rotations: ω (arg of periapsis), i (inclination), Ω (lon of ascending node)
	const omega = (moon.longitudeOfPerihelionDeg * Math.PI) / 180
	const inc = (moon.inclinationDeg * Math.PI) / 180
	const Omega = (moon.longitudeOfAscendingNodeDeg * Math.PI) / 180

	const cosO = Math.cos(Omega),
		sinO = Math.sin(Omega)
	const coso = Math.cos(omega),
		sino = Math.sin(omega)
	const cosI = Math.cos(inc),
		sinI = Math.sin(inc)

	// Rotation matrix columns (perifocal → equatorial)
	const x =
		(cosO * coso - sinO * sino * cosI) * xOrb +
		(-cosO * sino - sinO * coso * cosI) * yOrb
	const y =
		(sinO * coso + cosO * sino * cosI) * xOrb +
		(-sinO * sino + cosO * coso * cosI) * yOrb
	const z = sino * sinI * xOrb + coso * sinI * yOrb

	return { x, y, z, distanceM: r, trueAnomalyRad: nu }
}

function orbitalVectorToPlanetFixedPosition(
	vector: OrbitalPositionVector,
	t: number,
): OrbitalPosition {
	// Sub-moon point: account for planet rotation
	const planetRotationRad = TWO_PI * (t % 1)
	const lonRaw = Math.atan2(vector.y, vector.x) - planetRotationRad
	const lonRad = ((lonRaw % TWO_PI) + TWO_PI) % TWO_PI
	const latRad = Math.asin(vector.z / vector.distanceM)

	return {
		latRad,
		lonRad,
		distanceM: vector.distanceM,
		trueAnomalyRad: vector.trueAnomalyRad,
	}
}

export function keplerMoonPosition(
	moon: MoonBody,
	semiMajorAxisM: number,
	t: number,
): OrbitalPosition {
	return orbitalVectorToPlanetFixedPosition(
		keplerMoonPositionVector(moon, semiMajorAxisM, t),
		t,
	)
}

// Planet-centered Cartesian position (not corrected for planet rotation,
// unlike keplerMoonPosition's lat/lon) -- used for moon-to-moon separation,
// where what matters is the two moons' actual 3D positions relative to each
// other, not either one's sub-point on a rotating planet surface.
export function keplerMoonPositionCartesian(
	moon: MoonBody,
	semiMajorAxisM: number,
	t: number,
): { x: number; y: number; z: number } {
	return keplerMoonPositionVector(moon, semiMajorAxisM, t)
}

// Generate moons using the galaxy-gen-style size ladder and PD-based orbit bands.
// Multiple moons may share inner/middle/outer bands as long as minimum spacing is preserved.
export function generateMoons(
	count: number,
	seed: number,
	planetRadiusKm: number,
	orbitalDistanceAU: number,
	hoursPerDay: number,
	starMassKg: number,
	parentGroup: ParentOrbitGroup = "terrestrial",
): MoonBody[] {
	if (count <= 0) return []
	if (isLunaMoonSeed(seed)) return generateLunaMoonSystem(count)

	const rng = createRng(seed)
	const planetMassKg = derivePlanetMassKg(planetRadiusKm)
	const planetRadiusM = planetRadiusKm * 1000
	const planetDiameterM = planetRadiusM * 2
	const planetDiameterKm = planetRadiusKm * 2
	const planetOrbitalDistanceM = orbitalDistanceAU * AU_M

	const hill = hillSphereM(planetOrbitalDistanceM, planetMassKg, starMassKg)
	const maxStableM = 0.5 * hill
	const maxStablePd = maxStableM / planetDiameterM
	if (maxStablePd <= ROCHE_PD) return []
	const morPd = Math.max((maxStablePd - ROCHE_PD) / 1.1, 0.25)
	const parentSizeClass = estimateMoonSizeClassFromDiameter(planetDiameterKm)
	const minimumSpacingPd = Math.max(
		MINIMUM_MOON_SPACING_PD,
		morPd * MINIMUM_MOON_SPACING_SCALE,
	)

	const periodFromDist = (distM: number) => {
		const T = TWO_PI * Math.sqrt((distM * distM * distM) / (G * planetMassKg))
		return T / (hoursPerDay * 3600)
	}

	const moons: MoonBody[] = []
	const pendingMoons: PendingMoon[] = []

	for (let i = 0; i < count; i++) {
		const sizeClass = rollMoonSizeClass(rng, parentSizeClass, parentGroup)
		const diameterKm = rollMoonDiameterKm(rng, sizeClass)
		const moonDensity = rng.uniform(2200, 4000)
		const moonRadiusM = diameterKm * 500
		const moonVol = (4 / 3) * Math.PI * moonRadiusM * moonRadiusM * moonRadiusM
		const massKg = moonVol * moonDensity
		const rochePd =
			rocheLimitM(planetRadiusM, massKg, moonRadiusM * 2) / planetDiameterM
		const moonMinimumPd = Math.max(rochePd * 1.2, ROCHE_PD + minimumSpacingPd)
		const orbit = rollMoonOrbitCandidate(rng, morPd, moonMinimumPd, maxStablePd)
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

	for (const moon of placeMoonOrbits(
		rng,
		pendingMoons,
		morPd,
		maxStablePd,
		minimumSpacingPd,
	)) {
		const { pd, orbitRange, massKg, diameterKm, sizeClass } = moon

		const semiMajorM = pd * planetDiameterM
		const orbitalPeriodDays = periodFromDist(semiMajorM)
		const eccentricity = rollMoonEccentricity(rng, orbitRange, sizeClass)
		const inclinationDeg = rollInclinationDeg(rng)
		const longitudeOfAscendingNodeDeg = rng.uniform(0, 360)
		const longitudeOfPerihelionDeg = rng.uniform(0, 360)
		const meanAnomalyAtEpochDeg = rng.uniform(0, 360)
		const axialTiltDeg = rollMoonAxialTiltDeg(rng)

		moons.push({
			idx: moons.length + 1,
			massKg,
			diameterKm,
			orbitalPeriodDays,
			siderealDayHours: rollMoonSiderealDayHours(
				rng,
				orbitRange,
				orbitalPeriodDays,
			),
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
			atmosphere: DEFAULT_MOON_ATMOSPHERE,
			landCoverage: 0,
		})
	}

	return moons
}
