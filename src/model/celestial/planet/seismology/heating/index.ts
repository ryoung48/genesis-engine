import type { OrbitGroup } from "@/model/celestial/orbit-body/types"
import type { MoonTidalHeatingInput } from "@/model/celestial/planet/seismology/heating/types"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"

function computeResidualHeating(params: {
	sizeClass: number
	starAgeGyr: number
	densityEarthRelative: number
	moonSizeClassTotal: number
	isMoon: boolean
	group: OrbitGroup
}): number {
	if (params.group === "asteroid belt") return 0
	let stress = params.sizeClass - params.starAgeGyr
	if (params.isMoon) stress += 1
	if (params.densityEarthRelative > 1) stress += 2
	if (params.densityEarthRelative < 0.5) stress -= 1
	stress += params.moonSizeClassTotal
	if (stress < 1) return 0
	return Math.floor(stress) ** 2
}
/** Ported from galaxy-gen's SEISMOLOGY.tides.heating -- a moon whose orbit
 * puts this above MAX_SAFE_MOON_TIDAL_HEATING would be tidally shredded
 * rather than merely reclassified (see nextSeismologyClass's much lower
 * >5/>20/>1000 thresholds, which are about surface effects, not survival).
 * Exported as raw numeric params (rather than requiring a built SystemBody)
 * so generate-system-bodies.ts can call this mid-construction, before a
 * moon's parent planet object exists yet. */
function computeMoonTidalHeatingRaw(params: {
	parentMassKg: number
	parentDiameterKm: number
	moonDiameterKm: number
	moonMassKg: number
	semiMajorAxisPlanetDiameters: number
	orbitalPeriodDays: number
	eccentricity: number
	densityEarthRelative: number
}): number {
	const distanceMillionKm =
		(params.semiMajorAxisPlanetDiameters * params.parentDiameterKm) / 1e6
	if (
		distanceMillionKm <= 0 ||
		params.orbitalPeriodDays <= 0 ||
		params.moonMassKg <= 0 ||
		params.densityEarthRelative <= 0
	) {
		return 0
	}

	return (
		(10.83 *
			(params.parentMassKg / ORBIT_BODY.earthMassKg) ** 2 *
			(params.moonDiameterKm / ORBIT_BODY.earthDiameterKm) ** 2 *
			params.eccentricity ** 2) /
		(distanceMillionKm ** 5 *
			params.orbitalPeriodDays *
			params.densityEarthRelative)
	)
}

// Ported from galaxy-gen's MAX_SAFE_MOON_TIDAL_HEATING (orbits/seismology).
const MAX_SAFE_MOON_TIDAL_HEATING = 5_000

function computeMoonTidalHeating({
	parent,
	moon,
}: MoonTidalHeatingInput): number {
	return computeMoonTidalHeatingRaw({
		parentMassKg: parent.massKg,
		parentDiameterKm: parent.diameterKm,
		moonDiameterKm: moon.diameterKm,
		moonMassKg: moon.massKg,
		semiMajorAxisPlanetDiameters: moon.semiMajorAxisPlanetDiameters ?? 0,
		orbitalPeriodDays: moon.orbitalPeriodDays,
		eccentricity: moon.eccentricity,
		densityEarthRelative: moon.density?.earthRelative ?? 0,
	})
}

export const HEATING = {
	computeResidualHeating,
	computeMoonTidalHeatingRaw,
	computeMoonTidalHeating,
	MAX_SAFE_MOON_TIDAL_HEATING,
}
