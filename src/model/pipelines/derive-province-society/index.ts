import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import type { GenesisLandmarks } from "@/model/geography/terrain/landmarks/types"
import { SIM_DERIVE } from "@/model/history/sim/derive"
import type { SphereMesh } from "@/model/mesh/types"
import { POST_ELEVATION } from "@/model/pipelines/post-elevation"
import type { GenesisParams, StageTiming } from "@/model/pipelines/types"
import { COMPUTE_SETTLEMENT_REGIONS } from "@/model/society/infrastructure/settlements"

interface DeriveProvinceSocietyInput {
	mesh: SphereMesh
	params: Pick<GenesisParams, "seed" | "planetRadiusKm" | "era">
	post: Pick<
		ReturnType<typeof POST_ELEVATION.runPostElevationPipeline>,
		| "coastal"
		| "eraSettledMask"
		| "eraStatehoodMask"
		| "landmarks"
		| "population"
		| "provinces"
		| "rivers"
		| "topography"
		| "waterAccess"
	>
	isLand: Uint8Array
}

type DerivedSociety = ReturnType<typeof SIM_DERIVE.deriveSociety>

interface DerivedProvinceSociety {
	nations: DerivedSociety["nations"]
	cultures: DerivedSociety["cultures"]
	heritages: DerivedSociety["heritages"]
	religions: DerivedSociety["religions"]
	religionFamilies: DerivedSociety["religionFamilies"]
	religionTypes: DerivedSociety["religionTypes"]
	landmarks: GenesisLandmarks
	settlementRegions: Int32Array
	settlementWaterLandmarks: Int32Array
	settlementPortRegions: Int32Array
	timings: StageTiming[]
}

function deriveProvinceSociety({
	mesh,
	params,
	post,
	isLand,
}: DeriveProvinceSocietyInput): DerivedProvinceSociety {
	const timings: StageTiming[] = []
	const record = <T>(stage: string, fn: () => T): T => {
		const t0 = performance.now()
		const result = fn()
		timings.push({ Stage: stage, ms: (performance.now() - t0).toFixed(1) })
		return result
	}

	const society = SIM_DERIVE.deriveSociety({
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
