import type { MoonBody } from "@/model/celestial/moons/types"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type {
	AtmosphereProfile,
	BiosphereProfile,
	OrbitClassification,
	OrbitGroup,
	TemperatureEstimate,
	TideLock,
} from "@/model/celestial/orbit-body/types"
import { BIOSPHERE } from "@/model/celestial/planet/biosphere"
import { CLOUD_COVER } from "@/model/celestial/planet/cloud-cover"
import { ENVIRONMENT } from "@/model/celestial/planet/environment"
import { HYDROSPHERE } from "@/model/celestial/planet/environment/classification/hydrosphere"
import { TEMPERATURE } from "@/model/celestial/planet/environment/temperature"
import { HABITABILITY } from "@/model/celestial/planet/habitability"
import { LIGHT } from "@/model/celestial/planet/light"
import { MAGNETIC_FIELD } from "@/model/celestial/planet/magnetic-field"
import { HEATING } from "@/model/celestial/planet/seismology/heating"
import { RECLASSIFY } from "@/model/celestial/planet/seismology/reclassify"
import type {
	SeedForMoonInput,
	SeismologyProfile,
} from "@/model/celestial/planet/seismology/types"
import type { Zone } from "@/model/celestial/planet/types"
import { WEATHER } from "@/model/celestial/planet/weather"
import type { SpectralClass } from "@/model/celestial/star/types"
import { TEXTURE } from "@/model/celestial/system/generation/texture"
import type { SystemBody } from "@/model/celestial/system/types"
import { RNG } from "@/model/shared/random/rng"

// Generated-texture selection needs the real, seismology-inclusive climate
// estimate (and any post-seismology hydrosphere/classification change), so it
// runs here rather than at initial body/moon construction time -- see
// body/index.ts and moon-placement/index.ts's doc comments at their (removed)
// former call sites. Never overrides an already-set texturePath/
// cloudsTexturePath -- the real Sol seed bodies (sol-system/index.ts) flow
// through this same applySystemSeismology pass but come in with their own
// authored textures, which must survive untouched.
function withGeneratedTextures(params: {
	classification: OrbitClassification
	hydrosphereCode: number
	temperatureMeanK: number
	seed: number
	zone?: Zone
	existingTexturePath?: string
	existingCloudsTexturePath?: string
}): { texturePath?: string; cloudsTexturePath?: string } {
	// Only an authored Sol path (always under .../sol/...) is protected here --
	// a previously *generated* path (.../generated/...) must always be
	// re-derived from the current classification/hydrosphere/climate, not just
	// preserved, or a body edited after its first pick (e.g. via the stat-
	// editor UI's updateEditableSystemBody, which reruns seismology over a
	// body that already carries the texture from its last pick) would keep a
	// stale texture forever even after the edit pushes it into a different
	// climate band -- the RNG seed here is deterministic per body, so
	// re-deriving is stable (same inputs -> same pick) rather than flickering.
	// texturePath/cloudsTexturePath are checked independently, not as a pair
	// -- an Earth-clone main world blanks texturePath (isMainWorld bodies
	// render via live simulated terrain, so a generated surface pick is fine)
	// but keeps EARTH_SEED's real cloudsTexturePath (rendered unconditionally,
	// unlike texturePath), so the two can legitimately disagree on whether
	// they're authored.
	const isAuthoredSolPath = (path: string | undefined): boolean =>
		path?.startsWith("/textures/celestial/sol/") ?? false
	if (isAuthoredSolPath(params.existingTexturePath)) {
		return {
			texturePath: params.existingTexturePath,
			cloudsTexturePath: params.existingCloudsTexturePath,
		}
	}
	const generated = TEXTURE.pickGeneratedBodyTextures({
		rng: RNG.createRng({ seed: params.seed }),
		classification: params.classification,
		hydrosphereCode: params.hydrosphereCode,
		climateBand: TEMPERATURE.describe(params.temperatureMeanK),
		zone: params.zone,
	})
	return {
		texturePath: generated.texturePath,
		cloudsTexturePath: isAuthoredSolPath(params.existingCloudsTexturePath)
			? params.existingCloudsTexturePath
			: generated.cloudsTexturePath,
	}
}

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

// Ported from galaxy-gen's TEMPERATURE.finalize -- computes the closed-form
// mean/high/low estimate right after totalHeating is known, and applies its
// mean > 1000K boil-off side effect to hydrosphereCode/hydrosphere (see
// TemperatureEstimate's doc in orbit-body/types.ts). Shared by the body and
// moon seismology passes, and by applySystemSeismology's body reclassify
// branch (which may change hydrosphereCode/atmosphere after this first runs).
function withTemperatureEstimate(params: {
	starLuminositySol: number
	orbitalDistanceAU: number
	eccentricity: number
	albedo?: number
	greenhouseFactor?: number
	hydrosphereCode?: number
	pressureBar?: number
	axialTiltDeg: number
	orbitalPeriodDays: number
	siderealDayHours: number
	tideLock?: TideLock | null
	seismologyTotal: number
	group: OrbitGroup
	seed: number
}): {
	temperatureEstimate: TemperatureEstimate
	hydrosphereCode: number
	hydrosphere?: ReturnType<typeof HYDROSPHERE.buildProfile>
} {
	const hydrosphereCode = params.hydrosphereCode ?? 0
	const temperatureEstimate = TEMPERATURE.finalize({
		luminositySol: params.starLuminositySol,
		orbitalDistanceAU: params.orbitalDistanceAU,
		eccentricity: params.eccentricity,
		albedo: params.albedo ?? 0,
		greenhouseFactor: params.greenhouseFactor ?? 0,
		hydrosphereCode,
		pressureBar: params.pressureBar ?? 0,
		axialTiltDeg: params.axialTiltDeg,
		orbitalPeriodDays: params.orbitalPeriodDays,
		siderealDayHours: params.siderealDayHours,
		tideLock: params.tideLock,
		seismologyTotal: params.seismologyTotal,
		group: params.group,
	})
	if (temperatureEstimate.boiledOffHydrosphereCode === undefined) {
		return { temperatureEstimate, hydrosphereCode }
	}
	const boiledCode = temperatureEstimate.boiledOffHydrosphereCode
	return {
		temperatureEstimate,
		hydrosphereCode: boiledCode,
		hydrosphere: HYDROSPHERE.buildProfile({
			rng: RNG.createRng({ seed: params.seed }),
			code: boiledCode,
		}),
	}
}

// Ported from galaxy-gen's BIOSPHERE.get -- run right after
// withTemperatureEstimate since it needs temperatureEstimate.mean. Shared by
// the body and moon seismology passes, and by applySystemSeismology's body
// reclassify branch.
function withBiosphere(params: {
	starAgeGyr: number
	atmosphere?: AtmosphereProfile | null
	temperatureMeanK: number
	temperatureHighK: number
	temperatureLowK: number
	hydrosphereCode?: number
	classification: OrbitClassification
	impactZone?: boolean
	isMainWorld?: boolean
	seed: number
	/** Earth and every Earth-clone main world come in with a hand-authored
	 * biosphere (see SOL_DATA's Earth seed / EARTH_SEED.biosphere) that must
	 * survive the seismology pass unchanged instead of being re-rolled. */
	preset?: BiosphereProfile
	asteroidImpacts?: boolean
}): { biosphere: BiosphereProfile; atmosphere?: AtmosphereProfile } {
	if (params.preset) return { biosphere: params.preset }
	return BIOSPHERE.get({
		rng: RNG.createRng({ seed: params.seed }),
		starAgeGyr: params.starAgeGyr,
		atmosphere: params.atmosphere,
		temperatureMeanK: params.temperatureMeanK,
		temperatureHighK: params.temperatureHighK,
		temperatureLowK: params.temperatureLowK,
		hydrosphereCode: params.hydrosphereCode,
		classification: params.classification,
		impactZone: params.impactZone,
		isMainWorld: params.isMainWorld,
		asteroidImpacts: params.asteroidImpacts,
	})
}

function withHabitability(params: {
	sizeClass: number
	atmosphere?: AtmosphereProfile | null
	hydrosphereCode: number
	temperatureMeanK: number
	temperatureHighK: number
	temperatureLowK: number
	gravityG: number
	tideLockedToStar?: boolean
	seismologyTotal: number
	surfaceTidesHeating: number
	asteroidImpacts?: boolean
}): BiosphereProfile {
	return HABITABILITY.get(params)
}

function applyBodySeismology(params: {
	body: SystemBody
	starAgeGyr: number
	starLuminositySol: number
	surfaceTidesHeating: number
}): SystemBody {
	const { body, starAgeGyr, starLuminositySol, surfaceTidesHeating } = params
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
	const { temperatureEstimate, hydrosphereCode, hydrosphere } =
		withTemperatureEstimate({
			starLuminositySol,
			orbitalDistanceAU: body.orbitalDistanceAU,
			eccentricity: body.eccentricity,
			albedo: body.albedo,
			greenhouseFactor: body.greenhouseFactor,
			hydrosphereCode: body.hydrosphereCode,
			pressureBar: body.atmosphere?.pressureBar,
			axialTiltDeg: body.axialTiltDeg,
			orbitalPeriodDays: body.orbitalPeriodDays,
			siderealDayHours: body.siderealDayHours,
			tideLock: body.tideLock,
			seismologyTotal: totalHeating,
			group: body.group,
			seed: seedForBody(body),
		})
	const { biosphere, atmosphere: convertedAtmosphere } = withBiosphere({
		starAgeGyr,
		atmosphere: body.atmosphere,
		temperatureMeanK: temperatureEstimate.mean,
		temperatureHighK: temperatureEstimate.high,
		temperatureLowK: temperatureEstimate.low,
		hydrosphereCode,
		classification: body.classification,
		impactZone: body.impactZone,
		isMainWorld: body.isMainWorld,
		seed: seedForBody(body),
		preset: body.biosphere,
		asteroidImpacts: body.asteroidImpacts,
	})
	const habitability = withHabitability({
		sizeClass: body.sizeClass,
		atmosphere: convertedAtmosphere ?? body.atmosphere,
		hydrosphereCode,
		temperatureMeanK: temperatureEstimate.mean,
		temperatureHighK: temperatureEstimate.high,
		temperatureLowK: temperatureEstimate.low,
		gravityG: body.gravityG,
		tideLockedToStar: body.tideLock?.type === "solar",
		seismologyTotal: totalHeating,
		surfaceTidesHeating,
		asteroidImpacts: body.asteroidImpacts,
	})
	const magneticField = MAGNETIC_FIELD.compute({
		densityDescription: body.density?.description,
		densityEarthRelative,
		massKg: body.massKg,
		siderealDayHours: body.siderealDayHours,
		starAgeGyr,
	})
	const cloudCover = CLOUD_COVER.compute({
		waterFraction: 1 - body.landCoverage,
		temperatureMeanK: temperatureEstimate.mean,
		atmosphereType: (convertedAtmosphere ?? body.atmosphere)?.type,
		pressureBar: (convertedAtmosphere ?? body.atmosphere)?.pressureBar,
	})
	const light = LIGHT.computeLightProfile({
		luminositySol: starLuminositySol,
		orbitalDistanceAU: body.orbitalDistanceAU,
		cloudCoverFraction: cloudCover.coverFraction,
	})
	const weather = WEATHER.computeProfile({
		pressureBar: (convertedAtmosphere ?? body.atmosphere)?.pressureBar ?? 0,
		siderealDayHours: body.siderealDayHours,
		axialTiltDeg: body.axialTiltDeg,
		orbitalPeriodDays: body.orbitalPeriodDays,
		eccentricity: body.eccentricity,
		diameterKm: body.diameterKm,
		group: body.group,
		orbitalDistanceAU: body.orbitalDistanceAU,
		luminositySol: starLuminositySol,
		totalHeating,
	})
	const generatedTextures = withGeneratedTextures({
		classification: body.classification,
		hydrosphereCode,
		temperatureMeanK: temperatureEstimate.mean,
		seed: seedForBody(body),
		zone: body.zone,
		existingTexturePath: body.texturePath,
		existingCloudsTexturePath: body.cloudsTexturePath,
	})
	return {
		...body,
		hydrosphereCode,
		hydrosphere: hydrosphere ?? body.hydrosphere,
		atmosphere: convertedAtmosphere ?? body.atmosphere,
		seismology,
		temperatureEstimate,
		biosphere,
		habitability,
		magneticField,
		cloudCover,
		light,
		weather,
		texturePath: generatedTextures.texturePath,
		cloudsTexturePath: generatedTextures.cloudsTexturePath,
	}
}

function applyMoonSeismology(params: {
	parent: SystemBody
	moon: MoonBody
	starAgeGyr: number
	starLuminositySol: number
	spectralClass: SpectralClass
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
	const deviation = TEMPERATURE.estimateDeviationFromOrbitalDistance({
		orbitalDistanceAU: parent.orbitalDistanceAU,
		luminositySol: starLuminositySol,
	})
	const zone = TEMPERATURE.zoneFromDeviation(deviation)
	const currentClassification =
		(moon.classification as OrbitClassification | undefined) ?? "rockball"
	const nextClassification = RECLASSIFY.nextSeismologyClass({
		current: currentClassification,
		group,
		zone,
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
				isPrimaryWorld: moon.isMainWorld === true,
				greenhouseMode: moon.isMainWorld ? "estimate" : "roll",
				starAgeGyr,
			})
		: null

	const resolvedHydrosphereCode =
		rerolled?.hydrosphereCode ?? moon.hydrosphereCode
	const resolvedGreenhouseFactor =
		rerolled?.greenhouseFactor ?? moon.greenhouseFactor
	const resolvedAtmosphere = rerolled?.atmosphere ?? moon.atmosphere
	// Ported from galaxy-gen's finalize using `parent?.eccentricity ??
	// orbit.eccentricity` -- a moon's temperature swing is driven by its
	// planet's eccentricity around the star, not the moon's own (much
	// smaller) eccentricity around the planet.
	const { temperatureEstimate, hydrosphereCode, hydrosphere } =
		withTemperatureEstimate({
			starLuminositySol,
			orbitalDistanceAU: parent.orbitalDistanceAU,
			eccentricity: parent.eccentricity,
			albedo: moon.albedo,
			greenhouseFactor: resolvedGreenhouseFactor,
			hydrosphereCode: resolvedHydrosphereCode,
			pressureBar: resolvedAtmosphere?.pressureBar,
			axialTiltDeg: moon.axialTiltDeg,
			orbitalPeriodDays: moon.orbitalPeriodDays,
			siderealDayHours: moon.siderealDayHours,
			tideLock: moon.tideLock,
			seismologyTotal: totalHeating,
			group: nextGroup,
			seed: seedForMoon({ parent, moon }),
		})

	const { biosphere, atmosphere: convertedAtmosphere } = withBiosphere({
		starAgeGyr,
		atmosphere: resolvedAtmosphere,
		temperatureMeanK: temperatureEstimate.mean,
		temperatureHighK: temperatureEstimate.high,
		temperatureLowK: temperatureEstimate.low,
		hydrosphereCode,
		classification: nextClassification,
		impactZone: moon.impactZone,
		isMainWorld: moon.isMainWorld,
		seed: seedForMoon({ parent, moon }),
		preset: moon.biosphere,
		asteroidImpacts: moon.asteroidImpacts,
	})
	const habitability = withHabitability({
		sizeClass,
		atmosphere: convertedAtmosphere ?? resolvedAtmosphere,
		hydrosphereCode,
		temperatureMeanK: temperatureEstimate.mean,
		temperatureHighK: temperatureEstimate.high,
		temperatureLowK: temperatureEstimate.low,
		gravityG: ORBIT_BODY.computeGravityG({
			massKg: moon.massKg,
			diameterKm: moon.diameterKm,
		}),
		tideLockedToStar: moon.tideLock?.type === "solar",
		seismologyTotal: totalHeating,
		surfaceTidesHeating,
		asteroidImpacts: moon.asteroidImpacts,
	})

	const resolvedDensity = rerolled?.density ?? moon.density
	const magneticField = MAGNETIC_FIELD.compute({
		densityDescription: resolvedDensity?.description,
		densityEarthRelative: resolvedDensity?.earthRelative,
		massKg: moon.massKg,
		siderealDayHours: moon.siderealDayHours,
		starAgeGyr,
	})
	const resolvedLandCoverage = rerolled?.landCoverage ?? moon.landCoverage
	const cloudCover = CLOUD_COVER.compute({
		waterFraction: 1 - resolvedLandCoverage,
		temperatureMeanK: temperatureEstimate.mean,
		atmosphereType: (convertedAtmosphere ?? resolvedAtmosphere)?.type,
		pressureBar: (convertedAtmosphere ?? resolvedAtmosphere)?.pressureBar,
	})
	// A moon shares its parent planet's star-orbit rather than having its own
	// -- same convention withTemperatureEstimate already uses above
	// (parent.orbitalDistanceAU/eccentricity, not the moon's own).
	const light = LIGHT.computeLightProfile({
		luminositySol: starLuminositySol,
		orbitalDistanceAU: parent.orbitalDistanceAU,
		cloudCoverFraction: cloudCover.coverFraction,
	})
	// Tilt/rotation/atmosphere are the moon's own, but the season-driving
	// year is its parent's orbit around the star, not the moon's own short
	// orbit around the parent -- same convention as light above.
	const weather = WEATHER.computeProfile({
		pressureBar: (convertedAtmosphere ?? resolvedAtmosphere)?.pressureBar ?? 0,
		siderealDayHours: moon.siderealDayHours,
		axialTiltDeg: moon.axialTiltDeg,
		orbitalPeriodDays: parent.orbitalPeriodDays,
		eccentricity: parent.eccentricity,
		diameterKm: moon.diameterKm,
		group: nextGroup,
		orbitalDistanceAU: parent.orbitalDistanceAU,
		luminositySol: starLuminositySol,
		totalHeating,
	})
	// withGeneratedTextures itself only ever preserves an authored Sol path
	// (see its own doc) -- a previously generated one is always re-derived
	// fresh here regardless of shouldReclassify, so there's no need to gate
	// this on it the way an earlier version of this code did.
	const generatedTextures = withGeneratedTextures({
		classification: nextClassification,
		hydrosphereCode,
		temperatureMeanK: temperatureEstimate.mean,
		seed: seedForMoon({ parent, moon }),
		existingTexturePath: moon.texturePath,
		existingCloudsTexturePath: moon.cloudsTexturePath,
	})
	return {
		...moon,
		group: nextGroup,
		classification: nextClassification,
		density: resolvedDensity,
		subtype: rerolled?.subtype ?? moon.subtype,
		composition: rerolled?.composition ?? moon.composition,
		chemistry: rerolled?.chemistry ?? moon.chemistry,
		hydrosphereCode,
		hydrosphere: hydrosphere ?? rerolled?.hydrosphere ?? moon.hydrosphere,
		landCoverage: resolvedLandCoverage,
		atmosphere: convertedAtmosphere ?? resolvedAtmosphere,
		greenhouseFactor: resolvedGreenhouseFactor,
		seismology: {
			residualHeating,
			tidalHeating,
			surfaceTidesHeating,
			totalHeating,
			regime: RECLASSIFY.describeRegime(totalHeating),
		},
		temperatureEstimate,
		biosphere,
		habitability,
		magneticField,
		cloudCover,
		light,
		weather,
		texturePath: generatedTextures.texturePath,
		cloudsTexturePath: generatedTextures.cloudsTexturePath,
	}
}

function applySystemSeismology(params: {
	bodies: SystemBody[]
	starAgeGyr: number
	starLuminositySol: number
	spectralClass: SpectralClass
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
			starLuminositySol: params.starLuminositySol,
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
			zone: TEMPERATURE.zoneFromDeviation(
				TEMPERATURE.estimateDeviationFromOrbitalDistance({
					orbitalDistanceAU: seismologyBody.orbitalDistanceAU,
					luminositySol: params.starLuminositySol,
				}),
			),
			tidalHeating: 0,
			totalHeating: seismologyBody.seismology?.totalHeating ?? 0,
			seed: seedForBody(seismologyBody),
		})
		if (nextClassification === currentClassification) {
			return { ...seismologyBody, moons }
		}
		const deviation = TEMPERATURE.estimateDeviationFromOrbitalDistance({
			orbitalDistanceAU: seismologyBody.orbitalDistanceAU,
			luminositySol: params.starLuminositySol,
		})
		const rerolled = ENVIRONMENT.buildClassificationEnvironment({
			rng: RNG.createRng({ seed: seedForBody(seismologyBody) }),
			group: seismologyBody.group,
			classification: nextClassification,
			sizeClass: seismologyBody.sizeClass,
			zone: TEMPERATURE.zoneFromDeviation(deviation),
			deviation,
			spectralClass: params.spectralClass,
			diameterKm: seismologyBody.diameterKm,
			massKg: seismologyBody.massKg,
			isPrimaryWorld: seismologyBody.isMainWorld,
			greenhouseMode: seismologyBody.isMainWorld ? "estimate" : "roll",
			starAgeGyr: params.starAgeGyr,
		})
		// Re-run the temperature estimate: this reclassify can change
		// hydrosphereCode/atmosphere/greenhouseFactor after applyBodySeismology
		// already computed one against the pre-reclassify values.
		const { temperatureEstimate, hydrosphereCode, hydrosphere } =
			withTemperatureEstimate({
				starLuminositySol: params.starLuminositySol,
				orbitalDistanceAU: seismologyBody.orbitalDistanceAU,
				eccentricity: seismologyBody.eccentricity,
				albedo: seismologyBody.albedo,
				greenhouseFactor: rerolled.greenhouseFactor,
				hydrosphereCode: rerolled.hydrosphereCode,
				pressureBar: rerolled.atmosphere?.pressureBar,
				axialTiltDeg: seismologyBody.axialTiltDeg,
				orbitalPeriodDays: seismologyBody.orbitalPeriodDays,
				siderealDayHours: seismologyBody.siderealDayHours,
				tideLock: seismologyBody.tideLock,
				seismologyTotal: seismologyBody.seismology?.totalHeating ?? 0,
				group: seismologyBody.group,
				seed: seedForBody(seismologyBody),
			})
		const { biosphere, atmosphere: convertedAtmosphere } = withBiosphere({
			starAgeGyr: params.starAgeGyr,
			atmosphere: rerolled.atmosphere,
			temperatureMeanK: temperatureEstimate.mean,
			temperatureHighK: temperatureEstimate.high,
			temperatureLowK: temperatureEstimate.low,
			hydrosphereCode,
			classification: nextClassification,
			impactZone: seismologyBody.impactZone,
			isMainWorld: seismologyBody.isMainWorld,
			seed: seedForBody(seismologyBody),
			preset: seismologyBody.biosphere,
		})
		const habitability = withHabitability({
			sizeClass: seismologyBody.sizeClass,
			atmosphere: convertedAtmosphere ?? rerolled.atmosphere,
			hydrosphereCode,
			temperatureMeanK: temperatureEstimate.mean,
			temperatureHighK: temperatureEstimate.high,
			temperatureLowK: temperatureEstimate.low,
			gravityG: seismologyBody.gravityG,
			tideLockedToStar: seismologyBody.tideLock?.type === "solar",
			seismologyTotal: seismologyBody.seismology?.totalHeating ?? 0,
			surfaceTidesHeating: seismologyBody.seismology?.surfaceTidesHeating ?? 0,
		})
		const magneticField = MAGNETIC_FIELD.compute({
			densityDescription: rerolled.density?.description,
			densityEarthRelative: rerolled.density?.earthRelative,
			massKg: seismologyBody.massKg,
			siderealDayHours: seismologyBody.siderealDayHours,
			starAgeGyr: params.starAgeGyr,
		})
		const cloudCover = CLOUD_COVER.compute({
			waterFraction: 1 - rerolled.landCoverage,
			temperatureMeanK: temperatureEstimate.mean,
			atmosphereType: (convertedAtmosphere ?? rerolled.atmosphere)?.type,
			pressureBar: (convertedAtmosphere ?? rerolled.atmosphere)?.pressureBar,
		})
		// No existingTexturePath/existingCloudsTexturePath here: this branch
		// only runs when the classification just changed (see the
		// nextClassification === currentClassification early return above), so
		// seismologyBody's texture -- picked for the old classification -- is
		// always stale and must be re-picked, not preserved (e.g. a body
		// reclassified into snowball must lose any old savanna/oceanic clouds).
		const generatedTextures = withGeneratedTextures({
			classification: nextClassification,
			hydrosphereCode,
			temperatureMeanK: temperatureEstimate.mean,
			seed: seedForBody(seismologyBody),
			zone: seismologyBody.zone,
		})
		return {
			...seismologyBody,
			classification: nextClassification,
			density: rerolled.density,
			subtype: rerolled.subtype,
			composition: rerolled.composition,
			chemistry: rerolled.chemistry,
			hydrosphereCode,
			hydrosphere: hydrosphere ?? rerolled.hydrosphere,
			landCoverage: rerolled.landCoverage,
			atmosphere: convertedAtmosphere ?? rerolled.atmosphere,
			greenhouseFactor: rerolled.greenhouseFactor,
			moons,
			temperatureEstimate,
			biosphere,
			habitability,
			magneticField,
			cloudCover,
			texturePath: generatedTextures.texturePath,
			cloudsTexturePath: generatedTextures.cloudsTexturePath,
		}
	})
}

export const SEISMOLOGY = {
	applySystemSeismology,
	computeMoonTidalHeatingRaw: HEATING.computeMoonTidalHeatingRaw,
	MAX_SAFE_MOON_TIDAL_HEATING: HEATING.MAX_SAFE_MOON_TIDAL_HEATING,
}
