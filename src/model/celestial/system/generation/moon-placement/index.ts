import { MOON } from "@/model/celestial/moons"
import type { MoonBody } from "@/model/celestial/moons/types"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import { PLANET } from "@/model/celestial/planet"
import { ENVIRONMENT } from "@/model/celestial/system/generation/environment"
import type {
	MoonPlacementInput,
	MoonPlacementResult,
} from "@/model/celestial/system/generation/moon-placement/types"

function place(params: MoonPlacementInput): MoonPlacementResult {
	if (params.moonCount <= 0) return []
	const moons = MOON.generateMoons({
		count: params.moonCount,
		seed: params.rng.randint(1, 1_000_000_000),
		planetRadiusKm: params.diameterKm / 2,
		parentSizeClass: params.parentSizeClass,
		orbitalDistanceAU: params.orbitalDistanceAU,
		starMassKg: params.starMassKg,
		parentGroup: params.group,
	})
	return moons
		.map((moon, moonIdx) => {
			const moonEnvironment = ENVIRONMENT.buildMoonEnvironment({
				rng: params.rng,
				diameterKm: moon.diameterKm,
				massKg: moon.massKg,
				orbitalDistanceAU: params.orbitalDistanceAU,
				zone: params.zone,
				deviation: params.deviation,
				spectralClass: params.spectralClass,
				sizeClass: moon.sizeClass,
				isPrimaryWorld: params.isPrimaryWorld,
				orbitRange: moon.orbitRange,
				semiMajorAxisPlanetDiameters: moon.semiMajorAxisPlanetDiameters,
				parentGroup: params.group,
				impactZone: params.impactZone,
				starAgeGyr: params.starAgeGyr,
			})
			const moonTideLock = PLANET.rollMoonTideLock({
				rng: params.rng,
				sizeClass: moonEnvironment.sizeClass,
				eccentricity: moon.eccentricity,
				axialTiltDeg: moon.axialTiltDeg,
				atmospherePressureBar: moonEnvironment.atmosphere?.pressureBar ?? 0,
				starAgeGyr: params.starAgeGyr,
				semiMajorAxisPlanetDiameters: moon.semiMajorAxisPlanetDiameters ?? 0,
				orbitalPeriodDays: moon.orbitalPeriodDays,
				planetMassEarths: params.massKg / ORBIT_BODY.earthMassKg,
				baseSiderealDayHours: moon.siderealDayHours,
				rerollEccentricity: () =>
					MOON.rollMoonEccentricity({
						rng: params.rng,
						range: moon.orbitRange ?? "middle",
						sizeClass: moonEnvironment.sizeClass,
					}),
			})
			// texturePath/cloudsTexturePath are assigned later by
			// PLANET.applySystemSeismology, once the moon's real
			// seismology-inclusive temperature (and any post-seismology
			// hydrosphere/classification change) is known -- see
			// seismology/index.ts's applyMoonSeismology. Picking them here would
			// use a stale pre-seismology climate estimate.
			return ENVIRONMENT.enforceMoonTidalSafety({
				rng: params.rng,
				parentMassKg: params.massKg,
				parentDiameterKm: params.diameterKm,
				moon: {
					...moon,
					...moonEnvironment,
					impactZone: params.impactZone,
					siderealDayHours: moonTideLock.siderealDayHours,
					axialTiltDeg: moonTideLock.axialTiltDeg,
					eccentricity: moonTideLock.eccentricity,
					tideLockTrace: moonTideLock.trace,
					name: params.nameBody(`${params.moonSlotName}-moon-${moonIdx}`),
				},
			})
		})
		.filter((moon): moon is MoonBody => moon !== null)
}

export const MOON_PLACEMENT = { place }
