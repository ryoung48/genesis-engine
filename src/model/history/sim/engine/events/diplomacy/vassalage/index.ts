import { ECONOMY } from "@/model/history/sim/engine/economy"
import type {
	AnswersParams,
	BreaksParams,
	VassalBondParams,
	VassalLinkParams,
	VassalPair,
	VassalPairParams,
} from "@/model/history/sim/engine/events/diplomacy/vassalage/types"
import { STATE } from "@/model/history/sim/engine/state"

function pair({ state, a, b }: VassalPairParams): VassalPair | null {
	const aR = ECONOMY.revenue({ state, p: a })
	const bR = ECONOMY.revenue({ state, p: b })
	const ratio = Math.min(aR, bR) / Math.max(aR, bR)
	if (ratio >= 0.5) return null
	return aR <= bR ? { vassal: a, overlord: b } : { vassal: b, overlord: a }
}

function bind({ state, vassal, overlord, cause }: VassalBondParams): boolean {
	if (
		STATE.getRulerRelation({ state, nation: vassal }) ||
		STATE.getRulerRelation({ state, nation: overlord })
	)
		return false
	STATE.setRelation({ state, a: vassal, b: overlord, rel: STATE.rel.VASSAL })
	if (cause !== "seed")
		state.events.push({
			tag: "vassalized",
			time: state.time,
			data:
				cause === "backing"
					? { vassal, overlord, cause }
					: { vassal, overlord },
		})
	return true
}

function release({ state, vassal, overlord, cause }: VassalBondParams): void {
	const disposition = STATE.getDisposition({ state, a: vassal, b: overlord })
	STATE.setRelation({ state, a: vassal, b: overlord, rel: STATE.rel.NONE })
	STATE.setDisposition({
		state,
		a: vassal,
		b: overlord,
		disposition: STATE.disp.SUSPICIOUS,
	})
	state.events.push({
		tag: "vassalage ended",
		time: state.time,
		data: { vassal, overlord, cause, disposition },
	})
}

function breaks({ state, vassal, overlord, threat }: BreaksParams): boolean {
	const threshold = {
		TRUSTED: 0.995,
		FRIENDLY: 0.97,
		NEUTRAL: 0.7,
		SUSPICIOUS: 0.4,
		RIVAL: 0.05,
	}[STATE.getDisposition({ state, a: vassal, b: overlord })]
	return threat > threshold
}

function answers({
	state,
	vassal,
	overlord,
	attacking,
}: AnswersParams): boolean {
	const disposition = STATE.getDisposition({ state, a: vassal, b: overlord })
	return (
		disposition !== STATE.disp.RIVAL &&
		!(attacking && disposition === STATE.disp.SUSPICIOUS)
	)
}

function pays({ state, vassal, overlord }: VassalLinkParams): boolean {
	return (
		STATE.getDisposition({ state, a: vassal, b: overlord }) !== STATE.disp.RIVAL
	)
}

export const VASSALAGE = { pair, bind, release, breaks, answers, pays }
