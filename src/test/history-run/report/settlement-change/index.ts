import { RECORD_ROUTES } from "@/model/history/record/routes"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { ROUTES } from "@/model/society/infrastructure/trade/routing/network"
import { ROUTE_TUNING } from "@/model/society/infrastructure/trade/routing/route-tuning"
import { SETTLEMENT_TUNING } from "@/model/society/settlement-tuning"
import type {
	SettlementChange,
	SettlementChangeReport,
	SettlementClassifyParams,
	SettlementSampleParams,
	SettlementSummaryParams,
	SettlementTracker,
} from "@/test/history-run/report/settlement-change/types"

const MIGRATION_FLOOR =
	Math.round(0.97 ** ROUTE_TUNING.batchIntervalYears * 1000) / 1000
const GROWTH_CEILING =
	Math.round((1.01 * 1.03) ** ROUTE_TUNING.batchIntervalYears * 1000) / 1000
function classify({
	before,
	after,
	townMin,
	year,
	roadMembers,
}: SettlementClassifyParams): SettlementChange[] {
	const result: SettlementChange[] = []
	for (let province = 0; province < before.length; province++) {
		if (before[province] < townMin) continue
		const ratio = after[province] / before[province]
		result.push({
			province,
			year,
			before: before[province],
			after: after[province],
			ratio,
			lost: before[province] - after[province],
			road: roadMembers.has(province),
			band:
				ratio < 0.5
					? "halved"
					: ratio < MIGRATION_FLOOR
						? "shockFall"
						: ratio <= GROWTH_CEILING
							? "normal"
							: "surge",
		})
	}
	return result
}
function create(engine: HistoryState): SettlementTracker {
	return { previous: engine.popUrbanCurrent.slice(), steps: [] }
}
function sample({ tracker, engine, year }: SettlementSampleParams): void {
	const roadMembers = RECORD_ROUTES.endpoints(
		engine.roads
			? ROUTES.stored(engine.roads).filter((route) => route.kind !== 2)
			: [],
	)
	tracker.steps.push(
		...classify({
			before: tracker.previous,
			after: engine.popUrbanCurrent,
			townMin: SETTLEMENT_TUNING.getSettlementEraTuning(engine.era).townMin,
			year,
			roadMembers,
		}),
	)
	tracker.previous = engine.popUrbanCurrent.slice()
}
function of({
	tracker,
	from,
	to,
}: SettlementSummaryParams): SettlementChangeReport {
	const steps = tracker.steps.filter(
		(step) => step.year > from && step.year <= to,
	)
	const bands: SettlementChangeReport["bands"] = {
		halved: { count: 0, roadShare: 0 },
		shockFall: { count: 0, roadShare: 0 },
		normal: { count: 0, roadShare: 0 },
		surge: { count: 0, roadShare: 0 },
	}
	for (const step of steps) {
		bands[step.band].count++
		if (step.road) bands[step.band].roadShare++
	}
	for (const band of Object.values(bands))
		band.roadShare /= Math.max(1, band.count)
	const falls = steps.filter((step) => step.lost > 0)
	return {
		sampled: steps.length,
		bands,
		largestRatioFalls: falls
			.toSorted((a, b) => a.ratio - b.ratio || b.lost - a.lost)
			.slice(0, 5),
		largestPeopleFalls: falls
			.toSorted((a, b) => b.lost - a.lost || a.ratio - b.ratio)
			.slice(0, 5),
	}
}
export const SETTLEMENT_CHANGE_REPORT = { create, sample, classify, of }
