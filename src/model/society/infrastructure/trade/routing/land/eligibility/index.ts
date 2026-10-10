import type { ComputeGroupIdsParams } from "@/model/society/infrastructure/trade/routing/land/eligibility/types"

function computeGroupIds({
	state,
	landPassable,
	provinceClusters,
}: ComputeGroupIdsParams): Float64Array {
	const groupIds = new Float64Array(state.regionProvince.length).fill(-1)
	for (let region = 0; region < groupIds.length; region++) {
		const province = state.regionProvince[region]
		if (!landPassable[region] || province < 0) continue
		const cluster = provinceClusters[province]
		const landmark = state.landmarks.regionLandmark[region]
		if (cluster >= 0 && landmark >= 0) {
			groupIds[region] = landmark * groupIds.length + cluster
		}
	}
	return groupIds
}

export const LAND_ELIGIBILITY = { computeGroupIds }
