import { VEGETATION } from "@/model/climate/classification/vegetation"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import type {
	Battlefield,
	BattlefieldParams,
	ProvinceCodesParams,
	ProvinceTerrain,
	ProvinceTerrainParams,
	TopographyLabel,
	VegetationLabel,
} from "@/model/history/sim/engine/terrain/types"

const TOPOGRAPHY_LABELS = CLASSIFICATION.genesisTopographyLabels

const VEGETATION_LABELS = VEGETATION.biomeLabels

const NEUTRAL_TOPOGRAPHY: TopographyLabel = "flat"

const NEUTRAL_VEGETATION: VegetationLabel = "grasslands"

const WATER_TOPOGRAPHY = new Set<TopographyLabel>(["ocean", "lake"])

const WATER_VEGETATION = new Set<VegetationLabel>(["ocean"])

const TOPOGRAPHY_DEFENSE: Record<TopographyLabel, number> = {
	flat: 0,
	hill: 0.1,
	plateau: 0.05,
	mountains: 0.2,
	marsh: 0.15,
	ocean: 0,
	lake: 0,
}

const VEGETATION_DEFENSE: Record<VegetationLabel, number> = {
	ocean: 0,
	desert: 0,
	sparse: 0,
	grasslands: 0,
	woods: 0.05,
	forest: 0.1,
	jungle: 0.15,
}

function provinceCodes({
	codes,
	seeds,
	neutral,
	source,
}: ProvinceCodesParams): Uint8Array {
	const out = new Uint8Array(seeds.length).fill(neutral)
	if (!codes) {
		console.warn(`history terrain: no generated ${source}; using neutral`)
		return out
	}
	for (let p = 0; p < seeds.length; p++)
		if (seeds[p] >= 0) out[p] = codes[seeds[p]]
	return out
}

function provinceTerrain({
	topography,
	vegetation,
	seeds,
}: ProvinceTerrainParams): ProvinceTerrain {
	return {
		topography: provinceCodes({
			codes: topography,
			seeds,
			neutral: TOPOGRAPHY_LABELS.indexOf(NEUTRAL_TOPOGRAPHY),
			source: "topography",
		}),
		vegetation: provinceCodes({
			codes: vegetation,
			seeds,
			neutral: VEGETATION_LABELS.indexOf(NEUTRAL_VEGETATION),
			source: "vegetation",
		}),
	}
}

function battlefield({ state, p }: BattlefieldParams): Battlefield {
	const rawTopography =
		TOPOGRAPHY_LABELS[state.provinceTopography[p]] ?? NEUTRAL_TOPOGRAPHY
	const rawVegetation =
		VEGETATION_LABELS[state.provinceVegetation[p]] ?? NEUTRAL_VEGETATION
	const waterTopography = WATER_TOPOGRAPHY.has(rawTopography)
	const waterVegetation = WATER_VEGETATION.has(rawVegetation)
	const topography = waterTopography ? NEUTRAL_TOPOGRAPHY : rawTopography
	const vegetation = waterVegetation ? NEUTRAL_VEGETATION : rawVegetation
	return {
		topography,
		vegetation,
		water: waterTopography || waterVegetation,
		defense:
			1 + TOPOGRAPHY_DEFENSE[topography] + VEGETATION_DEFENSE[vegetation],
	}
}

export const TERRAIN = {
	provinceTerrain,
	battlefield,
	hasRiver: ({ state, p }: BattlefieldParams) => state.riverByProvince[p] !== 0,
}
