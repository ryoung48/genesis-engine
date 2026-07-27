import type { MoonBody } from "@/model/celestial/moons/types"
import type { OrbitClassification } from "@/model/celestial/orbit-body/types"
import { ENVIRONMENT } from "@/model/celestial/planet/environment"
import { HEATING } from "@/model/celestial/planet/seismology/heating"
import { RECLASSIFY } from "@/model/celestial/planet/seismology/reclassify"
import type {
	SeedForMoonInput,
	SeismologyProfile,
} from "@/model/celestial/planet/seismology/types"
import type { MainSequenceClass } from "@/model/celestial/star/types"
import type { SystemBody } from "@/model/celestial/system/types"
import { RNG } from "@/model/shared/random/rng"

function seedForBody(body: SystemBody): number {
	return (body.idx + 2) * 10_007 + Math.round(body.orbitalDistanceAU * 1_000)
}

function seedForMoon({ parent, moon }: SeedForMoonInput): number {
	return (
		(parent.idx + 2) * 100_003 +
		moon.idx * 10_007 +
		Math.round((moon.semiMajorAxisPlanetDiameters ?? 0) * 1_000)
	)
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
	const residualHeating = HEATING.computeResidualHeating({
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
		regime: RECLASSIFY.describeRegime(totalHeating),
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
	const group = moon.group ?? ENVIRONMENT.classifyGroup({ sizeClass })
	const densityEarthRelative = moon.density?.earthRelative ?? 0
	const residualHeating = HEATING.computeResidualHeating({
		sizeClass,
		starAgeGyr,
		densityEarthRelative,
		moonSizeClassTotal: 0,
		isMoon: true,
		group,
	})
	const tidalHeating = HEATING.computeMoonTidalHeating({ parent, moon })
	const totalHeating = residualHeating + tidalHeating + surfaceTidesHeating
	const deviation = ENVIRONMENT.estimateDeviationFromOrbitalDistance({
		orbitalDistanceAU: parent.orbitalDistanceAU,
		luminositySol: starLuminositySol,
	})
	const zone = ENVIRONMENT.zoneFromDeviation(deviation)
	const currentClassification =
		(moon.classification as OrbitClassification | undefined) ?? "rockball"
	const nextClassification = RECLASSIFY.nextSeismologyClass({
		current: currentClassification,
		group,
		zone,
		sizeClass,
		tidalHeating,
		totalHeating,
		seed: seedForMoon({ parent, moon }),
	})
	const shouldReclassify = nextClassification !== currentClassification
	const nextGroup = group
	const rerolled = shouldReclassify
		? ENVIRONMENT.buildClassificationEnvironment({
				rng: RNG.createRng({ seed: seedForMoon({ parent, moon }) }),
				group: nextGroup,
				classification: nextClassification,
				sizeClass,
				zone,
				deviation,
				spectralClass,
				diameterKm: moon.diameterKm,
				massKg: moon.massKg,
				isPrimaryWorld: false,
				greenhouseMode: "roll",
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
			regime: RECLASSIFY.describeRegime(totalHeating),
		},
	}
}

function applySystemSeismology(params: {
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
	getSurfaceTidesHeatingForMoon?: (params: {
		parent: SystemBody
		moon: MoonBody
	}) => number
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
					params.getSurfaceTidesHeatingForMoon?.({
						parent: seismologyBody,
						moon,
					}) ?? 0,
			}),
		)
		const currentClassification = seismologyBody.classification
		const nextClassification = RECLASSIFY.nextSeismologyClass({
			current: currentClassification,
			group: seismologyBody.group,
			zone: ENVIRONMENT.zoneFromDeviation(
				ENVIRONMENT.estimateDeviationFromOrbitalDistance({
					orbitalDistanceAU: seismologyBody.orbitalDistanceAU,
					luminositySol: params.starLuminositySol,
				}),
			),
			sizeClass: seismologyBody.sizeClass,
			tidalHeating: 0,
			totalHeating: seismologyBody.seismology?.totalHeating ?? 0,
			seed: seedForBody(seismologyBody),
		})
		if (nextClassification === currentClassification) {
			return { ...seismologyBody, moons }
		}
		const deviation = ENVIRONMENT.estimateDeviationFromOrbitalDistance({
			orbitalDistanceAU: seismologyBody.orbitalDistanceAU,
			luminositySol: params.starLuminositySol,
		})
		const rerolled = ENVIRONMENT.buildClassificationEnvironment({
			rng: RNG.createRng({ seed: seedForBody(seismologyBody) }),
			group: seismologyBody.group,
			classification: nextClassification,
			sizeClass: seismologyBody.sizeClass,
			zone: ENVIRONMENT.zoneFromDeviation(deviation),
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

export const SEISMOLOGY = {
	applySystemSeismology,
	computeMoonTidalHeatingRaw: HEATING.computeMoonTidalHeatingRaw,
	MAX_SAFE_MOON_TIDAL_HEATING: HEATING.MAX_SAFE_MOON_TIDAL_HEATING,
}
