import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import { PLANET } from "@/model/celestial/planet"
import type { FinalOrbitEnvironmentInput } from "@/model/celestial/system/generation/final-orbit-environment/types"
import type { OrbitSlot } from "@/model/celestial/system/generation/orbit-placement/types"

function hydrate({
	slots,
	luminositySol,
}: FinalOrbitEnvironmentInput): OrbitSlot[] {
	return slots.map((slot) => {
		const orbitalDistanceAU = ORBIT_BODY.orbitNumberToAU({
			orbitNumber: slot.orbitNumber,
		})
		const deviation = PLANET.estimateDeviationFromOrbitalDistance({
			orbitalDistanceAU,
			luminositySol,
		})
		return {
			...slot,
			orbitalDistanceAU,
			deviation,
			zone: PLANET.zoneFromDeviation(deviation),
		}
	})
}

export const FINAL_ORBIT_ENVIRONMENT = {
	hydrate,
}
