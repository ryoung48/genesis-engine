import { ECONOMY } from "@/model/history/sim/engine/economy"
import { EVENT_HEAP } from "@/model/history/sim/engine/event-heap"
import { DISPOSITION } from "@/model/history/sim/engine/events/diplomacy/disposition"
import type {
	CanBeRivalsParams,
	InitDiplomacyParams,
	MarriageBoundParams,
	NextEventParams,
	ProcessVassalDiplomacyParams,
	RunDiplomacyParams,
	SeedInitialVassalsParams,
	SeedNeighborRelationsParams,
	SyncVassalRelationsParams,
} from "@/model/history/sim/engine/events/diplomacy/types"
import { VASSALAGE } from "@/model/history/sim/engine/events/diplomacy/vassalage"
import { REGENCY } from "@/model/history/sim/engine/events/succession/regency"
import { WAR } from "@/model/history/sim/engine/events/war"
import { MILITARY } from "@/model/history/sim/engine/military"
import { STATE } from "@/model/history/sim/engine/state"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { PEOPLE } from "@/model/history/sim/people"

const PACT_CHANCE = 0.03
const DISSOLVE_CHANCE = {
	TRUSTED: 0,
	FRIENDLY: 0.1,
	NEUTRAL: 0.35,
	SUSPICIOUS: 0.7,
	RIVAL: 1,
} as const

function canBeRivals({ state, a, b }: CanBeRivalsParams): boolean {
	const aR = ECONOMY.revenue({ state, p: a })
	const bR = ECONOMY.revenue({ state, p: b })
	const ratio = Math.min(aR, bR) / Math.max(aR, bR)
	return ratio >= 0.8
}

function syncVassalRelations({
	state,
	vassal,
	overlord,
}: SyncVassalRelationsParams): void {
	const vassalNeighbors = STATE.getNationNeighbors({ state, nation: vassal })
	for (const nb of vassalNeighbors) {
		if (nb === overlord) continue
		const vassalRel = STATE.getRelation({ state, a: vassal, b: nb })
		if (
			vassalRel === STATE.rel.VASSAL ||
			vassalRel === STATE.rel.OVERLORD ||
			vassalRel === STATE.rel.PU_SENIOR ||
			vassalRel === STATE.rel.PU_JUNIOR ||
			vassalRel === STATE.rel.COLONY
		)
			continue

		const overlordRel = STATE.getDisposition({ state, a: overlord, b: nb })
		if (
			overlordRel === STATE.disp.SUSPICIOUS ||
			STATE.getRelation({ state, a: overlord, b: nb }) === STATE.rel.WAR ||
			overlordRel === STATE.disp.RIVAL
		) {
			const current = STATE.getDisposition({ state, a: vassal, b: nb })
			if (current !== STATE.disp.RIVAL)
				DISPOSITION.set({
					state,
					a: vassal,
					b: nb,
					value: STATE.disp.SUSPICIOUS,
					cause: "vassal sync",
				})
		}
	}
}

function processVassalDiplomacy({
	state,
	vassal,
	overlord,
	rng,
}: ProcessVassalDiplomacyParams): void {
	syncVassalRelations({ state, vassal, overlord })

	const threat = MILITARY.threat({
		state,
		attacker: overlord,
		defender: vassal,
	})
	if (!VASSALAGE.breaks({ state, vassal, overlord, threat })) return

	// Break vassalage
	VASSALAGE.release({ state, vassal, overlord, cause: "diplomacy" })

	// Probabilistic counter-war
	const counterWarChance = 0.7 * (1 - threat)
	if (rng.random() < counterWarChance) {
		WAR.start({
			state,
			attacker: overlord,
			defender: vassal,
			rng,
			goal: "conquest",
		})
	}
}

// An alliance holds while the two ruling families stay joined by a living
// marriage, or while one realm's regent parent was born into the other's
// ruling house.
function marriageBound({ state, a, b }: MarriageBoundParams): boolean {
	const people = state.people
	const rulerA = people.rulerOf[a]
	const rulerB = people.rulerOf[b]
	return (
		rulerA >= 0 &&
		rulerB >= 0 &&
		GOVERNMENT.marriageAlliancesOfIndex(state.governmentType[a]) &&
		GOVERNMENT.marriageAlliancesOfIndex(state.governmentType[b]) &&
		(PEOPLE.tiedByMarriage({
			people,
			a: rulerA,
			b: rulerB,
			time: state.time / STATE.yearMs,
		}) ||
			REGENCY.bindsTo({ state, realm: a, other: b }) ||
			REGENCY.bindsTo({ state, realm: b, other: a }))
	)
}

function nextEvent({ state, province, rng, years }: NextEventParams): void {
	state.heap.enqueue(
		state.time + STATE.deltaYear(years ?? rng.uniform(8, 15)),
		EVENT_HEAP.evt.DIPLOMACY,
		province,
		0,
		0,
		0,
		state.time,
	)
}

function seedNeighborRelations({
	state,
	rng,
}: SeedNeighborRelationsParams): void {
	for (let nation = 0; nation < state.P; nation++) {
		if (state.desolate[nation] || !STATE.isSovereign({ state, p: nation }))
			continue
		for (const neighbor of STATE.getNationNeighbors({ state, nation })) {
			if (
				neighbor <= nation ||
				state.desolate[neighbor] ||
				!STATE.isSovereign({ state, p: neighbor })
			) {
				continue
			}
			// Don't overwrite colony-colonizer relations seeded by createHistoryState.
			const existing = STATE.getRelation({ state, a: nation, b: neighbor })
			if (existing === STATE.rel.COLONY || existing === STATE.rel.OVERLORD)
				continue
			let disposition = DISPOSITION.seed({ rng })
			if (
				disposition === STATE.disp.RIVAL &&
				!canBeRivals({ state, a: nation, b: neighbor })
			)
				disposition = STATE.disp.SUSPICIOUS
			DISPOSITION.set({
				state,
				a: nation,
				b: neighbor,
				value: disposition,
				cause: "seed",
			})
			if (
				disposition === STATE.disp.TRUSTED &&
				STATE.canAlly({ state, a: nation, b: neighbor })
			)
				STATE.setRelation({
					state,
					a: nation,
					b: neighbor,
					rel: STATE.rel.ALLY,
				})
		}
	}
}

const VASSAL_SEED_CHANCE = 0.4

const VASSAL_SEED_RATIO = 0.3

function seedInitialVassals({ state, rng }: SeedInitialVassalsParams): void {
	for (let nation = 0; nation < state.P; nation++) {
		if (state.desolate[nation] || !STATE.isSovereign({ state, p: nation }))
			continue
		if (STATE.getRulerRelation({ state, nation })) continue
		for (const neighbor of STATE.getNationNeighbors({ state, nation })) {
			if (
				state.desolate[neighbor] ||
				!STATE.isSovereign({ state, p: neighbor })
			)
				continue
			if (
				STATE.getRelation({ state, a: nation, b: neighbor }) ===
				STATE.rel.COLONY
			)
				continue
			if (
				STATE.getRelation({ state, a: nation, b: neighbor }) ===
				STATE.rel.OVERLORD
			)
				continue
			if (STATE.getRulerRelation({ state, nation: neighbor })) continue
			const aR = ECONOMY.revenue({ state, p: nation })
			const bR = ECONOMY.revenue({ state, p: neighbor })
			const ratio = aR / Math.max(1, bR)
			if (ratio >= VASSAL_SEED_RATIO) continue
			if (rng.random() >= VASSAL_SEED_CHANCE) continue
			VASSALAGE.bind({
				state,
				vassal: nation,
				overlord: neighbor,
				cause: "seed",
			})
			break
		}
	}
}

function initDiplomacy({ state, rng }: InitDiplomacyParams): void {
	seedNeighborRelations({ state, rng })
	seedInitialVassals({ state, rng })
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		nextEvent({ state, province: p, rng, years: rng.uniform(0, 8) })
	}
}

function runDiplomacy({ state, nation, rng }: RunDiplomacyParams): void {
	if (!STATE.isSovereign({ state, p: nation })) {
		nextEvent({ state, province: nation, rng })
		return
	}
	const neighborSet = new Set(STATE.getNationNeighbors({ state, nation }))
	const partners = [...state.relationColumns[nation]]
	for (const other of partners) {
		if (other === nation || neighborSet.has(other)) continue
		if (STATE.getRelation({ state, a: nation, b: other }) === STATE.rel.NONE)
			DISPOSITION.set({
				state,
				a: nation,
				b: other,
				value: STATE.disp.NEUTRAL,
				cause: "distant",
			})
	}
	const candidates = [...new Set([...neighborSet, ...partners])].sort(
		(a, b) => a - b,
	)
	for (const other of candidates) {
		if (
			other === nation ||
			state.desolate[other] ||
			!STATE.isSovereign({ state, p: other })
		)
			continue
		const tie = STATE.getRelation({ state, a: nation, b: other })
		if (tie === STATE.rel.WAR) continue
		if (tie === STATE.rel.NONE && !neighborSet.has(other)) continue
		const current = STATE.getDisposition({ state, a: nation, b: other })
		const bound =
			tie === STATE.rel.ALLY && marriageBound({ state, a: nation, b: other })
		let formedVassal = false
		if (
			tie === STATE.rel.NONE &&
			neighborSet.has(other) &&
			current === STATE.disp.TRUSTED &&
			rng.random() < PACT_CHANCE
		) {
			const pair = VASSALAGE.pair({ state, a: nation, b: other })
			if (pair)
				formedVassal = VASSALAGE.bind({ state, ...pair, cause: "diplomacy" })
			if (!formedVassal && STATE.canAlly({ state, a: nation, b: other }))
				STATE.setRelation({ state, a: nation, b: other, rel: STATE.rel.ALLY })
		}
		if (
			tie === STATE.rel.ALLY &&
			!bound &&
			rng.random() < DISSOLVE_CHANCE[current]
		)
			STATE.setRelation({ state, a: nation, b: other, rel: STATE.rel.NONE })
		DISPOSITION.drift({ state, a: nation, b: other, rng, bound })
		if (
			STATE.getRelation({ state, a: nation, b: other }) === STATE.rel.NONE &&
			STATE.getDisposition({ state, a: nation, b: other }) ===
				STATE.disp.RIVAL &&
			!canBeRivals({ state, a: nation, b: other })
		)
			DISPOSITION.set({
				state,
				a: nation,
				b: other,
				value: STATE.disp.SUSPICIOUS,
				cause: "size gate",
			})
		if (tie === STATE.rel.VASSAL && !formedVassal)
			processVassalDiplomacy({ state, vassal: other, overlord: nation, rng })
	}

	nextEvent({ state, province: nation, rng })
}

export const DIPLOMACY = {
	initDiplomacy,
	runDiplomacy,
}
