import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import { PLANET } from "@/model/celestial/planet"
import type {
	SolSeedGenerationParams,
	SolSeedGenerationResult,
} from "@/model/celestial/system/generation/sol-seed/types"
import type { HomeWorldParams } from "@/model/celestial/system/generation/types"
import { SOL_SYSTEM } from "@/model/celestial/system/sol-system"
import { SOL_DATA } from "@/model/celestial/system/sol-system/data"
import type { SolPlanetSeed } from "@/model/celestial/system/sol-system/types"
import { GREENHOUSE_ESTIMATE } from "@/model/climate/ebm/greenhouse-estimate"
import { TIDAL_SCHEDULE } from "@/model/climate/tidal-schedule"

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
		diameterEarths: mainWorld.diameterKm / ORBIT_BODY.earthDiameterKm,
		massEarths: mainWorld.massKg / ORBIT_BODY.earthMassKg,
		gravityG: mainWorld.gravityG,
		densityEarthRelative: density?.earthRelative ?? 1,
		densityDescription: density?.description ?? "Rock and Metal",
		rotationHours: mainWorld.siderealDayHours,
		tiltDeg: mainWorld.axialTiltDeg,
		eccentricity: mainWorld.eccentricity,
		longitudeOfPerihelionDeg: mainWorld.longitudeOfPerihelionDeg,
		lsAphelionDeg: mainWorld.lsAphelionDeg,
		inclinationDeg: mainWorld.inclinationDeg,
		tideLock: mainWorld.tideLock,
		substellarLon: mainWorld.substellarLon,
		atmosphere: mainWorld.atmosphere ?? undefined,
		landDistribution: mainWorld.landDistribution,
		landCoverage:
			mainWorld.landCoverage ?? SOL_SYSTEM.solMainWorldDefaults.landCoverage,
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
	if (params.seed !== SOL_DATA.solSeed) return null
	if (!params.solMainWorldOverrides) {
		throw new Error(
			"generateSystemBodies: Sol seed requires solMainWorldOverrides",
		)
	}
	const mainWorldSeed: SolPlanetSeed = {
		...buildMainWorldSeed(params.solMainWorldOverrides),
		cloudsTexturePath: SOL_DATA.solEarthCloudsTexturePath,
		inclinationDeg:
			params.solMainWorldOverrides.inclinationDeg ??
			SOL_SYSTEM.solMainWorldDefaults.inclinationDeg,
	}
	return PLANET.applySystemSeismology({
		bodies: SOL_SYSTEM.solSystemBodies.map((body) =>
			body.isMainWorld
				? SOL_SYSTEM.buildPlanet({
						seed: mainWorldSeed,
						seedTag: params.seed,
						idx: -1,
						options: {
							textureOverride: SOL_DATA.solEarthTexturePath,
							moonsOverride: params.solMainWorldOverrides?.moons,
						},
					})
				: body,
		),
		starAgeGyr: SOL_DATA.solStarAgeGyr,
		starLuminositySol: 1,
		spectralClass: params.spectralClass,
		...TIDAL_SCHEDULE.buildSurfaceTidesSeismologyCallbacks({
			spectralClass: params.spectralClass,
			starSubtype: params.starSubtype,
		}),
	})
}

export const SOL_SEED_BODIES = { generate }
