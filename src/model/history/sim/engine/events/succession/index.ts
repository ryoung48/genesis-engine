import { EVENT_HEAP } from "@/model/history/sim/engine/event-heap"
import { DIVISION } from "@/model/history/sim/engine/events/succession/division"
import type {
	ClaimParams,
	InitSuccessionParams,
	RegencyParams,
	RunSuccessionParams,
} from "@/model/history/sim/engine/events/succession/types"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import { HEIRS } from "@/model/history/sim/heirs"
import { NO_HEIR, UNNAMED } from "@/model/history/sim/heirs/types"
import { RULER } from "@/model/history/sim/ruler"
import { SUCCESSION_LAW } from "@/model/history/sim/succession-law"
import { DEJURE } from "@/model/society/dejure"

function initSuccession({ state }: InitSuccessionParams): void {
	if (state.people) return
	const rulers = new Set<number>()
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		if (STATE.isSovereign({ state, p })) rulers.add(p)
	}
	for (let title = 0; title < state.titles.count; title++)
		if (state.titles.holder[title] >= 0) rulers.add(state.titles.holder[title])
	for (const p of rulers) {
		if (state.leaderNameSeedCurrent[p] < 0) continue
		state.heap.enqueue(
			state.leaderRuntime.end[p],
			EVENT_HEAP.evt.SUCCESSION,
			p,
			state.leaderRuntime.idx[p],
		)
	}
}

function recordDynastySpread(params: {
	state: HistoryState
	nation: number
	source: number
	dynasty: number
	previousDynasty?: number
}): void {
	const { state, nation, source, dynasty, previousDynasty } = params
	if (!STATE.isSovereign({ state, p: nation })) return
	state.events.push({
		tag: "dynasty spread",
		time: state.time,
		data: {
			nation,
			source,
			dynasty,
			previousDynasty,
		},
	})
}

function claim({ state, p, rng }: ClaimParams): void {
	const dynasty = FIELDS.prov.leader.dynasty.get({ state, p })

	const claimRoll =
		rng.weightedChoice([
			{ v: 0 as const, w: 1 }, // none
			{ v: 1 as const, w: 1 }, // weak
			{ v: 2 as const, w: 1 }, // average
			{ v: 3 as const, w: 2 }, // strong
		]) ?? 2

	FIELDS.prov.leader.claim.set({ state, p, value: claimRoll })

	if (claimRoll <= 1) {
		// Look only at neighboring sovereign nations filtered by diplomatic relation
		const candidates = STATE.getNationNeighbors({ state, nation: p }).filter(
			(n) => {
				const rel = STATE.getRelation({ state, a: p, b: n })
				return (
					rel === STATE.rel.FRIENDLY ||
					rel === STATE.rel.ALLY ||
					rel === STATE.rel.OVERLORD ||
					rel === STATE.rel.NEUTRAL
				)
			},
		)

		if (candidates.length === 0) {
			// No qualifying neighbor → new dynasty
			FIELDS.prov.leader.dynasty.set({
				state,
				p,
				value: state.nextDynasty++,
			})
			return
		}

		// Sort by wealth, take the wealthiest neighbor
		candidates.sort(
			(a, b) =>
				STATE.wealthOptimal({ state, p: b }) -
				STATE.wealthOptimal({ state, p: a }),
		)
		const senior = candidates[0]
		const seniorDynasty = FIELDS.prov.leader.dynasty.get({ state, p: senior })

		// Personal union if same dynasty, different sovereign
		if (seniorDynasty === dynasty) {
			STATE.setRelation({ state, a: p, b: senior, rel: STATE.rel.PU_JUNIOR })
			state.events.push({
				tag: "personal union formed",
				time: state.time,
				data: { junior: p, senior },
			})
			return
		}

		// Spread dynasty
		const previousDynasty = dynasty
		FIELDS.prov.leader.dynasty.set({
			state,
			p,
			value: seniorDynasty,
		})
		recordDynastySpread({
			state,
			nation: p,
			source: senior,
			dynasty: seniorDynasty,
			previousDynasty,
		})
	}
}

function regency({ state, p }: RegencyParams): void {
	const age = STATE.diffYears({
		a: state.time,
		b: state.leaderRuntime.birth[p],
	})
	if (age < 16 && STATE.isSovereign({ state, p })) {
		state.events.push({
			tag: "regency started",
			time: state.time,
			data: {
				nation: p,
				leader: state.leaderRuntime.idx[p],
				age: Math.round(age),
			},
		})
		const regencyEndTime = state.leaderRuntime.birth[p] + STATE.deltaYear(16)
		if (regencyEndTime < state.leaderRuntime.end[p]) {
			state.heap.enqueue(
				regencyEndTime,
				EVENT_HEAP.evt.REGENCY,
				p,
				state.leaderRuntime.idx[p],
			)
		}
	}
}

function runSuccession({
	state,
	province,
	leaderIdx,
	rng,
}: RunSuccessionParams): void {
	if (state.leaderRuntime.idx[province] !== leaderIdx) return
	const sovereign = STATE.isSovereign({ state, p: province })
	const realm = state.sovereignCurrent[province]
	if (!sovereign && !state.titles.holder.includes(province)) return
	const dynasty = state.leaderDynCurrent[province]
	const dyingPerson = state.people?.holderOfSeat[province] ?? -1
	const law = SUCCESSION_LAW.lawOf({ state, nation: realm })
	const heirs = HEIRS.of({ state, dying: province, law, rng })
	if (heirs.primary === NO_HEIR && !sovereign) {
		const liege = state.parentCurrent[province]
		if (liege < 0) throw new Error("Vassal without a liege")
		RULER.vacate({ state, seat: province })
		for (let title = 0; title < state.titles.count; title++) {
			if (state.titles.holder[title] !== province) continue
			state.titles.holder[title] = liege
			state.events.push({
				tag: "title passed",
				time: state.time,
				data: { title, from: province, to: liege, cause: "escheat" },
			})
		}
	} else {
		RULER.install({
			state,
			seat: province,
			heir: heirs.primary === NO_HEIR ? UNNAMED : heirs.primary,
			dynasty: heirs.primary === NO_HEIR ? state.nextDynasty++ : dynasty,
			rng,
			initial: false,
		})
		state.events.push({
			tag: sovereign ? "succession" : "ruler succession",
			time: state.time,
			data: {
				nation: province,
				leader: leaderIdx,
				successor: state.leaderRuntime.idx[province],
			},
		})
		regency({ state, p: province })
		if (heirs.primary === NO_HEIR)
			FIELDS.prov.leader.claim.set({ state, p: province, value: 1 })
		else {
			if (state.people) {
				const child =
					state.people.persons.father[heirs.primary] === dyingPerson ||
					state.people.persons.mother[heirs.primary] === dyingPerson
				FIELDS.prov.leader.claim.set({
					state,
					p: province,
					value: child ? 3 : 2,
				})
			} else if (sovereign) claim({ state, p: province, rng })
			DIVISION.divide({
				state,
				dying: province,
				juniors: heirs.juniors,
				law,
				rng,
			})
		}
	}
	state.seatRank = DEJURE.seatRank({
		titles: state.titles,
		provinceCount: state.P,
		heldOnly: true,
		ownerOf: state.sovereignCurrent,
	})
	STATE.applyDerivedParents({
		state,
		nation: realm,
		members: STATE.getNationProvinces({ state, root: realm }),
	})
	STATE.considerTitles({ state, nation: realm, rng })
}

export const SUCCESSION = {
	initSuccession,
	runSuccession,
}
