/**
 * SUCCESSION EVENT — leader death, new ruler, dynasties, regency, vassal rebellions.
 * Port of src/model/history/events/succession.ts
 */

import { EVT } from "../event-heap"
import { PROV } from "../fields"
import type { HistoryRng } from "../history-rng"
import {
	deltaYear,
	diffYears,
	fixConnections,
	getChildren,
	getNationNeighbors,
	getNationProvinces,
	getRelation,
	type HistoryState,
	isSovereign,
	REL,
	releaseProvince,
	setRelation,
	spawnLeader,
	wealthOptimal,
} from "../state"

export function initSuccession(state: HistoryState, _rng: HistoryRng): void {
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		// Schedule succession at leader's death
		state.heap.enqueue(
			state.leaderRuntime.end[p],
			EVT.SUCCESSION,
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
	if (!isSovereign(state, nation)) return
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

function claim(state: HistoryState, p: number, rng: HistoryRng): void {
	const nation = getSovereign(state, p) ?? p
	const dynasty = PROV.leader.dynasty.get(state, p)

	// Count provinces in the same nation with matching dynasty
	const provinces = getNationProvinces(state, nation)
	const sameCount = provinces.filter(
		(q) => q !== p && PROV.leader.dynasty.get(state, q) === dynasty,
	).length

	const claimRoll =
		rng.weightedChoice([
			{ v: 0 as const, w: sameCount > 0 ? 0 : 1 }, // none
			{ v: 1 as const, w: 1 }, // weak
			{ v: 2 as const, w: 1 }, // average
			{ v: 3 as const, w: 2 }, // strong
		]) ?? 2

	PROV.leader.claim.set(state, p, state.time, claimRoll)

	if (claimRoll <= 1) {
		// Weak or no claim — look for senior candidates
		const sov = isSovereign(state, p)

		// Gather candidate sources
		const foreign = sov
			? getNationNeighbors(state, nation).filter((n) => {
					const rel = getRelation(state, nation, n)
					return (
						rel === REL.FRIENDLY || rel === REL.ALLY || rel === REL.OVERLORD
					)
				})
			: []

		const parentP = PROV.parent.get(state, p)
		const siblings =
			parentP >= 0 ? getChildren(state, parentP).filter((c) => c !== p) : []
		const children = getChildren(state, p)
		const candidates = [
			...foreign,
			...(parentP >= 0 ? [parentP] : []),
			...siblings,
			...children,
		]

		if (candidates.length === 0) {
			// No heir → new dynasty
			PROV.leader.dynasty.set(state, p, state.time, state.nextDynasty++)
			return
		}

		// Sort by wealth, take the senior
		candidates.sort((a, b) => wealthOptimal(state, b) - wealthOptimal(state, a))
		const senior = candidates[0]
		const seniorDynasty = PROV.leader.dynasty.get(state, senior)

		// Form personal union if same dynasty, different nation
		if (seniorDynasty === dynasty && getSovereign(state, senior) !== nation) {
			setRelation(state, p, senior, REL.PU_JUNIOR)
			state.events.push({
				tag: "personal union formed",
				time: state.time,
				data: { junior: p, senior },
			})
			return
		}

		// Spread dynasty with small chance of random new noble
		const adoptedDynasty =
			claimRoll === 0 && !sov && rng.random() > 0.95
				? state.nextDynasty++
				: seniorDynasty
		PROV.leader.dynasty.set(state, p, state.time, adoptedDynasty)
		if (adoptedDynasty === seniorDynasty && adoptedDynasty !== dynasty) {
			recordDynastySpread({
				state,
				nation: p,
				source: senior,
				dynasty: adoptedDynasty,
				previousDynasty: dynasty,
			})
		}
	}
}

function regency(state: HistoryState, p: number): void {
	const age = diffYears(state.time, state.leaderRuntime.birth[p])
	if (age < 16 && isSovereign(state, p)) {
		state.events.push({
			tag: "regency started",
			time: state.time,
			data: {
				nation: p,
				leader: state.leaderRuntime.idx[p],
				age: Math.round(age),
			},
		})
		const regencyEndTime = state.leaderRuntime.birth[p] + deltaYear(16)
		if (regencyEndTime < state.leaderRuntime.end[p]) {
			state.heap.enqueue(
				regencyEndTime,
				EVT.REGENCY,
				p,
				state.leaderRuntime.idx[p],
			)
		}
	}
}

function getSovereign(state: HistoryState, p: number): number {
	return getNationProvinces(state, p)[0] ?? p
}

export function runSuccession(
	state: HistoryState,
	province: number,
	leaderIdx: number,
	rng: HistoryRng,
): void {
	// Check if this is still the current leader
	if (state.leaderRuntime.idx[province] !== leaderIdx) return

	// Spawn new leader
	spawnLeader(state, province, rng)

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
		EVT.SUCCESSION,
		province,
		state.leaderRuntime.idx[province],
	)

	// Regency check
	regency(state, province)

	// Compute claim and handle PU formation
	claim(state, province, rng)

	// Random subject rebellions during succession
	const overlord = PROV.parent.get(state, province)
	if (overlord < 0 && getChildren(state, province).length > 0) {
		const subjects = rng.shuffle(getChildren(state, province)).filter((s) => {
			const provinces = getNationProvinces(state, s)
			return !provinces.some((q) => state.occupationCurrent[q] >= 0)
		})

		const rebellionChance = 0.5
		let rebelCount = 0
		while (rebelCount < subjects.length && rng.random() < rebellionChance) {
			const subject = subjects[rebelCount]
			rebelCount++
			if (PROV.parent.get(state, subject) !== province) continue
			releaseProvince(state, subject)
			state.events.push({
				tag: "rebellion",
				time: state.time,
				data: { overlord: province, subject, succession: true },
			})
		}

		// Fix disconnected vassals
		fixConnections(state, province)
	}
}
