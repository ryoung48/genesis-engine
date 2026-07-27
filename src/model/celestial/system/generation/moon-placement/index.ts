import { MOON } from "@/model/celestial/moons"
import type { MoonBody } from "@/model/celestial/moons/types"
import { PLANET } from "@/model/celestial/planet"
import type {
	MoonPlacementInput,
	MoonPlacementResult,
} from "@/model/celestial/system/generation/moon-placement/types"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import { ENVIRONMENT } from "@/model/celestial/system/generation/environment"
import { TEXTURE } from "@/model/celestial/system/generation/texture"

function place(params: MoonPlacementInput): MoonPlacementResult {
	if (params.moonCount <= 0) return []
	const moons = MOON.generateMoons({
		count: params.moonCount,
		seed: params.rng.randint(1, 1_000_000_000),
		planetRadiusKm: params.diameterKm / 2,
		orbitalDistanceAU: params.orbitalDistanceAU,
		starMassKg: params.starMassKg,
		parentGroup: params.group,
	})
	return (
		moons
			// biome-ignore lint/nursery/useMaxParams: native Array callback signature
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
				return ENVIRONMENT.enforceMoonTidalSafety({
					rng: params.rng,
					parentMassKg: params.massKg,
					parentDiameterKm: params.diameterKm,
					moon: {
						...moon,
						...moonEnvironment,
						siderealDayHours: moonTideLock.siderealDayHours,
						axialTiltDeg: moonTideLock.axialTiltDeg,
						eccentricity: moonTideLock.eccentricity,
						texturePath: TEXTURE.pickGeneratedTexturePath({
							rng: params.rng,
							classification: moonEnvironment.classification,
						}),
						name: params.nameBody(`${params.moonSlotName}-moon-${moonIdx}`),
					},
				})
			})
			.filter((moon): moon is MoonBody => moon !== null)
	)
}

export const MOON_PLACEMENT = { place }
