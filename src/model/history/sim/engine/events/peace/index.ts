import { ECONOMY } from "@/model/history/sim/engine/economy"
import { TREASURY_BUDGET } from "@/model/history/sim/engine/economy/treasury-budget"
import { DISPOSITION } from "@/model/history/sim/engine/events/diplomacy/disposition"
import { TRUCE } from "@/model/history/sim/engine/events/peace/truce"
import type {
	AcceptBuyoffParams,
	BuyoffParams,
	ConcludeParams,
	NegotiateParams,
	PeaceParams,
	PeaceTerms,
} from "@/model/history/sim/engine/events/peace/types"
import { SIEGE } from "@/model/history/sim/engine/events/siege"
import { OVERTHROW } from "@/model/history/sim/engine/events/succession/overthrow"
import { BACKING } from "@/model/history/sim/engine/events/war/backing"
import { WAR_SCORE } from "@/model/history/sim/engine/events/war/score"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { MILITARY } from "@/model/history/sim/engine/military"
import { STATE } from "@/model/history/sim/engine/state"
import { PEOPLE } from "@/model/history/sim/people"

const INDEMNITY_SHARE = 0.1
const INDEMNITY_YEARS = 5
const LAND_VALUE_YEARS = 20
const BUYOFF_THREAT = 0.01
const BUYOFF_ACCEPTANCE = 0.25
const DEAL_OFFER_CHANCE = 0.1
const DEAL_ACCEPTANCE = 0.5
const DEAL_DEFENDER_PAYS_SCORE = 50
const DEAL_ATTACKER_PAYS_SCORE = 10
const MIN_INDEMNITY_CHANCE = 0.1
const MAX_INDEMNITY_CHANCE = 0.9

// A realm is its root province, so whoever holds the capital when the war ends
// takes the whole realm.
function capitalHeld({ state, war }: BuyoffParams): boolean {
	return state.occupationCurrent[war.defender] === war.idx
}

function landValue({ state, war }: BuyoffParams): number {
	const occupied = new Set(STATE.occupiedLand({ state, war }))
	if (occupied.size === 0) return 0
	const defenderProvinces = STATE.getNationProvinces({
		state,
		root: war.defender,
	})
	const output = defenderProvinces.reduce(
		(sum, p) => sum + ECONOMY.provinceOutput({ state, p }),
		0,
	)
	if (output <= 0) return 0
	const occupiedOutput = defenderProvinces.reduce(
		(sum, p) =>
			sum + (occupied.has(p) ? ECONOMY.provinceOutput({ state, p }) : 0),
		0,
	)
	return (
		LAND_VALUE_YEARS *
		(occupiedOutput / output) *
		ECONOMY.revenue({ state, p: war.defender })
	)
}

function buyoff({ state, war }: BuyoffParams): number {
	if (
		war.goal !== "conquest" ||
		capitalHeld({ state, war }) ||
		STATE.occupiedLand({ state, war }).length === 0
	)
		return 0
	const threat = MILITARY.threat({
		state,
		attacker: war.attacker,
		defender: war.defender,
	})
	if (threat >= BUYOFF_THREAT) return 0
	const ask = (1 - threat) * landValue({ state, war })
	return ask > 0 && FIELDS.prov.treasury.get({ state, p: war.defender }) >= ask
		? ask
		: 0
}

// Offered at most once per war: the attacker keeps what it holds. It may offer
// when its advance stalls, or dictate once the score is high enough to make the
// defender pay. In a conquest war the terms follow the score: a losing defender
// also pays the indemnity, and an attacker with little to show pays it for the
// land.
function negotiate({ state, war, rng, stalled }: NegotiateParams): boolean {
	if (
		war.dealConsidered ||
		capitalHeld({ state, war }) ||
		STATE.occupiedLand({ state, war }).length === 0
	)
		return false
	const { score } = WAR_SCORE.current({ state, war })
	// A stalled attacker that is losing a conquest war hands the land back for
	// a white peace.
	if (
		stalled
			? score <= 0 && war.goal !== "conquest"
			: score < DEAL_DEFENDER_PAYS_SCORE
	)
		return false
	if (rng.random() >= DEAL_OFFER_CHANCE) return false
	war.dealConsidered = true
	return rng.random() < DEAL_ACCEPTANCE
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
	const total = reason === "enforced" || capitalHeld({ state, war })
	const { score } = WAR_SCORE.current({ state, war })
	const land = !total && score > 0 ? STATE.occupiedLand({ state, war }) : []
	if (war.goal === "throne") {
		if (total)
			return {
				...base,
				outcome: "regime change",
				winner: war.attacker,
				receiver: war.defender,
				transferred: STATE.getNationProvinces({ state, root: war.attacker }),
			}
		if (land.length > 0)
			return {
				...base,
				outcome: "cession",
				winner: war.attacker,
				transferred: land,
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
	if (total)
		return {
			...base,
			outcome: war.goal === "independence" ? "restoration" : "annexation",
			winner: war.attacker,
			transferred: STATE.getNationProvinces({ state, root: war.defender }),
		}
	if (land.length > 0)
		return {
			...base,
			outcome: war.goal === "independence" ? "independence" : "cession",
			winner: war.goal === "independence" ? war.defender : war.attacker,
			transferred: land,
			payer:
				reason !== "negotiated" || war.goal !== "conquest"
					? -1
					: score >= DEAL_DEFENDER_PAYS_SCORE
						? war.defender
						: score < DEAL_ATTACKER_PAYS_SCORE
							? war.attacker
							: -1,
		}
	if (war.goal === "independence")
		return { ...base, outcome: "independence", winner: war.defender }
	if (
		reason === "defended" ||
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
	SIEGE.end({ state, war, outcome: "lifted", reason: "war ended" })
	const score = WAR_SCORE.current({ state, war })
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
	if (result.outcome === "cession" && result.payer >= 0)
		state.indemnities.push({
			payer: result.payer,
			receiver: result.payer === war.defender ? war.attacker : war.defender,
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
	const parted =
		result.outcome !== "annexation" &&
		result.outcome !== "restoration" &&
		result.outcome !== "regime change" &&
		result.outcome !== "submission"
	const tookLand =
		parted &&
		result.transferred.length > 0 &&
		result.receiver === war.attacker &&
		STATE.isSovereign({ state, p: war.attacker }) &&
		STATE.isSovereign({ state, p: war.defender })
	const joined = tookLand
		? STATE.settleCutOff({
				state,
				nation: war.defender,
				other: war.attacker,
				rng,
			})
		: []
	if (parted && !tookLand)
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
			transferred: [...result.transferred, ...joined],
			joined: joined.length,
			reason,
			outcome: result.outcome,
			payment: result.payment,
			payer: result.payer,
			...score,
		},
	})
	return result
}

export const PEACE = {
	conclude: (params: ConcludeParams) =>
		MILITARY.mutate({ state: params.state, action: () => conclude(params) }),
	terms,
	buyoff,
	acceptBuyoff,
	negotiate,
	indemnityShare: INDEMNITY_SHARE,
	indemnityYears: INDEMNITY_YEARS,
}
