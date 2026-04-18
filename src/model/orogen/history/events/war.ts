/**
 * WAR EVENT — evaluates whether a nation should start a war.
 * Port of src/model/history/events/war.ts
 */

import { provinceWars } from "../derive"
import { PROV } from "../fields"
import { EVT } from "../heap"
import type { HistoryRng } from "../rng"
import {
	deltaYear,
	fixConnections,
	getNationNeighbors,
	getRelation,
	getRulerRelation,
	getSovereign,
	type HistoryState,
	provinceDistanceSq,
	REL,
	type Relation,
	releaseProvince,
	startWar,
	warThreat,
} from "../state"

/** Relation-based threshold for attack willingness */
const ATTACK_THRESHOLD: Record<number, number> = {
	[REL.WAR]: 0,
	[REL.RIVAL]: 0.8,
	[REL.SUSPICIOUS]: 0.6,
	[REL.NEUTRAL]: 0.45,
	[REL.FRIENDLY]: 0.1,
	[REL.ALLY]: 0,
	[REL.VASSAL]: 0,
	[REL.OVERLORD]: 0,
	[REL.PU_SENIOR]: 0,
	[REL.PU_JUNIOR]: 0,
	[REL.NONE]: 0,
}

function nextEvent(
	state: HistoryState,
	province: number,
	rng: HistoryRng,
	years?: number,
): void {
	state.heap.enqueue(
		state.time + deltaYear(years ?? rng.uniform(5, 10)),
		EVT.WAR,
		province,
		0,
		0,
		0,
		state.time,
	)
}

export function initWar(state: HistoryState, rng: HistoryRng): void {
	for (let p = 0; p < state.P; p++) {
		if (state.desolate[p]) continue
		nextEvent(state, p, rng, rng.uniform(0, 5))
	}
}

export function runWar(
	state: HistoryState,
	nation: number,
	rng: HistoryRng,
): void {
	const parent = PROV.parent.get(state, nation)
	const sovereignNation = getSovereign(state, nation)
	const rulerRelation = getRulerRelation(state, nation)

	// Only independent nations can act
	if (parent < 0 && !rulerRelation) {
		const wars = provinceWars(state, nation)
			.map((idx: number) => state.wars[idx])
			.filter((w) => w.endTime === undefined)

		const neighbors = getNationNeighbors(state, nation)
		const targets: {
			n: number
			threshold: number
			w: number
			hasWar: boolean
			d: number
		}[] = []

		for (const nb of neighbors) {
			const rel = getRelation(state, nation, nb) as Relation
			const threshold = ATTACK_THRESHOLD[rel] ?? 0
			const alreadyAtWar = wars.some(
				(w) => w.defender === nb || w.attacker === nb,
			)
			const threat = warThreat(state, nation, nb)
			targets.push({
				n: nb,
				threshold,
				w: threat,
				hasWar: alreadyAtWar,
				d: provinceDistanceSq(state, nation, nb),
			})
		}

		const viable = targets.filter(
			(t) => t.threshold > 0 && t.w < t.threshold && !t.hasWar,
		)

		if (viable.length > 0) {
			// Favor closer viable opponents, matching the old history model.
			viable.sort((a, b) => a.d - b.d)
			const closest = viable[0]
			if (rng.random() > closest.w) {
				startWar(state, nation, closest.n, rng)
			}
		}
	} else if (parent >= 0) {
		// Subject province — consider rebellion
		if (
			sovereignNation >= 0 &&
			sovereignNation !== nation &&
			provinceWars(state, sovereignNation).length === 0
		) {
			const threat = warThreat(state, sovereignNation, nation, nation)
			if (threat > 0.4 && rng.random() < threat) {
				state.events.push({
					tag: "rebellion",
					time: state.time,
					data: { overlord: sovereignNation, subject: nation },
				})
				releaseProvince(state, nation)
				if (rng.random() > threat) {
					startWar(state, sovereignNation, nation, rng, true)
				}
				fixConnections(state, nation)
			}
		}
	}

	nextEvent(state, nation, rng)
}
