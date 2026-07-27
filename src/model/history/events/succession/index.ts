import { EVENT_HEAP } from "@/model/history/event-heap"
import type {
	ClaimParams,
	InitSuccessionParams,
	RegencyParams,
	RunSuccessionParams,
} from "@/model/history/events/succession/types"
import { FIELDS } from "@/model/history/fields"
import { STATE } from "@/model/history/state"
import type { HistoryState } from "@/model/history/state/types"

function initSuccession({ state }: InitSuccessionParams): void {
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		if (!STATE.isSovereign({ state, p })) continue
		// Schedule succession at leader's death
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

	FIELDS.prov.leader.claim.set({ state, p, time: state.time, value: claimRoll })

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
				time: state.time,
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
			time: state.time,
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
	// Check if this is still the current leader
	if (state.leaderRuntime.idx[province] !== leaderIdx) return
	// Belt-and-suspenders: only sovereign provinces have leaders
	if (!STATE.isSovereign({ state, p: province })) return

	// Spawn new leader
	STATE.spawnLeader({ state, p: province, rng })

	state.events.push({
		tag: "succession",
		time: state.time,
		data: {
			nation: province,
			leader: leaderIdx,
			successor: state.leaderRuntime.idx[province],
		},
	})

	// Schedule next succession
	state.heap.enqueue(
		state.leaderRuntime.end[province],
		EVENT_HEAP.evt.SUCCESSION,
		province,
		state.leaderRuntime.idx[province],
	)

	// Regency check
	regency({ state, p: province })

	// Compute claim and handle PU formation
	claim({ state, p: province, rng })

	// Random subject rebellions during succession
	const overlord = FIELDS.prov.parent.get({ state, p: province })
	if (overlord < 0 && STATE.getChildren({ state, p: province }).length > 0) {
		const subjects = rng
			.shuffle(STATE.getChildren({ state, p: province }))
			.filter((s: number) => {
				const provinces = STATE.getNationProvinces({ state, root: s })
				return !provinces.some((q) => state.occupationCurrent[q] >= 0)
			})

		const rebellionChance = 0.5
		let rebelCount = 0
		while (rebelCount < subjects.length && rng.random() < rebellionChance) {
			const subject = subjects[rebelCount]
			rebelCount++
			if (FIELDS.prov.parent.get({ state, p: subject }) !== province) continue
			STATE.releaseProvince({ state, p: subject, rng })
			state.events.push({
				tag: "rebellion",
				time: state.time,
				data: { overlord: province, subject, succession: true },
			})
		}

		// Fix disconnected vassals
		STATE.fixConnections({ state, nation: province, rng })
	}
}

export const SUCCESSION = {
	initSuccession,
	runSuccession,
}
