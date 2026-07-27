import { EARTH_DIAMETER_KM, EARTH_MASS_KG } from "@/model/celestial/orbit-body"
import { PLANET } from "@/model/celestial/planet"
import {
	SOL_EARTH_CLOUDS_TEXTURE_PATH,
	SOL_EARTH_TEXTURE_PATH,
	SOL_MAIN_WORLD_DEFAULTS,
	SOL_SEED,
	SOL_STAR_AGE_GYR,
	SOL_SYSTEM,
	SOL_SYSTEM_BODIES,
} from "@/model/celestial/system/sol-system"
import type { SolPlanetSeed } from "@/model/celestial/system/sol-system/types"
import type { HomeWorldParams } from "@/model/celestial/system/generation/types"
import type {
	SolSeedGenerationParams,
	SolSeedGenerationResult,
} from "@/model/celestial/system/generation/sol-seed/types"
import { TIDAL_SCHEDULE } from "@/model/climate/tidal-schedule"
import { GREENHOUSE_ESTIMATE } from "@/model/climate/ebm/greenhouse-estimate"

function buildMainWorldSeed(mainWorld: HomeWorldParams): SolPlanetSeed {
	const density = PLANET.buildDensityProfile({
		massKg: mainWorld.massKg,
		diameterKm: mainWorld.diameterKm,
		classification: "tectonic",
	})
	const pressureBar = mainWorld.atmosphere?.pressureBar ?? 0
	return {
		name: mainWorld.name,
		isMainWorld: true,
		group: "terrestrial",
		classification: "tectonic",
		au: mainWorld.orbitalDistanceAU,
		diameterEarths: mainWorld.diameterKm / EARTH_DIAMETER_KM,
		massEarths: mainWorld.massKg / EARTH_MASS_KG,
		gravityG: mainWorld.gravityG,
		densityEarthRelative: density?.earthRelative ?? 1,
		densityDescription: density?.description ?? "Rock and Metal",
		rotationHours: mainWorld.siderealDayHours,
		tiltDeg: mainWorld.axialTiltDeg,
		eccentricity: mainWorld.eccentricity,
		longitudeOfPerihelionDeg: mainWorld.longitudeOfPerihelionDeg,
		inclinationDeg: mainWorld.inclinationDeg,
		tideLock: mainWorld.tideLock,
		substellarLon: mainWorld.substellarLon,
		atmosphere: mainWorld.atmosphere ?? undefined,
		landDistribution: mainWorld.landDistribution,
		landCoverage:
			mainWorld.landCoverage ?? SOL_MAIN_WORLD_DEFAULTS.landCoverage,
		continentSizeVariety: mainWorld.continentSizeVariety,
		seaLevel: mainWorld.seaLevel,
		maxElevation: mainWorld.maxElevation,
		albedo: mainWorld.albedo,
		greenhouseFactor:
			mainWorld.greenhouseFactor ??
			GREENHOUSE_ESTIMATE.estimateGreenhouseFactor(pressureBar),
	}
}

function generate(params: SolSeedGenerationParams): SolSeedGenerationResult {
	if (params.seed !== SOL_SEED) return null
	if (!params.solMainWorldOverrides) {
		throw new Error(
			"generateSystemBodies: Sol seed requires solMainWorldOverrides",
		)
	}
	const mainWorldSeed: SolPlanetSeed = {
		...buildMainWorldSeed(params.solMainWorldOverrides),
		cloudsTexturePath: SOL_EARTH_CLOUDS_TEXTURE_PATH,
		inclinationDeg:
			params.solMainWorldOverrides.inclinationDeg ??
			SOL_MAIN_WORLD_DEFAULTS.inclinationDeg,
	}
	return PLANET.applySystemSeismology({
		bodies: SOL_SYSTEM_BODIES.map((body) =>
			body.isMainWorld
				? SOL_SYSTEM.buildPlanet({
						seed: mainWorldSeed,
						seedTag: params.seed,
						idx: -1,
						options: {
							textureOverride: SOL_EARTH_TEXTURE_PATH,
							moonsOverride: params.solMainWorldOverrides?.moons,
						},
					})
				: body,
		),
		starAgeGyr: SOL_STAR_AGE_GYR,
		starLuminositySol: 1,
		spectralClass: params.spectralClass,
		...TIDAL_SCHEDULE.buildSurfaceTidesSeismologyCallbacks({
			spectralClass: params.spectralClass,
			starSubtype: params.starSubtype,
		}),
	})
}

export const SOL_SEED_BODIES = { generate }
