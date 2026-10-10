import type {
	SeedSettlementParams,
	SettledCountParams,
	SettlementState,
	StepSettlementParams,
} from "@/model/history/distribution/settlement/types"
import { DISTRIBUTION_STATUS } from "@/model/history/distribution/status"
import { DISTRIBUTION_TARGETS } from "@/model/history/distribution/targets"

function seed({
	provinces,
	migrationWave,
}: SeedSettlementParams): SettlementState {
	const arrival = (p: number) =>
		migrationWave[p] < 0 ? Infinity : migrationWave[p]
	const habitable: number[] = []
	for (let p = 0; p < provinces.count; p++)
		if (!provinces.desolate[p]) habitable.push(p)
	habitable.sort((a, b) => arrival(a) - arrival(b) || a - b)
	return { order: Int32Array.from(habitable), cursor: 0 }
}

function settledCount({ settlement, year }: SettledCountParams): number {
	const { uninhabited } = DISTRIBUTION_TARGETS.status({ year })
	return Math.max(
		settlement.cursor,
		Math.min(
			settlement.order.length,
			Math.ceil((1 - uninhabited) * settlement.order.length - 1e-9),
		),
	)
}

function step({ settlement, territory, year }: StepSettlementParams): number {
	const count = settledCount({ settlement, year })
	const settled = count - settlement.cursor
	for (let i = settlement.cursor; i < count; i++)
		territory.owner[settlement.order[i]] = DISTRIBUTION_STATUS.stateless
	settlement.cursor = count
	return settled
}

export const DISTRIBUTION_SETTLEMENT = { seed, settledCount, step }
