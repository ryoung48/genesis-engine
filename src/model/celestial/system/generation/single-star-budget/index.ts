import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import { STAR } from "@/model/celestial/star"
import { ANOMALOUS_ORBITS } from "@/model/celestial/system/generation/anomalous-orbits"
import { BASELINE_NUMBER } from "@/model/celestial/system/generation/baseline-number"
import { BASELINE_ORBIT } from "@/model/celestial/system/generation/baseline-orbit"
import { EMPTY_ORBITS } from "@/model/celestial/system/generation/empty-orbits"
import { FINAL_ORBIT_ENVIRONMENT } from "@/model/celestial/system/generation/final-orbit-environment"
import { ORBIT_PLACEMENT } from "@/model/celestial/system/generation/orbit-placement"
import type {
	SingleStarBudget,
	SingleStarBudgetInput,
} from "@/model/celestial/system/generation/single-star-budget/types"
import { WORLD_TYPE_ALLOCATION } from "@/model/celestial/system/generation/world-type-allocation"
import { WORLD_TYPE_COUNTS } from "@/model/celestial/system/generation/world-type-counts"
import { RNG } from "@/model/shared/random/rng"

function roll({ seed, hostStar }: SingleStarBudgetInput): SingleStarBudget {
	const worldTypeCounts = WORLD_TYPE_COUNTS.roll({
		rng: RNG.createStringRng({ seed: `world-type-counts:${seed}` }),
		primarySpectralClass: hostStar.spectralClass,
		primaryLuminosityClass: hostStar.luminosityClass,
		primaryMassSol: hostStar.massSol,
		primaryAgeGyr: hostStar.ageGyr,
		isLoneStar: true,
		systemPostStellarCount: STAR.isPostStellar(hostStar.spectralClass) ? 1 : 0,
		systemStarCount: 1,
	})
	const allocated = WORLD_TYPE_ALLOCATION.allocate({
		worldTypeCounts,
		stars: [
			{
				orbitalDistanceAU: 0,
				mao: hostStar.mao,
				maxOrbitalDistanceAU: ORBIT_BODY.orbitNumberToAU({ orbitNumber: 20 }),
				acceptsBodies: true,
			},
		],
	})[0]!
	const emptyOrbitCount = EMPTY_ORBITS.roll({
		rng: RNG.createStringRng({ seed: `empty-orbits:${seed}:0` }),
		normalWorldCount: allocated.totalWorlds,
	})
	const totalWorlds = allocated.totalWorlds + emptyOrbitCount
	const baselineNumber = BASELINE_NUMBER.roll({
		rng: RNG.createStringRng({ seed: `baseline-number:${seed}:0` }),
		totalWorlds,
		otherStarCount: 0,
		hasEpistellarCompanion: false,
		hostSpectralClass: hostStar.spectralClass,
		hostLuminosityClass: hostStar.luminosityClass,
	})
	const minimumOrbitNumber = ORBIT_BODY.auToOrbitNumber({ au: hostStar.mao })
	const baselineOrbitNumber = BASELINE_ORBIT.roll({
		rng: RNG.createStringRng({ seed: `baseline-orbit:${seed}:0` }),
		baselineNumber,
		totalWorlds,
		habitableZoneOrbitNumber: ORBIT_BODY.auToOrbitNumber({
			au: STAR.getHabitableZoneAU(hostStar.luminositySol),
		}),
		minimumOrbitNumber,
		maximumOrbitNumber: 20,
	})
	const anomalousOrbitReservations = ANOMALOUS_ORBITS.roll({
		rng: RNG.createStringRng({ seed: `anomalous-orbits:${seed}` }),
		terrestrialCount: worldTypeCounts.terrestrialCount,
		eligibleStarIndices: [0],
	})
	const orbitSlots = FINAL_ORBIT_ENVIRONMENT.hydrate({
		slots: ORBIT_PLACEMENT.place({
			rng: RNG.createStringRng({ seed: `orbit-placement:${seed}:0` }),
			baselineNumber,
			baselineOrbitNumber,
			totalWorlds,
			gasGiantCount: allocated.gasGiantCount,
			beltCount: allocated.beltCount,
			terrestrialCount: allocated.terrestrialCount,
			emptyOrbitCount,
			anomalousOrbitReservations,
			minimumOrbitNumber,
			maximumOrbitNumber: 20,
			exclusionZones: [],
		}),
		luminositySol: hostStar.luminositySol,
	})
	return {
		worldTypeAllocation: {
			...allocated,
			emptyOrbitCount,
			anomalousOrbitReservations,
			baselineNumber,
			baselineOrbitNumber,
			totalWorlds,
			orbitSlots,
		},
	}
}

export const SINGLE_STAR_BUDGET = {
	roll,
}
