import type { CloudCoverFromAetPetParams } from "@/model/climate/cloud-cover/types"

const MIN_LAND_CLOUD_FRACTION = 0.12
const MAX_LAND_CLOUD_FRACTION = 0.82

function fromAetPet({ aetMm, petMm }: CloudCoverFromAetPetParams): number {
	const aet = Number.isFinite(aetMm) ? Math.max(0, aetMm) : 0
	const pet = Number.isFinite(petMm) ? Math.max(0, petMm) : 0
	const wetness = pet > 0 ? Math.min(1, aet / pet) : 1
	return (
		MIN_LAND_CLOUD_FRACTION +
		wetness * (MAX_LAND_CLOUD_FRACTION - MIN_LAND_CLOUD_FRACTION)
	)
}

/**
 * Converts terrestrial evaporative wetness into a compact cloud-cover proxy.
 * AET/PET is zero in dry, water-limited conditions and one when evapotranspiration
 * meets atmospheric demand; it intentionally does not estimate clouds over oceans.
 */
export const CLOUD_COVER = {
	fromAetPet,
}
