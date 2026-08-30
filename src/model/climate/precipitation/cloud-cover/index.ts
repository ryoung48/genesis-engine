import type {
	CloudCoverAetPetParams,
	CloudCoverEstimateParams,
} from "@/model/climate/precipitation/cloud-cover/types"

const MIN_LAND_CLOUD_FRACTION = 0.12
const MAX_LAND_CLOUD_FRACTION = 0.82

function fromAetPet({ aetMm, petMm }: CloudCoverAetPetParams): number {
	const aet = Number.isFinite(aetMm) ? Math.max(0, aetMm) : 0
	const pet = Number.isFinite(petMm) ? Math.max(0, petMm) : 0
	const wetness = pet > 0 ? Math.min(1, aet / pet) : 1
	return (
		MIN_LAND_CLOUD_FRACTION +
		wetness * (MAX_LAND_CLOUD_FRACTION - MIN_LAND_CLOUD_FRACTION)
	)
}

function estimate({
	aetMm,
	petMm,
	rainfallMm,
	dtrC,
	temperatureC,
	oceanDistanceKm,
	isTidallyLocked,
}: CloudCoverEstimateParams): number {
	const wetness = petMm > 0 ? Math.min(1, Math.max(0, aetMm / petMm)) : 1
	const rainfallCloudiness = 1 - Math.exp(-Math.max(0, rainfallMm) / 100)
	const inverseDtr = isTidallyLocked
		? 0
		: 1 - Math.min(1, Math.max(0, dtrC / 18))
	const coastalInfluence = Math.exp(-Math.max(0, oceanDistanceKm) / 800)
	const warmth = Math.min(1, Math.max(0, (temperatureC + 10) / 35))
	return Math.min(
		1,
		Math.max(
			0,
			0.41 +
				0.11 * wetness +
				0.38 * rainfallCloudiness +
				0.31 * inverseDtr -
				0.1 * coastalInfluence -
				0.2 * warmth,
		),
	)
}

/**
 * Converts terrestrial evaporative wetness into a compact cloud-cover proxy.
 * AET/PET is zero in dry, water-limited conditions and one when evapotranspiration
 * meets atmospheric demand; it intentionally does not estimate clouds over oceans.
 */
export const CLOUD_COVER = {
	estimate,
	fromAetPet,
}
