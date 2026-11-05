import { MECHANICS } from "@/model/celestial/moons/mechanics"
import type { MoonBody } from "@/model/celestial/moons/types"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import { STAR } from "@/model/celestial/star"
import type {
	LockedToMoonParams,
	PrepareContributorsParams,
	PreparedContributors,
	StarDiameterParams,
	StarMassParams,
	ValidateMoonParams,
} from "@/model/climate/ocean/tides/tidal-schedule/contributors/types"

function starMassKg({ spectralClass, starSubtype }: StarMassParams): number {
	const cls = STAR.isValidSpectralClass(spectralClass)
		? (spectralClass as (typeof STAR.mainSequenceClasses)[number])
		: STAR.defaultSpectralClass
	return (
		STAR.getStarMassSol({ cls, subtype: starSubtype }) * ORBIT_BODY.solarMassKg
	)
}

function starDiameterM({
	spectralClass,
	starSubtype,
	starDiameterSol,
}: StarDiameterParams): number {
	if (
		starDiameterSol !== undefined &&
		Number.isFinite(starDiameterSol) &&
		starDiameterSol > 0
	)
		return starDiameterSol * 1.392e9
	const cls = STAR.isValidSpectralClass(spectralClass)
		? spectralClass
		: STAR.defaultSpectralClass
	return STAR.getStarDiameterSol({ cls, subtype: starSubtype }) * 1.392e9
}

function validateMoon({
	moon,
	planetMassKg,
	starMassKg,
	planetRadiusKm,
	orbitalDistanceAU,
}: ValidateMoonParams): { moon: MoonBody; clamped: boolean } {
	const bounds = MECHANICS.moonPeriodBoundsDay({
		moon,
		planetMassKg,
		starMassKg,
		planetRadiusKm,
		orbitalDistanceAU,
	})
	if (!bounds.valid) {
		return { moon: { ...moon, orbitalPeriodDays: 0 }, clamped: true }
	}

	let clamped = false
	let { orbitalPeriodDays, eccentricity } = moon

	if (orbitalPeriodDays < bounds.minDays) {
		orbitalPeriodDays = bounds.minDays
		clamped = true
	} else if (orbitalPeriodDays > bounds.maxDays) {
		orbitalPeriodDays = bounds.maxDays
		clamped = true
	}

	// Recompute semi-major axis after period clamp to validate eccentricity
	const a = MECHANICS.moonSemiMajorAxisM({
		moon: { ...moon, orbitalPeriodDays },
		planetMassKg,
	})
	const planetRadiusM = planetRadiusKm * 1000
	const moonDiameterM = moon.diameterKm * 1000
	const roche = MECHANICS.rocheLimitM({
		planetRadiusM,
		moonMassKg: moon.massKg,
		moonDiameterM,
	})
	const eMax = Math.max(0, 1 - roche / a)
	if (eccentricity > eMax) {
		eccentricity = eMax * 0.9
		clamped = true
	}

	return { moon: { ...moon, orbitalPeriodDays, eccentricity }, clamped }
}

function prepare({
	moons,
	params,
}: PrepareContributorsParams): PreparedContributors {
	const { planetRadiusKm, orbitalDistanceAU } = params
	const planetMassKg = MECHANICS.derivePlanetMassKg(planetRadiusKm)
	const stellarMassKg = starMassKg(params)
	let moonsClamped = false
	const prepared: MoonBody[] = []
	for (const moon of moons) {
		const result = validateMoon({
			moon,
			planetMassKg,
			starMassKg: stellarMassKg,
			planetRadiusKm,
			orbitalDistanceAU,
		})
		if (result.clamped) moonsClamped = true
		if (result.moon.orbitalPeriodDays > 0) prepared.push(result.moon)
	}
	return { moons: prepared, moonsClamped }
}

function lockedToMoon({ tideLock, moon }: LockedToMoonParams): boolean {
	return tideLock?.type === "lunar" && tideLock.target === moon.idx
}

export const TIDAL_CONTRIBUTORS = {
	prepare,
	starMassKg,
	starDiameterM,
	lockedToMoon,
}
