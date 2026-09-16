import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type {
	ComputeImpactExposureForBodyInput,
	ImpactExposureBeltInput,
} from "@/model/celestial/system/generation/impact-exposure/types"
import type { ImpactExposure } from "@/model/celestial/system/types"

// Not a World Builder's Handbook mechanic -- a homebrew proxy combining two
// things the book does give us: orbital proximity (closer to a belt, more of
// its debris crosses this body's path -- belts are undifferentiated
// impactor reservoirs in this model) and Belt Bulk (p. 73, more material in
// the belt). Deterministic: no dice, just derived from already-rolled
// positions/bulk.
function findNearestBelt({
	bodyOrbitNumber,
	belts,
}: {
	bodyOrbitNumber: number
	belts: ImpactExposureBeltInput[]
}): { belt: ImpactExposureBeltInput; distanceOrbitNumber: number } | undefined {
	let nearest:
		| { belt: ImpactExposureBeltInput; distanceOrbitNumber: number }
		| undefined
	for (const belt of belts) {
		const beltOrbitNumber = ORBIT_BODY.auToOrbitNumber({
			au: belt.orbitalDistanceAU,
		})
		const distanceOrbitNumber = Math.abs(bodyOrbitNumber - beltOrbitNumber)
		if (!nearest || distanceOrbitNumber < nearest.distanceOrbitNumber) {
			nearest = { belt, distanceOrbitNumber }
		}
	}
	return nearest
}

function computeForBody({
	bodyOrbitalDistanceAU,
	belts,
}: ComputeImpactExposureForBodyInput): ImpactExposure {
	if (belts.length === 0) {
		return { nearestBeltOrbitNumberDistance: null, score: 0 }
	}
	const bodyOrbitNumber = ORBIT_BODY.auToOrbitNumber({
		au: bodyOrbitalDistanceAU,
	})
	const nearest = findNearestBelt({ bodyOrbitNumber, belts })!
	return {
		nearestBeltOrbitNumberDistance: nearest.distanceOrbitNumber,
		score: nearest.belt.bulk / (1 + nearest.distanceOrbitNumber),
	}
}

export const IMPACT_EXPOSURE = {
	computeForBody,
}
