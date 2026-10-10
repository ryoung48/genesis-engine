import type {
	SeedSettlementParams,
	SettledCountParams,
	SettlementState,
	StepSettlementParams,
} from "@/model/history/distribution/settlement/types"
import { DISTRIBUTION_STATUS } from "@/model/history/distribution/status"

function seed({
	migration,
	componentCount,
}: SeedSettlementParams): SettlementState {
	return {
		order: migration.order,
		arrivalYear: migration.arrivalYear,
		cursor: 0,
		capacities: new Array<number>(componentCount).fill(0),
		newlySettled: new Int32Array(0),
	}
}
function settledCount({ settlement, year }: SettledCountParams): number {
	let count = settlement.cursor
	while (
		count < settlement.order.length &&
		settlement.arrivalYear[settlement.order[count]] <= year
	)
		count++
	return count
}
function step({ settlement, territory, year }: StepSettlementParams): number {
	const count = settledCount({ settlement, year })
	settlement.newlySettled = settlement.order.slice(settlement.cursor, count)
	for (const p of settlement.newlySettled) {
		territory.owner[p] = DISTRIBUTION_STATUS.stateless
		settlement.capacities[territory.componentId[p]]++
	}
	const added = count - settlement.cursor
	settlement.cursor = count
	return added
}
export const DISTRIBUTION_SETTLEMENT = { seed, settledCount, step }
