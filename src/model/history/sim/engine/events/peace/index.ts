import { ECONOMY } from "@/model/history/sim/engine/economy"
import { TREASURY_BUDGET } from "@/model/history/sim/engine/economy/treasury-budget"
import type { ArmyTradition } from "@/model/history/sim/engine/economy/types"
import { DISPOSITION } from "@/model/history/sim/engine/events/diplomacy/disposition"
import { TRUCE } from "@/model/history/sim/engine/events/peace/truce"
import type {
	AcceptBuyoffParams,
	BuyoffParams,
	ConcludeParams,
	PeaceParams,
	PeaceTerms,
} from "@/model/history/sim/engine/events/peace/types"
import { OVERTHROW } from "@/model/history/sim/engine/events/succession/overthrow"
import { BACKING } from "@/model/history/sim/engine/events/war/backing"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { MILITARY } from "@/model/history/sim/engine/military"
import { STATE } from "@/model/history/sim/engine/state"
import { PEOPLE } from "@/model/history/sim/people"

const INDEMNITY_SHARE = 0.1
const INDEMNITY_YEARS = 5
const LAND_VALUE_YEARS = 20
const BUYOFF_THREAT = 0.01
const BUYOFF_ACCEPTANCE = 0.5
const MIN_INDEMNITY_CHANCE = 0.1
const MAX_INDEMNITY_CHANCE = 0.9
const CASH_DISCOUNT: Record<ArmyTradition, number> = {
	settled: 1,
	tribal: 0.6,
	steppe: 0.6,
}

function buyoff({ state, war }: BuyoffParams): number {
	if (war.goal !== "conquest" || war.occupied.length === 0) return 0
	const threat = MILITARY.threat({
		state,
		attacker: war.attacker,
		defender: war.defender,
	})
	if (threat >= BUYOFF_THREAT) return 0
	const defenderProvinces = STATE.getNationProvinces({
		state,
		root: war.defender,
	})
	const output = defenderProvinces.reduce(
		(sum, p) => sum + ECONOMY.provinceOutput({ state, p }),
		0,
	)
	if (output <= 0) return 0
	const occupied = new Set(
		war.occupied.flatMap((root) => STATE.getNationProvinces({ state, root })),
	)
	const occupiedOutput = defenderProvinces.reduce(
		(sum, p) =>
			sum + (occupied.has(p) ? ECONOMY.provinceOutput({ state, p }) : 0),
		0,
	)
	const ask =
		(1 - threat) *
		LAND_VALUE_YEARS *
		(occupiedOutput / output) *
		ECONOMY.revenue({ state, p: war.defender }) *
		CASH_DISCOUNT[ECONOMY.armyTradition({ state, p: war.attacker })]
	return ask > 0 && FIELDS.prov.treasury.get({ state, p: war.defender }) >= ask
		? ask
		: 0
}

function acceptBuyoff({ state, war, rng }: AcceptBuyoffParams): boolean {
	return buyoff({ state, war }) > 0 && rng.random() < BUYOFF_ACCEPTANCE
}

function indemnityChance({ state, war }: BuyoffParams): number {
	const defenderShare = MILITARY.threat({
		state,
		attacker: war.attacker,
		defender: war.defender,
	})
	const advantage = Math.max(0, 2 * defenderShare - 1)
	return (
		MIN_INDEMNITY_CHANCE +
		(MAX_INDEMNITY_CHANCE - MIN_INDEMNITY_CHANCE) * advantage
	)
}

function terms({ state, war, reason }: PeaceParams): PeaceTerms {
	const base = {
		transferred: [] as number[],
		receiver: war.attacker,
		payment: 0,
		payer: -1,
	}
	if (reason === "not sovereign") {
		const attacker = STATE.isSovereign({ state, p: war.attacker })
		const defender = STATE.isSovereign({ state, p: war.defender })
		const { rebels, crown } = STATE.warSides({ war })
		if (
			war.goal !== "conquest" &&
			!STATE.isSovereign({ state, p: crown }) &&
			STATE.isSovereign({ state, p: rebels })
		)
			return { ...base, outcome: "independence", winner: rebels }
		return {
			...base,
			outcome: "lapsed",
			winner: attacker ? war.attacker : defender ? war.defender : -1,
		}
	}
	if (war.goal === "throne") {
		if (reason === "capital taken")
			return {
				...base,
				outcome: "regime change",
				winner: war.attacker,
				receiver: war.defender,
				transferred: STATE.getNationProvinces({ state, root: war.attacker }),
			}
		if (war.occupied.length > 0)
			return {
				...base,
				outcome: "cession",
				winner: war.attacker,
				transferred: Array.from(
					new Set(
						war.occupied.flatMap((root) =>
							STATE.getNationProvinces({ state, root }),
						),
					),
				).filter((p) => STATE.getSovereign({ state, p }) === war.defender),
			}
		return {
			...base,
			outcome: "submission",
			winner: war.defender,
			receiver: war.defender,
			transferred: STATE.getNationProvinces({ state, root: war.attacker }),
		}
	}
	if (reason === "peace bought")
		return {
			...base,
			outcome: "bought peace",
			winner: war.attacker,
			payer: war.defender,
			payment: buyoff({ state, war }),
		}
	if (reason === "capital taken")
		return {
			...base,
			outcome: war.goal === "independence" ? "restoration" : "annexation",
			winner: war.attacker,
			transferred: STATE.getNationProvinces({ state, root: war.defender }),
		}
	if (war.occupied.length > 0)
		return {
			...base,
			outcome: war.goal === "independence" ? "independence" : "cession",
			winner: war.goal === "independence" ? war.defender : war.attacker,
			transferred: Array.from(
				new Set(
					war.occupied.flatMap((root) =>
						STATE.getNationProvinces({ state, root }),
					),
				),
			).filter((p) => STATE.getSovereign({ state, p }) === war.defender),
		}
	if (war.goal === "independence")
		return { ...base, outcome: "independence", winner: war.defender }
	if (
		reason === "occupation restored" ||
		reason === "offensive spent" ||
		reason === "offensive repelled"
	) {
		return {
			...base,
			outcome: "indemnity",
			winner: war.defender,
			payer: war.attacker,
		}
	}
	return { ...base, outcome: "white peace", winner: war.defender }
}

function conclude({ state, war, reason, rng }: ConcludeParams): PeaceTerms {
	let result = terms({ state, war, reason })
	const claimant = state.people.rulerOf[war.attacker]
	const claim = state.leaderClaimCurrent[war.attacker]
	const deposed =
		state.people.rulerOf[war.defender] >= 0
			? state.people.rulerOf[war.defender]
			: war.originalCrownRuler
	if (
		result.outcome === "indemnity" &&
		rng.random() >= indemnityChance({ state, war })
	)
		result = { ...result, outcome: "white peace", payer: -1 }
	if (result.outcome === "annexation" || result.outcome === "restoration")
		STATE.releaseSubjectRelations({ state, nation: war.defender })
	if (result.outcome === "regime change" || result.outcome === "submission")
		STATE.releaseSubjectRelations({ state, nation: war.attacker })
	if (result.outcome === "indemnity")
		state.indemnities.push({
			payer: war.attacker,
			receiver: war.defender,
			until: state.time + STATE.deltaYear(INDEMNITY_YEARS),
		})
	if (result.outcome === "bought peace" && result.payment > 0) {
		for (const [nation, amount] of [
			[war.defender, -result.payment],
			[war.attacker, result.payment],
		]) {
			FIELDS.prov.treasury.set({
				state,
				p: nation,
				value: FIELDS.prov.treasury.get({ state, p: nation }) + amount,
			})
			const budget = TREASURY_BUDGET.get({ state, p: nation })
			budget.boughtPeace += amount
			budget.otherChangesTotal += amount
		}
	}
	STATE.resolveWar({
		state,
		war,
		transferred: result.transferred,
		receiver: result.receiver,
	})
	if (result.outcome === "regime change" && claimant >= 0)
		OVERTHROW.enthrone({ state, war, claimant, claim, deposed, rng })
	if (result.outcome === "submission")
		PEOPLE.vacate({
			people: state.people,
			seat: war.attacker,
			reason: "rebellion",
		})
	BACKING.repay({ state, war, outcome: result.outcome })
	DISPOSITION.afterWar({ state, war, outcome: result.outcome })
	if (
		result.outcome !== "annexation" &&
		result.outcome !== "restoration" &&
		result.outcome !== "regime change" &&
		result.outcome !== "submission"
	)
		STATE.fixConnections({ state, nation: war.defender, rng })
	STATE.setRelation({
		state,
		a: war.attacker,
		b: war.defender,
		rel: STATE.rel.NONE,
	})
	STATE.setDisposition({
		state,
		a: war.attacker,
		b: war.defender,
		disposition: STATE.disp.SUSPICIOUS,
	})
	TRUCE.sign({ state, a: war.attacker, b: war.defender })
	state.events.push({
		tag: "war ended",
		time: state.time,
		data: {
			war: war.idx,
			attacker: war.attacker,
			defender: war.defender,
			winner: result.winner,
			transferred: result.transferred,
			reason,
			outcome: result.outcome,
			payment: result.payment,
			payer: result.payer,
		},
	})
	return result
}

export const PEACE = {
	conclude,
	terms,
	buyoff,
	acceptBuyoff,
	indemnityShare: INDEMNITY_SHARE,
	indemnityYears: INDEMNITY_YEARS,
}
