import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { SIM_DERIVE } from "@/model/history/sim/derive"
import type {
	DerivedProvinceSociety,
	DeriveProvinceSocietyInput,
} from "@/model/pipelines/derive-province-society/types"
import { TIMING } from "@/model/shared/timing"
import type { StageTiming } from "@/model/shared/timing/types"
import { COMPUTE_SETTLEMENT_REGIONS } from "@/model/society/infrastructure/settlements"

function deriveProvinceSociety({
	mesh,
	params,
	post,
	isLand,
	isEarthImport,
}: DeriveProvinceSocietyInput): DerivedProvinceSociety {
	const timings: StageTiming[] = []
	const society = SIM_DERIVE.deriveSociety({
		isEarthImport,
		provinces: post.provinces,
		population: post.population,
		landmarks: post.landmarks,
		coastal: post.coastal,
		waterAccess: post.waterAccess,
		riverVisible: post.rivers.visible,
		r_xyz: mesh.r_xyz,
		seed: params.seed,
		planetRadiusKm: params.planetRadiusKm,
		era: params.era,
		eraSettledMask: post.eraSettledMask,
		eraStatehoodMask: post.eraStatehoodMask,
		timings,
	})

	const landmarks = TIMING.measure({
		stage: "landmark identity",
		timings,
		fn: () =>
			LANDMARKS.assignLandmarkIdentity({
				mesh,
				landmarks: post.landmarks,
				provinces: post.provinces,
				cultures: society.cultures,
				isLand,
				seed: params.seed,
			}),
	})
	const settlementAnchors = TIMING.measure({
		stage: "settlement anchors",
		timings,
		fn: () =>
			COMPUTE_SETTLEMENT_REGIONS.computeSettlementAnchors({
				world: {
					mesh,
					provinces: post.provinces,
					topography: post.topography,
					coastal: post.coastal,
					rivers: post.rivers ? { visible: post.rivers.visible } : undefined,
					isLand,
					landmarks,
				},
				activeProvinceMask: post.eraStatehoodMask,
			}),
	})

	return {
		nations: society.nations,
		cultures: society.cultures,
		heritages: society.heritages,
		religions: society.religions,
		religionFamilies: society.religionFamilies,
		religionTypes: society.religionTypes,
		religionDoctrine: society.religionDoctrine,
		landmarks,
		settlementRegions: settlementAnchors.settlementRegions,
		settlementWaterLandmarks: settlementAnchors.settlementWaterLandmarks,
		settlementPortRegions: settlementAnchors.settlementPortRegions,
		timings,
	}
}

export const DERIVE_PROVINCE_SOCIETY = {
	deriveProvinceSociety,
}
