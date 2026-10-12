import { ECONOMY } from "@/model/history/sim/engine/economy"
import { EVENT_HEAP } from "@/model/history/sim/engine/event-heap"
import { DISPOSITION } from "@/model/history/sim/engine/events/diplomacy/disposition"
import { DIPLOMATIC_FORMATION } from "@/model/history/sim/engine/events/diplomacy/formation"
import { ROYAL_MARRIAGE } from "@/model/history/sim/engine/events/diplomacy/marriage"
import type {
	CanBeRivalsParams,
	InitDiplomacyParams,
	NextEventParams,
	ProcessVassalDiplomacyParams,
	RunDiplomacyParams,
	SeedInitialVassalsParams,
	SeedNeighborRelationsParams,
	SyncVassalRelationsParams,
} from "@/model/history/sim/engine/events/diplomacy/types"
import { VASSALAGE } from "@/model/history/sim/engine/events/diplomacy/vassalage"
import { WAR } from "@/model/history/sim/engine/events/war"
import { MILITARY } from "@/model/history/sim/engine/military"
import { STATE } from "@/model/history/sim/engine/state"

// More independent partners offset the shared half scale. The first final
// report averaged 154.7 alliances against 230.2 before; halve ordinary pact
// formation again to bring standing alliances nearer half as well.
const PACT_CHANCE = DIPLOMATIC_FORMATION.chance({ base: 0.03 }) * 0.5
// Calibrated against the 100-year half-formation report: more free realms
// offset a simple half chance, so init needs a lower alliance roll.
const INITIAL_ALLIANCE_CHANCE = 0.18
const INITIAL_OVERLORD_CHANCE = 0.4
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
				STATE.canAlly({ state, a: nation, b: neighbor }) &&
				rng.random() < INITIAL_ALLIANCE_CHANCE
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
	const allowedOverlords = new Map<number, boolean>()
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
			if (!allowedOverlords.has(neighbor))
				allowedOverlords.set(neighbor, rng.random() < INITIAL_OVERLORD_CHANCE)
			if (!allowedOverlords.get(neighbor)) continue
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
			tie === STATE.rel.ALLY &&
			ROYAL_MARRIAGE.bound({ state, a: nation, b: other })
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
