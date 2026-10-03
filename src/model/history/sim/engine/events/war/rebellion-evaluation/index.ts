import type { RecordParams } from "@/model/history/sim/engine/events/war/rebellion-evaluation/types"
import type { EngineNote } from "@/model/history/sim/engine/state/types"

function record({
	state,
	overlord,
	subject,
	seeded,
	succession,
	laxity,
	threshold,
	roll,
	decision,
	preview,
}: RecordParams): void {
	const data: EngineNote["data"] = {
		overlord,
		subject,
		seeded,
		succession,
		laxity,
		threshold,
		roll,
		decision,
		leagueLevy: preview.league.levy,
		leagueRegular: preview.league.regular,
		existingWars: preview.existingWars,
		crownStrength: preview.crownStrength,
		rebelStrength: preview.rebelStrength,
		threat: preview.threat,
		crownEnrolledLevy: state.levyCurrent[overlord],
		crownEnrolledRegular: state.regularCurrent[overlord],
	}
	for (const side of ["crown", "rebel"] as const) {
		const target = preview[side]
		data[side + "Budget"] = target.budget
		data[side + "Safety"] = target.safety
		data[side + "Logistics"] = target.logistics
		data[side + "Funding"] = target.funding
		data[side + "RemainingBudget"] = target.remainingBudget
		data[side + "BudgetLimited"] = target.limits.budget
		data[side + "PopulationLimited"] = target.limits.population
		data[side + "LogisticsLimited"] = target.limits.logistics
		for (const type of ["levy", "regular"] as const) {
			data[side + "Target" + type] = target[type]
			data[side + "Uncapped" + type] = target.uncapped[type]
			data[side + "HomePrice" + type] = target.home[type]
			data[side + "CampaignPrice" + type] = target.campaign[type]
		}
	}
	state.events.push({ tag: "rebellion evaluated", time: state.time, data })
}

export const REBELLION_EVALUATION = { record }
