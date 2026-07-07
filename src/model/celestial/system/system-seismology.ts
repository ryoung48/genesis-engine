import type { MoonParams } from "@/model/celestial/moons/moon-types"
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

export interface SeismologyProfile {
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

function computeMoonTidalHeating(parent: SystemBody, moon: MoonParams): number {
	const distanceMillionKm =
		((moon.semiMajorAxisPlanetDiameters ?? 0) * parent.diameterKm) / 1e6
	const orbitalPeriodDays = moon.orbitalPeriodDays
	const densityEarthRelative = moon.densityEarthRelative ?? 0
	if (
		distanceMillionKm <= 0 ||
		orbitalPeriodDays <= 0 ||
		moon.massKg <= 0 ||
		densityEarthRelative <= 0
	) {
		return 0
	}

	return (
		(10.83 *
			(parent.massKg / EARTH_MASS_KG) ** 2 *
			(moon.diameterKm / EARTH_DIAMETER_KM) ** 2 *
			moon.eccentricity ** 2) /
		(distanceMillionKm ** 5 * orbitalPeriodDays * densityEarthRelative)
	)
}

function seedForBody(body: SystemBody): number {
	return (body.idx + 2) * 10_007 + Math.round(body.orbitalDistanceAU * 1_000)
}

function seedForMoon(parent: SystemBody, moon: MoonParams): number {
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
	moon: MoonParams
	starAgeGyr: number
	starLuminositySol: number
	surfaceTidesHeating: number
}): MoonParams {
	const { parent, moon, starAgeGyr, starLuminositySol, surfaceTidesHeating } =
		params
	const sizeClass = moon.sizeClass ?? 0
	const densityEarthRelative = moon.densityEarthRelative ?? 0
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
				deviation,
				diameterKm: moon.diameterKm,
				massKg: moon.massKg,
				isPrimaryWorld: false,
			})
		: null

	return {
		...moon,
		group: nextGroup,
		classification: nextClassification,
		densityEarthRelative:
			rerolled?.density?.earthRelative ?? moon.densityEarthRelative,
		densityDescription:
			rerolled?.density?.description ?? moon.densityDescription,
		hydrosphereFraction:
			rerolled?.hydrosphereFraction ?? moon.hydrosphereFraction,
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
	getSurfaceTidesHeatingForMoon?: (parent: SystemBody, moon: MoonParams) => number
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
			deviation,
			diameterKm: seismologyBody.diameterKm,
			massKg: seismologyBody.massKg,
			isPrimaryWorld: seismologyBody.isMainWorld,
			greenhouseMode: seismologyBody.isMainWorld ? "estimate" : "roll",
		})
		return {
			...seismologyBody,
			classification: nextClassification,
			density: rerolled.density,
			hydrosphereFraction: rerolled.hydrosphereFraction,
			atmosphere: rerolled.atmosphere,
			greenhouseFactor: rerolled.greenhouseFactor,
			moons,
		}
	})
}
