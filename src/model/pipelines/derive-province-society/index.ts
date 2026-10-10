import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { SIM_DERIVE } from "@/model/history/sim/derive"
import type {
	DerivedProvinceSociety,
	DeriveProvinceSocietyInput,
} from "@/model/pipelines/derive-province-society/types"
import type { StageTiming } from "@/model/pipelines/types"
import { COMPUTE_SETTLEMENT_REGIONS } from "@/model/society/infrastructure/settlements"

function deriveProvinceSociety({
	mesh,
	params,
	post,
	isLand,
	isEarthImport,
}: DeriveProvinceSocietyInput): DerivedProvinceSociety {
	const timings: StageTiming[] = []
	const record = <T>(stage: string, fn: () => T): T => {
		const t0 = performance.now()
		const result = fn()
		timings.push({ Stage: stage, ms: (performance.now() - t0).toFixed(1) })
		return result
	}

	const society = SIM_DERIVE.deriveSociety({
		isEarthImport,
		historyPipeline: params.historyPipeline,
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

	const landmarks = record("landmark identity", () =>
		LANDMARKS.assignLandmarkIdentity({
			mesh,
			landmarks: post.landmarks,
			provinces: post.provinces,
			cultures: society.cultures,
			isLand,
			seed: params.seed,
		}),
	)
	const settlementAnchors = record("settlement anchors", () =>
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
	)

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
