import { SEED_MAX } from "../../shared/planet-code"
import { createRng } from "../../shared/rng"
import {
	MOON_DEFAULTS,
	type MoonOrbitRange,
	type MoonParams,
} from "./moon-types"

const G = 6.674e-11
const M_SOL_KG = 1.989e30
const AU_M = 1.496e11
const EARTH_DENSITY_KG_M3 = 5515
const TWO_PI = 2 * Math.PI

export { M_SOL_KG, AU_M }
export const LUNA_MOON_SEED = SEED_MAX - 1

const ROCHE_PD = 2
const MINIMUM_MOON_SPACING_PD = 0.6
const MINIMUM_MOON_SPACING_SCALE = 0.03
const EXTREME_ORBIT_SKIP_CHANCE = 0.65
const MOON_SIZE_DIAMETER_BANDS_KM = [
	[400, 800],
	[1000, 2000],
	[2800, 3600],
	[4000, 5600],
	[5600, 7200],
	[7200, 8800],
	[8800, 10400],
	[10400, 12000],
	[12000, 13600],
	[13600, 15200],
	[15200, 16800],
	[16800, 18400],
	[18400, 20000],
	[20000, 21600],
	[21600, 23199],
	[23200, 24800],
] as const
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

const LUNA_OUTER_COMPANION: MoonParams = {
	id: 2,
	massKg: MOON_DEFAULTS.massKg * 0.34,
	diameterKm: MOON_DEFAULTS.diameterKm * 0.72,
	orbitalPeriodDays: MOON_DEFAULTS.orbitalPeriodDays * 1.82,
	eccentricity: 0.038,
	inclinationDeg: 4.8,
	longitudeOfAscendingNodeDeg: 0,
	argumentOfPeriapsisDeg: 0,
	meanAnomalyAtEpochDeg: 0,
	orbitRange: "outer",
	semiMajorAxisPlanetDiameters: 44.86,
	sizeClass: 1,
}

const LUNA_INNER_COMPANION: MoonParams = {
	id: 1,
	massKg: MOON_DEFAULTS.massKg * 0.18,
	diameterKm: MOON_DEFAULTS.diameterKm * 0.57,
	orbitalPeriodDays: MOON_DEFAULTS.orbitalPeriodDays * 0.56,
	eccentricity: 0.024,
	inclinationDeg: 2.6,
	longitudeOfAscendingNodeDeg: 0,
	argumentOfPeriapsisDeg: 0,
	meanAnomalyAtEpochDeg: 0,
	orbitRange: "inner",
	semiMajorAxisPlanetDiameters: 20.48,
	sizeClass: 1,
}

export function isLunaMoonSeed(seed: number): boolean {
	return seed === LUNA_MOON_SEED
}

function withRandomizedAngles(baseMoon: MoonParams, seed: number): MoonParams {
	const rng = createRng(seed)
	return {
		...baseMoon,
		longitudeOfAscendingNodeDeg: rng.uniform(0, 360),
		argumentOfPeriapsisDeg: rng.uniform(0, 360),
		meanAnomalyAtEpochDeg: rng.uniform(0, 360),
	}
}

function generateLunaMoonSystem(count: number): MoonParams[] {
	if (count <= 0) return []
	if (count === 1) return [{ ...MOON_DEFAULTS, id: 1 }]
	if (count === 2) {
		return [
			{ ...MOON_DEFAULTS, id: 1 },
			{ ...withRandomizedAngles(LUNA_OUTER_COMPANION, LUNA_MOON_SEED + 1), id: 2 },
		]
	}

	return [
		{ ...withRandomizedAngles(LUNA_INNER_COMPANION, LUNA_MOON_SEED + 2), id: 1 },
		{ ...MOON_DEFAULTS, id: 2 },
		{ ...withRandomizedAngles(LUNA_OUTER_COMPANION, LUNA_MOON_SEED + 1), id: 3 },
	]
}

function rollDie(rng: ReturnType<typeof createRng>, sides: number): number {
	return rng.randint(1, sides)
}

function rollMoonInclination(
	rng: ReturnType<typeof createRng>,
	orbitRange: MoonOrbitRange,
): number {
	// Retrograde probability and inclination ranges by orbit class.
	// Inner/middle moons formed in-situ: nearly coplanar, rarely retrograde.
	// Outer/extreme moons are often captured bodies: high inclination, frequently retrograde.
	const retrogradeChance =
		orbitRange === "extreme" ? 0.65
		: orbitRange === "outer" ? 0.35
		: orbitRange === "middle" ? 0.05
		: 0.02 // inner

	const isRetrograde = rng.uniform(0, 1) < retrogradeChance

	if (isRetrograde) {
		// Retrograde: 90°–175° (peaked toward 120°–160° for captured objects)
		const base = orbitRange === "inner" || orbitRange === "middle"
			? rng.uniform(95, 175)
			: rng.uniform(100, 175)
		return base
	}

	// Prograde: low inclination for inner/middle, higher for outer/extreme
	const maxInc =
		orbitRange === "extreme" ? 45
		: orbitRange === "outer" ? 30
		: orbitRange === "middle" ? 15
		: 5 // inner
	return rng.uniform(0, maxInc)
}

function rollMoonAxialTilt(rng: ReturnType<typeof createRng>): {
	axialTiltDeg: number
	retrogradeRotation: boolean
} {
	const raw = (() => {
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
	})()
	// Values >90 indicate retrograde rotation; fold back into 0–90 range.
	if (raw > 90) return { axialTiltDeg: 180 - raw, retrogradeRotation: true }
	return { axialTiltDeg: raw, retrogradeRotation: false }
}

function inferPlanetSizeClass(planetDiameterKm: number): number {
	let closestSizeClass = 0
	let closestDelta = Number.POSITIVE_INFINITY
	for (
		let sizeClass = 0;
		sizeClass < MOON_SIZE_DIAMETER_BANDS_KM.length;
		sizeClass++
	) {
		const [minKm, maxKm] = MOON_SIZE_DIAMETER_BANDS_KM[sizeClass]!
		const midpointKm = (minKm + maxKm) / 2
		const delta = Math.abs(planetDiameterKm - midpointKm)
		if (delta < closestDelta) {
			closestDelta = delta
			closestSizeClass = sizeClass
		}
	}
	return closestSizeClass
}

function rollMoonSizeClass(
	rng: ReturnType<typeof createRng>,
	parentSizeClass: number,
): number {
	const roll = rollDie(rng, 6)
	let sizeClass = 0
	if (roll <= 3) sizeClass = 0
	else if (roll <= 5) sizeClass = rollDie(rng, 3) - 1
	else sizeClass = parentSizeClass - 1 - rollDie(rng, 6)

	if (sizeClass === parentSizeClass - 2) {
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
}

function placeMoonOrbits(
	rng: ReturnType<typeof createRng>,
	moons: PendingMoon[],
	morPd: number,
	maxStablePd: number,
	minimumSpacingPd: number,
): Array<PendingMoon & { pd: number }> {
	const placedMoons: Array<PendingMoon & { pd: number }> = []
	let previousPd = ROCHE_PD

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
			const remainingInBand = rangeMoons.length - index - 1
			const minPd = Math.max(
				moon.moonMinimumPd,
				rangeMinPd,
				previousPd + minimumSpacingPd,
			)
			const maxPd = rangeMaxPd - remainingInBand * minimumSpacingPd
			if (maxPd <= minPd) continue

			const pd = rng.uniform(minPd, maxPd)
			placedMoons.push({ ...moon, pd })
			previousPd = pd
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

export function moonSemiMajorAxisM(
	moon: MoonParams,
	planetMassKg: number,
	hoursPerDay: number,
): number {
	const T = moon.orbitalPeriodDays * hoursPerDay * 3600
	return Math.cbrt((G * planetMassKg * T * T) / (TWO_PI * TWO_PI))
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
	moon: MoonParams,
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

export function keplerMoonPosition(
	moon: MoonParams,
	semiMajorAxisM: number,
	t: number,
): OrbitalPosition {
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
	const omega = (moon.argumentOfPeriapsisDeg * Math.PI) / 180
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

	// Sub-moon point: account for planet rotation
	const planetRotationRad = TWO_PI * (t % 1)
	const lonRaw = Math.atan2(y, x) - planetRotationRad
	const lonRad = ((lonRaw % TWO_PI) + TWO_PI) % TWO_PI
	const latRad = Math.asin(z / r)

	return { latRad, lonRad, distanceM: r, trueAnomalyRad: nu }
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
): MoonParams[] {
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
	const parentSizeClass = inferPlanetSizeClass(planetDiameterKm)
	const minimumSpacingPd = Math.max(
		MINIMUM_MOON_SPACING_PD,
		morPd * MINIMUM_MOON_SPACING_SCALE,
	)

	const periodFromDist = (distM: number) => {
		const T = TWO_PI * Math.sqrt((distM * distM * distM) / (G * planetMassKg))
		return T / (hoursPerDay * 3600)
	}

	const moons: MoonParams[] = []
	const pendingMoons: PendingMoon[] = []

	for (let i = 0; i < count; i++) {
		const sizeClass = rollMoonSizeClass(rng, parentSizeClass)
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
		const inclinationDeg = rollMoonInclination(rng, orbitRange)
		const longitudeOfAscendingNodeDeg = rng.uniform(0, 360)
		const argumentOfPeriapsisDeg = rng.uniform(0, 360)
		const meanAnomalyAtEpochDeg = rng.uniform(0, 360)
		const { axialTiltDeg, retrogradeRotation } = rollMoonAxialTilt(rng)

		moons.push({
			id: moons.length + 1,
			massKg,
			diameterKm,
			orbitalPeriodDays,
			eccentricity,
			inclinationDeg,
			longitudeOfAscendingNodeDeg,
			argumentOfPeriapsisDeg,
			meanAnomalyAtEpochDeg,
			axialTiltDeg,
			retrogradeRotation,
			orbitRange,
			semiMajorAxisPlanetDiameters: pd,
			sizeClass,
		})
	}

	return moons
}
