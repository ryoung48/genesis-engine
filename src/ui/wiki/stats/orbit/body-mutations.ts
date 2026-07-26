import type { MoonBody } from "@/model/celestial/moons"
import {
	MOON,
	moonOrbitalPeriodDaysFromSemiMajorAxisM,
} from "@/model/celestial/moons"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import { PLANET } from "@/model/celestial/planet"
import { STAR } from "@/model/celestial/star"
import type { SystemBody } from "@/model/celestial/system"
import { SYSTEM } from "@/model/celestial/system"

export function updateBodyDiameter(
	body: SystemBody,
	diameterKm: number,
): SystemBody {
	const densityEarthRelative =
		body.density?.earthRelative ??
		ORBIT_BODY.computeEarthRelativeDensity({
			massKg: body.massKg,
			diameterKm: body.diameterKm,
		})
	const massKg = ORBIT_BODY.massKgFromEarthRelativeDensity({
		diameterKm,
		densityEarthRelative,
	})
	return {
		...body,
		diameterKm,
		massKg,
		gravityG: ORBIT_BODY.computeGravityG({ massKg, diameterKm }),
		sizeClass: PLANET.estimatePlanetarySizeClass({
			diameterKm,
			isGasGiant: body.group === "jovian",
		}),
		density: body.density
			? {
					...body.density,
					earthRelative: densityEarthRelative,
				}
			: body.density,
	}
}

export function updateBodyOrbitalDistance(
	body: SystemBody,
	orbitalDistanceAU: number,
	starMassSol: number,
	starLuminositySol: number,
): SystemBody {
	return {
		...body,
		orbitalDistanceAU,
		zone: PLANET.zoneFromDeviation(
			PLANET.estimateDeviationFromOrbitalDistance({
				orbitalDistanceAU,
				luminositySol: starLuminositySol,
			}),
		),
		orbitalPeriodDays:
			STAR.getKeplerYearYears({ orbitalDistanceAU, massSol: starMassSol }) *
			SYSTEM.DAYS_PER_YEAR,
	}
}

export function updateMoonDiameter(
	moon: MoonBody,
	diameterKm: number,
): MoonBody {
	const densityEarthRelative =
		moon.density?.earthRelative ??
		ORBIT_BODY.computeEarthRelativeDensity({
			massKg: moon.massKg,
			diameterKm: moon.diameterKm,
		})
	const massKg = ORBIT_BODY.massKgFromEarthRelativeDensity({
		diameterKm,
		densityEarthRelative,
	})
	return {
		...moon,
		diameterKm,
		massKg,
		sizeClass: MOON.estimateMoonSizeClassFromDiameter(diameterKm),
		density: moon.density
			? { ...moon.density, earthRelative: densityEarthRelative }
			: moon.density,
	}
}

export function updateMoonSemiMajorAxis(
	moon: MoonBody,
	parentBody: SystemBody,
	pd: number,
): MoonBody {
	const semiMajorAxisM = pd * parentBody.diameterKm * 1000
	return {
		...moon,
		semiMajorAxisPlanetDiameters: pd,
		orbitalPeriodDays: moonOrbitalPeriodDaysFromSemiMajorAxisM({
			semiMajorAxisM,
			planetMassKg: parentBody.massKg,
		}),
	}
}
