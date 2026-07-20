import {
	computeEarthRelativeDensity as computeBodyEarthRelativeDensity,
	computeGravityG,
	massKgFromEarthRelativeDensity,
} from "@/model/celestial/body-metrics"
import type { MoonBody } from "@/model/celestial/moons/moon-types"
import { estimateMoonSizeClassFromDiameter } from "@/model/celestial/moons/moon-utils"
import { moonOrbitalPeriodDaysFromSemiMajorAxisM } from "@/model/celestial/moons/orbital-mechanics"
import { getKeplerYearYears } from "@/model/celestial/star/star-types"
import type { SystemBody } from "@/model/celestial/system/generate-system-bodies"
import { estimatePlanetarySizeClass } from "@/model/celestial/system/size-class"
import {
	estimateDeviationFromOrbitalDistance,
	zoneFromDeviation,
} from "@/model/celestial/system/system-environment"
import { DAYS_PER_YEAR } from "./constants"

export function updateBodyDiameter(
	body: SystemBody,
	diameterKm: number,
): SystemBody {
	const densityEarthRelative =
		body.density?.earthRelative ??
		computeBodyEarthRelativeDensity(body.massKg, body.diameterKm)
	const massKg = massKgFromEarthRelativeDensity(
		diameterKm,
		densityEarthRelative,
	)
	return {
		...body,
		diameterKm,
		massKg,
		gravityG: computeGravityG(massKg, diameterKm),
		sizeClass: estimatePlanetarySizeClass(diameterKm, body.group === "jovian"),
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
		zone: zoneFromDeviation(
			estimateDeviationFromOrbitalDistance(
				orbitalDistanceAU,
				starLuminositySol,
			),
		),
		orbitalPeriodDays:
			getKeplerYearYears(orbitalDistanceAU, starMassSol) * DAYS_PER_YEAR,
	}
}

export function updateMoonDiameter(
	moon: MoonBody,
	diameterKm: number,
): MoonBody {
	const densityEarthRelative =
		moon.density?.earthRelative ??
		computeBodyEarthRelativeDensity(moon.massKg, moon.diameterKm)
	const massKg = massKgFromEarthRelativeDensity(
		diameterKm,
		densityEarthRelative,
	)
	return {
		...moon,
		diameterKm,
		massKg,
		sizeClass: estimateMoonSizeClassFromDiameter(diameterKm),
		density: moon.density
			? { ...moon.density, earthRelative: densityEarthRelative }
			: moon.density,
	}
}

export function updateMoonSemiMajorAxis(
	moon: MoonBody,
	parentBody: SystemBody,
	pd: number,
	hoursPerDay: number,
): MoonBody {
	const semiMajorAxisM = pd * parentBody.diameterKm * 1000
	return {
		...moon,
		semiMajorAxisPlanetDiameters: pd,
		orbitalPeriodDays: moonOrbitalPeriodDaysFromSemiMajorAxisM(
			semiMajorAxisM,
			parentBody.massKg,
			hoursPerDay,
		),
	}
}
