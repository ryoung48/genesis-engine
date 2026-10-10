import type {
	MembershipChanges,
	MembershipParams,
} from "@/model/society/infrastructure/trade/routing/membership/types"
import {
	ROUTE_TUNING,
	routePopulationThresholds,
} from "@/model/society/infrastructure/trade/routing/route-tuning"

function advance({
	state,
	urbanPopulation,
}: MembershipParams): MembershipChanges {
	const thresholds = routePopulationThresholds(state.world.era)
	const limits = [
		thresholds.majorSettlementMin,
		thresholds.minorSettlementMin,
		thresholds.portSettlementMin,
	]
	const land = new Set<number>()
	const sea = new Set<number>()
	let count = 0
	for (let p = 0; p < state.world.P; p++) {
		const population = urbanPopulation[p] ?? 0
		for (let tier = 0; tier < 3; tier++) {
			const group = tier === 2 ? state.seaGroups[p] : state.landGroups[p]
			if (group < 0) continue
			const was = state.membership[tier][p]
			const entered = state.enteredBatch[tier][p]
			const next = was
				? !(
						population < limits[tier] * ROUTE_TUNING.membership.releaseShare &&
						state.batch - entered >= ROUTE_TUNING.membership.minDwellBatches
					)
				: tier === 0
					? population > limits[tier]
					: population >= limits[tier]
			if (Number(next) !== was) {
				state.membership[tier][p] = Number(next)
				state.enteredBatch[tier][p] = next ? state.batch : -1
				;(tier === 2 ? sea : land).add(group)
				count++
			}
		}
		const longSea = Number(population >= thresholds.shortRouteMaxPop)
		if (state.membership[2][p] && longSea !== state.longSea[p])
			sea.add(state.seaGroups[p])
		state.longSea[p] = longSea
	}
	return { land, sea, count }
}
export const ROUTE_MEMBERSHIP = { advance }
