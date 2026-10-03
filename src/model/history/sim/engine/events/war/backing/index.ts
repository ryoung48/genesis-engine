import { ECONOMY } from "@/model/history/sim/engine/economy"
import { VASSALAGE } from "@/model/history/sim/engine/events/diplomacy/vassalage"
import { TRUCE } from "@/model/history/sim/engine/events/peace/truce"
import type {
	BackerCandidate,
	BackerEnemiesParams,
	RecruitParams,
	RepayParams,
} from "@/model/history/sim/engine/events/war/backing/types"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { MILITARY } from "@/model/history/sim/engine/military"
import { STATE } from "@/model/history/sim/engine/state"

const BACKING_CHANCE = 0.5
const BACKING_DECAY = 0.5

function enemies({ state, war }: BackerEnemiesParams): BackerCandidate[] {
	const { crown } = STATE.warSides({ war })
	const overlord = STATE.diplomaticOverlord({ state, nation: crown })
	const candidates = new Map<number, BackerCandidate>()
	if (
		war.goal === "throne" &&
		overlord >= 0 &&
		(STATE.getDisposition({ state, a: crown, b: overlord }) ===
			STATE.disp.SUSPICIOUS ||
			STATE.getDisposition({ state, a: crown, b: overlord }) ===
				STATE.disp.RIVAL)
	)
		candidates.set(overlord, {
			nation: overlord,
			via: "overlord",
			enemyOf: crown,
		})
	for (const [enemyOf, via] of [
		[crown, "crown"],
		[overlord, "overlord"],
	] as const) {
		if (enemyOf < 0) continue
		for (const nation of state.relationColumns[enemyOf])
			if (
				STATE.getDisposition({ state, a: nation, b: enemyOf }) ===
				STATE.disp.RIVAL
			)
				if (!candidates.has(nation))
					candidates.set(nation, { nation, via, enemyOf })
		for (const id of state.activeWarIds) {
			const other = state.wars[id]
			if (other === war || other.endTime !== undefined) continue
			if (other.attacker === enemyOf)
				if (!candidates.has(other.defender))
					candidates.set(other.defender, {
						nation: other.defender,
						via,
						enemyOf,
					})
			if (other.defender === enemyOf)
				if (!candidates.has(other.attacker))
					candidates.set(other.attacker, {
						nation: other.attacker,
						via,
						enemyOf,
					})
		}
	}
	return [...candidates.values()]
}

function recruit({ state, war, rng }: RecruitParams): void {
	const { rebels, crown } = STATE.warSides({ war })
	if (rebels < 0) return
	let chance = BACKING_CHANCE
	const candidates = enemies({ state, war })
	const first = candidates.find(
		(candidate) =>
			candidate.nation === STATE.diplomaticOverlord({ state, nation: crown }),
	)
	const shuffled = rng.shuffle(
		candidates
			.filter((candidate) => candidate !== first)
			.sort((a, b) => a.nation - b.nation),
	)
	for (const candidate of first ? [first, ...shuffled] : shuffled) {
		const { nation, via, enemyOf } = candidate
		const disloyalVassal =
			STATE.diplomaticOverlord({ state, nation }) === crown &&
			STATE.getDisposition({ state, a: nation, b: crown }) === STATE.disp.RIVAL
		const disloyalOverlord =
			nation === STATE.diplomaticOverlord({ state, nation: crown }) &&
			war.goal === "throne" &&
			(STATE.getDisposition({ state, a: nation, b: crown }) ===
				STATE.disp.SUSPICIOUS ||
				STATE.getDisposition({ state, a: nation, b: crown }) ===
					STATE.disp.RIVAL)
		if (
			nation === rebels ||
			nation === crown ||
			!STATE.isSovereign({ state, p: nation }) ||
			(STATE.getRulerRelation({ state, nation }) && !disloyalVassal) ||
			MILITARY.exhausted({ state, nation }) ||
			FIELDS.prov.treasury.get({ state, p: nation }) < 0 ||
			TRUCE.active({ state, a: nation, b: enemyOf })
		)
			continue
		const tie = STATE.getRelation({ state, a: nation, b: crown })
		if (
			tie === STATE.rel.ALLY ||
			(tie === STATE.rel.VASSAL && !disloyalOverlord) ||
			(tie === STATE.rel.OVERLORD && !disloyalVassal) ||
			tie === STATE.rel.PU_SENIOR ||
			tie === STATE.rel.PU_JUNIOR ||
			tie === STATE.rel.COLONY ||
			STATE.getRelation({ state, a: nation, b: rebels }) === STATE.rel.WAR ||
			[...state.activeWarIds].some((id) => {
				const other = state.wars[id]
				return (
					other !== war &&
					((other.attacker === nation && other.defender === rebels) ||
						(other.defender === nation && other.attacker === rebels))
				)
			})
		)
			continue
		if (rng.random() >= chance) continue
		war.backers.push(nation)
		state.militaryDiplomacyDirty = true
		chance *= BACKING_DECAY
		state.events.push({
			tag: "rebels backed",
			time: state.time,
			data: { war: war.idx, backer: nation, rebels, crown, via },
		})
	}
}

function repay({ state, war, outcome }: RepayParams): void {
	const { rebels, crown } = STATE.warSides({ war })
	const nation =
		outcome === "regime change"
			? crown
			: outcome === "independence" || outcome === "cession"
				? rebels
				: -1
	if (nation < 0 || !STATE.isSovereign({ state, p: nation })) return
	for (const backer of [...war.backers].sort(
		(a, b) =>
			ECONOMY.revenue({ state, p: b }) - ECONOMY.revenue({ state, p: a }),
	)) {
		if (
			!STATE.isSovereign({ state, p: backer }) ||
			STATE.getRelation({ state, a: nation, b: backer }) === STATE.rel.WAR
		)
			continue
		const existing = STATE.getRelation({ state, a: nation, b: backer })
		if (existing === STATE.rel.VASSAL || existing === STATE.rel.OVERLORD) {
			STATE.setDisposition({
				state,
				a: nation,
				b: backer,
				disposition: STATE.disp.TRUSTED,
			})
			state.events.push({
				tag: "backing repaid",
				time: state.time,
				data: { war: war.idx, backer, nation, pact: "disposition" },
			})
			continue
		}
		let pact: "vassal" | "alliance" | "trusted" = "trusted"
		const pair = VASSALAGE.pair({ state, a: nation, b: backer })
		if (
			pair?.vassal === nation &&
			VASSALAGE.bind({ state, ...pair, cause: "backing" })
		) {
			pact = "vassal"
			STATE.setDisposition({
				state,
				a: nation,
				b: backer,
				disposition: STATE.disp.TRUSTED,
			})
		} else if (STATE.canAlly({ state, a: nation, b: backer })) {
			STATE.setRelation({ state, a: nation, b: backer, rel: STATE.rel.ALLY })
			STATE.setDisposition({
				state,
				a: nation,
				b: backer,
				disposition: STATE.disp.TRUSTED,
			})
			pact = "alliance"
		} else
			STATE.setDisposition({
				state,
				a: nation,
				b: backer,
				disposition: STATE.disp.TRUSTED,
			})
		state.events.push({
			tag: "backing repaid",
			time: state.time,
			data: { war: war.idx, backer, nation, pact },
		})
	}
}

export const BACKING = {
	recruit: (params: RecruitParams) =>
		MILITARY.mutate({ state: params.state, action: () => recruit(params) }),
	repay,
}
