import type { GenesisLandmarks } from "@/model/geography/terrain/landmarks/types"
import type { SIM_DERIVE } from "@/model/history/sim/derive"
import type { SphereMesh } from "@/model/mesh/types"
import type { POST_ELEVATION } from "@/model/pipelines/post-elevation"
import type { GenesisParams, StageTiming } from "@/model/pipelines/types"

export interface DeriveProvinceSocietyInput {
	isEarthImport: boolean
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

export interface DerivedProvinceSociety {
	nations: DerivedSociety["nations"]
	cultures: DerivedSociety["cultures"]
	heritages: DerivedSociety["heritages"]
	religions: DerivedSociety["religions"]
	religionFamilies: DerivedSociety["religionFamilies"]
	religionTypes: DerivedSociety["religionTypes"]
	religionDoctrine: DerivedSociety["religionDoctrine"]
	landmarks: GenesisLandmarks
	settlementRegions: Int32Array
	settlementWaterLandmarks: Int32Array
	settlementPortRegions: Int32Array
	timings: StageTiming[]
}
