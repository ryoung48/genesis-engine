import type { MoonBody } from "@/model/celestial/moons/moon-types"
import type { MainSequenceClass } from "@/model/celestial/star/star-types"
import { createRng } from "@/model/shared/rng"
import type { SystemBody } from "./generate-system-bodies"
import {
	buildClassificationEnvironment,
	classifyGroup,
	estimateDeviationFromOrbitalDistance,
	type OrbitClassification,
	type OrbitGroup,
	zoneFromDeviation,
} from "./system-environment"

const EARTH_DIAMETER_KM = 12_742
const EARTH_MASS_KG = 5.973886146404331e24

interface SeismologyProfile {
	residualHeating: number
	tidalHeating: number
	/** Theoretical-max equilibrium surface tide (see computeSurfaceTidesM /
	 * computeMoonSurfaceTidesM in climate/tidal-schedule.ts), folded into
	 * totalHeating/regime alongside residual and tidal heating -- 0 when the
	 * caller didn't supply a surface-tides callback (see
	 * applySystemSeismology's getSurfaceTidesHeatingForBody/Moon params). */
	surfaceTidesHeating: number
	totalHeating: number
	regime: "dead" | "low" | "active" | "extreme"
}

function describeRegime(totalHeating: number): SeismologyProfile["regime"] {
	if (totalHeating > 100) return "extreme"
	if (totalHeating > 10) return "active"
	if (totalHeating > 1) return "low"
	return "dead"
}

function computeResidualHeating(params: {
	sizeClass: number
	starAgeGyr: number
	densityEarthRelative: number
	moonSizeClassTotal: number
	isMoon: boolean
	group?: OrbitGroup
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
export function computeMoonTidalHeatingRaw(params: {
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
			(params.parentMassKg / EARTH_MASS_KG) ** 2 *
			(params.moonDiameterKm / EARTH_DIAMETER_KM) ** 2 *
			params.eccentricity ** 2) /
		(distanceMillionKm ** 5 *
			params.orbitalPeriodDays *
			params.densityEarthRelative)
	)
}

// Ported from galaxy-gen's MAX_SAFE_MOON_TIDAL_HEATING (orbits/seismology).
export const MAX_SAFE_MOON_TIDAL_HEATING = 5_000

function computeMoonTidalHeating(parent: SystemBody, moon: MoonBody): number {
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

function seedForBody(body: SystemBody): number {
	return (body.idx + 2) * 10_007 + Math.round(body.orbitalDistanceAU * 1_000)
}

function seedForMoon(parent: SystemBody, moon: MoonBody): number {
	return (
		(parent.idx + 2) * 100_003 +
		moon.idx * 10_007 +
		Math.round((moon.semiMajorAxisPlanetDiameters ?? 0) * 1_000)
	)
}

function pickHeatedClass(
	current: OrbitClassification,
	sizeClass: number,
	seed: number,
): OrbitClassification {
	if (current !== "rockball" && current !== "geo-cyclic") return current
	if (sizeClass >= 4)
		return createRng(seed).uniform(0, 1) < 1 / 3 ? "geo-tidal" : "hebean"
	return "hebean"
}

function nextSeismologyClass(params: {
	current: OrbitClassification
	group?: OrbitGroup
	zone: ReturnType<typeof zoneFromDeviation>
	sizeClass: number
	tidalHeating: number
	totalHeating: number
	seed: number
}): OrbitClassification {
	let next = params.current
	if (
		(next === "rockball" || next === "geo-cyclic") &&
		params.tidalHeating > 5
	) {
		next = pickHeatedClass(next, params.sizeClass, params.seed)
	} else if (next === "rockball" && params.totalHeating > 20) {
		next = "geo-cyclic"
	} else if (
		(next === "geo-cyclic" || next === "geo-tidal" || next === "hebean") &&
		params.totalHeating < 1
	) {
		next = params.zone === "outer" ? "snowball" : "rockball"
	} else if (
		(next === "geo-tidal" || next === "hebean") &&
		params.tidalHeating < 1
	) {
		next = "geo-cyclic"
	}

	if (params.group === "dwarf" && params.totalHeating > 1_000) {
		return "meltball"
	}
	return next
}

function applyBodySeismology(params: {
	body: SystemBody
	starAgeGyr: number
	surfaceTidesHeating: number
}): SystemBody {
	const { body, starAgeGyr, surfaceTidesHeating } = params
	if (body.group === "asteroid belt") {
		return {
			...body,
			seismology: {
				residualHeating: 0,
				tidalHeating: 0,
				surfaceTidesHeating: 0,
				totalHeating: 0,
				regime: "dead",
			},
		}
	}

	const densityEarthRelative = body.density?.earthRelative ?? 0
	const residualHeating = computeResidualHeating({
		sizeClass: body.sizeClass,
		starAgeGyr,
		densityEarthRelative,
		moonSizeClassTotal: body.moons.reduce(
			(sum, moon) => sum + (moon.sizeClass ?? 0),
			0,
		),
		isMoon: false,
		group: body.group,
	})
	const totalHeating = residualHeating + surfaceTidesHeating
	const seismology: SeismologyProfile = {
		residualHeating,
		tidalHeating: 0,
		surfaceTidesHeating,
		totalHeating,
		regime: describeRegime(totalHeating),
	}
	return { ...body, seismology }
}

function applyMoonSeismology(params: {
	parent: SystemBody
	moon: MoonBody
	starAgeGyr: number
	starLuminositySol: number
	spectralClass: MainSequenceClass
	surfaceTidesHeating: number
}): MoonBody {
	const {
		parent,
		moon,
		starAgeGyr,
		starLuminositySol,
		spectralClass,
		surfaceTidesHeating,
	} = params
	const sizeClass = moon.sizeClass ?? 0
	const densityEarthRelative = moon.density?.earthRelative ?? 0
	const residualHeating = computeResidualHeating({
		sizeClass,
		starAgeGyr,
		densityEarthRelative,
		moonSizeClassTotal: 0,
		isMoon: true,
		group: moon.group,
	})
	const tidalHeating = computeMoonTidalHeating(parent, moon)
	const totalHeating = residualHeating + tidalHeating + surfaceTidesHeating
	const deviation = estimateDeviationFromOrbitalDistance(
		parent.orbitalDistanceAU,
		starLuminositySol,
	)
	const zone = zoneFromDeviation(deviation)
	const currentClassification =
		(moon.classification as OrbitClassification | undefined) ?? "rockball"
	const nextClassification = nextSeismologyClass({
		current: currentClassification,
		group: moon.group,
		zone,
		sizeClass,
		tidalHeating,
		totalHeating,
		seed: seedForMoon(parent, moon),
	})
	const shouldReclassify = nextClassification !== currentClassification
	const nextGroup = moon.group ?? classifyGroup({ sizeClass })
	const rerolled = shouldReclassify
		? buildClassificationEnvironment({
				rng: createRng(seedForMoon(parent, moon)),
				group: nextGroup,
				classification: nextClassification,
				sizeClass,
				zone,
				deviation,
				spectralClass,
				diameterKm: moon.diameterKm,
				massKg: moon.massKg,
				isPrimaryWorld: false,
			})
		: null

	return {
		...moon,
		group: nextGroup,
		classification: nextClassification,
		density: rerolled?.density ?? moon.density,
		subtype: rerolled?.subtype ?? moon.subtype,
		composition: rerolled?.composition ?? moon.composition,
		chemistry: rerolled?.chemistry ?? moon.chemistry,
		hydrosphereCode: rerolled?.hydrosphereCode ?? moon.hydrosphereCode,
		hydrosphere: rerolled?.hydrosphere ?? moon.hydrosphere,
		landCoverage: rerolled?.landCoverage ?? moon.landCoverage,
		atmosphere: rerolled?.atmosphere ?? moon.atmosphere,
		greenhouseFactor: rerolled?.greenhouseFactor ?? moon.greenhouseFactor,
		seismology: {
			residualHeating,
			tidalHeating,
			surfaceTidesHeating,
			totalHeating,
			regime: describeRegime(totalHeating),
		},
	}
}

export function applySystemSeismology(params: {
	bodies: SystemBody[]
	starAgeGyr: number
	starLuminositySol: number
	spectralClass: MainSequenceClass
	/** Optional hooks for folding each body/moon's theoretical-max surface
	 * tide into totalHeating/regime alongside residual and tidal heating.
	 * Callbacks rather than a direct import of climate/tidal-schedule.ts's
	 * computeSurfaceTidesM/computeMoonSurfaceTidesM, which would otherwise
	 * create a module cycle: tidal-schedule.ts -> orbital-mechanics.ts ->
	 * sol-system.ts -> system-seismology.ts. Omit for callers (e.g.
	 * sol-system.ts's own top-level SOL_SYSTEM_BODIES, which every real
	 * caller re-runs this over anyway once real generation params are known)
	 * that can't supply real numbers yet -- surfaceTidesHeating is then 0. */
	getSurfaceTidesHeatingForBody?: (body: SystemBody) => number
	getSurfaceTidesHeatingForMoon?: (parent: SystemBody, moon: MoonBody) => number
}): SystemBody[] {
	return params.bodies.map((body) => {
		const seismologyBody = applyBodySeismology({
			body,
			starAgeGyr: params.starAgeGyr,
			surfaceTidesHeating: params.getSurfaceTidesHeatingForBody?.(body) ?? 0,
		})
		const moons = body.moons.map((moon) =>
			applyMoonSeismology({
				parent: seismologyBody,
				moon,
				starAgeGyr: params.starAgeGyr,
				starLuminositySol: params.starLuminositySol,
				spectralClass: params.spectralClass,
				surfaceTidesHeating:
					params.getSurfaceTidesHeatingForMoon?.(seismologyBody, moon) ?? 0,
			}),
		)
		const currentClassification = seismologyBody.classification
		const nextClassification = nextSeismologyClass({
			current: currentClassification,
			group: seismologyBody.group,
			zone: zoneFromDeviation(
				estimateDeviationFromOrbitalDistance(
					seismologyBody.orbitalDistanceAU,
					params.starLuminositySol,
				),
			),
			sizeClass: seismologyBody.sizeClass,
			tidalHeating: 0,
			totalHeating: seismologyBody.seismology?.totalHeating ?? 0,
			seed: seedForBody(seismologyBody),
		})
		if (nextClassification === currentClassification) {
			return { ...seismologyBody, moons }
		}
		const deviation = estimateDeviationFromOrbitalDistance(
			seismologyBody.orbitalDistanceAU,
			params.starLuminositySol,
		)
		const rerolled = buildClassificationEnvironment({
			rng: createRng(seedForBody(seismologyBody)),
			group: seismologyBody.group,
			classification: nextClassification,
			sizeClass: seismologyBody.sizeClass,
			zone: zoneFromDeviation(deviation),
			deviation,
			spectralClass: params.spectralClass,
			diameterKm: seismologyBody.diameterKm,
			massKg: seismologyBody.massKg,
			isPrimaryWorld: seismologyBody.isMainWorld,
			greenhouseMode: seismologyBody.isMainWorld ? "estimate" : "roll",
		})
		return {
			...seismologyBody,
			classification: nextClassification,
			density: rerolled.density,
			subtype: rerolled.subtype,
			composition: rerolled.composition,
			chemistry: rerolled.chemistry,
			hydrosphereCode: rerolled.hydrosphereCode,
			hydrosphere: rerolled.hydrosphere,
			landCoverage: rerolled.landCoverage,
			atmosphere: rerolled.atmosphere,
			greenhouseFactor: rerolled.greenhouseFactor,
			moons,
		}
	})
}
