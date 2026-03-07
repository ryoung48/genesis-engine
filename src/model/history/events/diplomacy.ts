import { NATION } from "@/model/nations"
import { RELATIONS } from "@/model/nations/relations"
import { Relation } from "@/model/nations/relations/types"
import { WAR } from "@/model/nations/wars"
import { PROVINCE } from "@/model/provinces"
import { Province } from "@/model/provinces/types"
import { TIME } from "@/model/utilities/time"
import { DiplomacyEvent } from "../types"

// Diplomacy ladder for standard transitions (excludes war/vassal/overlord)
// Columns: [rival, suspicious, neutral, friendly, ally]
const LADDER_STATES: Relation[] = [
	"rival",
	"suspicious",
	"neutral",
	"friendly",
	"ally",
]

const TRANSITION_MATRIX: Record<string, number[]> = {
	rival: [0.65, 0.25, 0.08, 0.02, 0.0],
	suspicious: [0.18, 0.5, 0.22, 0.05, 0.05],
	neutral: [0.05, 0.18, 0.5, 0.15, 0.12],
	friendly: [0.02, 0.1, 0.2, 0.45, 0.23],
	ally: [0.01, 0.04, 0.1, 0.2, 0.65],
}

function rollTransition(current: Relation): Relation {
	const row = TRANSITION_MATRIX[current]
	if (!row) return current
	let roll = window.dice.random
	for (let i = 0; i < row.length; i++) {
		roll -= row[i]
		if (roll <= 0) return LADDER_STATES[i]
	}
	return LADDER_STATES[LADDER_STATES.length - 1]
}

const nextEvent = (province: Province, years?: number) => {
	window.world.future.enqueue({
		type: "diplomacy",
		nation: province.idx,
		previous: window.world.time,
		time:
			window.world.time + TIME.delta.year(years ?? window.dice.uniform(8, 15)),
	})
}

/** Check if two nations are similar enough in size to be rivals (±20% wealth) */
function canBeRivals(a: Province, b: Province): boolean {
	const aW = NATION.wealth.optimal(a)
	const bW = NATION.wealth.optimal(b)
	const ratio = Math.min(aW, bW) / Math.max(aW, bW)
	return ratio >= 0.8
}

/** Check if one nation can vassalize the other (< 50% wealth) */
function canVassalize(
	a: Province,
	b: Province,
): { vassal: Province; overlord: Province } | null {
	const aW = NATION.wealth.optimal(a)
	const bW = NATION.wealth.optimal(b)
	const ratio = Math.min(aW, bW) / Math.max(aW, bW)
	if (ratio >= 0.5) return null
	return aW <= bW ? { vassal: a, overlord: b } : { vassal: b, overlord: a }
}

export const DIPLOMACY_EVENT = {
	init: () => {
		window.world.provinces.forEach((p) => {
			if (!p.desolate) nextEvent(p, window.dice.uniform(0, 8))
		})
	},
	run: (event: DiplomacyEvent) => {
		const nation = window.world.provinces[event.nation]

		// Only sovereign nations participate in diplomacy
		if (!NATION.sovereign(nation)) {
			nextEvent(nation)
			return
		}

		const neighbors = NATION.neighbors({ nation })
		const neighborSet = new Set(neighbors.map((n) => n.idx))

		// --- Cleanup pass: drop non-neighbor and non-sovereign relations to neutral ---
		for (const idxStr of Object.keys(nation._relations)) {
			const otherIdx = Number(idxStr)
			const other = window.world.provinces[otherIdx]
			if (!other || other.desolate) continue

			const otherNation = PROVINCE.nation(other)
			const current = RELATIONS.get({ nation, other: otherNation })

			// Skip vassal/overlord and PU bonds (persist regardless of adjacency)
			if (
				current === "vassal" ||
				current === "overlord" ||
				current === "personal_union_senior" ||
				current === "personal_union_junior"
			)
				continue

			// Non-neighbor or non-sovereign: reset to neutral
			if (!neighborSet.has(otherNation.idx) || !NATION.sovereign(otherNation)) {
				if (current !== "neutral") {
					RELATIONS.set({
						nation,
						other: otherNation,
						relation: "neutral",
					})
				}
			}
		}

		// --- Rival size-gate decay: rivals who are no longer similar in size drop to suspicious ---
		for (const neighbor of neighbors) {
			if (!NATION.sovereign(neighbor)) continue
			const relation = RELATIONS.get({ nation, other: neighbor })
			if (relation === "rival" && !canBeRivals(nation, neighbor)) {
				RELATIONS.set({
					nation,
					other: neighbor,
					relation: "suspicious",
				})
			}
		}

		// --- Standard diplomacy transitions for neighbors ---
		for (const neighbor of neighbors) {
			if (!NATION.sovereign(neighbor)) continue

			const relation = RELATIONS.get({ nation, other: neighbor })

			// Overlord/senior side skips — the vassal/junior side handles transitions
			if (relation === "overlord" || relation === "personal_union_senior")
				continue

			// War is controlled by the war lifecycle, not diplomacy
			if (relation === "war") continue

			// Vassal: roll transition as opinion, check for rebellion
			if (relation === "vassal") {
				processVassalDiplomacy(nation, neighbor)
				continue
			}

			// Personal union junior: rebellion-style check
			if (relation === "personal_union_junior") {
				processPersonalUnionDiplomacy(nation, neighbor)
				continue
			}

			// Roll the transition matrix
			const next = rollTransition(relation)
			if (next === relation) continue

			// Ally outcome is conditional: if wealth ratio < 50%, become vassal instead
			if (next === "ally") {
				const pair = canVassalize(nation, neighbor)
				if (pair && !RELATIONS.overlord(pair.vassal)) {
					RELATIONS.set({
						nation: pair.vassal,
						other: pair.overlord,
						relation: "vassal",
					})
					continue
				}
			}

			// Rival size-gate: can't become rival if too different in size
			if (next === "rival" && !canBeRivals(nation, neighbor)) {
				if (relation !== "suspicious") {
					RELATIONS.set({
						nation,
						other: neighbor,
						relation: "suspicious",
					})
				}
				continue
			}

			RELATIONS.set({ nation, other: neighbor, relation: next })
		}

		nextEvent(nation)
	},
}

/**
 * Process vassal-specific diplomacy.
 * Roll the vassal transition matrix to get an "opinion" of the overlord.
 * If opinion drops to suspicious/rival, check for rebellion.
 */
function processVassalDiplomacy(vassal: Province, overlord: Province) {
	// Sync overlord's enemies first
	syncVassalRelations(vassal, overlord)

	// Can we survive a counterattack?
	const threat = WAR.threat({
		attacker: overlord,
		defender: vassal,
	})
	// threat > 0.4 means overlord can't easily crush us
	if (threat <= 0.4) return

	// Break vassalage — set to suspicious
	RELATIONS.set({
		nation: vassal,
		other: overlord,
		relation: "suspicious",
	})

	// Probabilistic counter-war: base 70% chance, reduced if overlord is weak
	const counterWarChance = 0.7 * (1 - threat)
	if (window.dice.random < counterWarChance) {
		WAR.start({ attacker: overlord, defender: vassal })
	}
}

/**
 * Process personal union junior diplomacy.
 * Same rebellion pattern as vassal diplomacy.
 */
function processPersonalUnionDiplomacy(junior: Province, senior: Province) {
	syncVassalRelations(junior, senior)

	const threat = WAR.threat({
		attacker: senior,
		defender: junior,
	})

	if (threat <= 0.4) return

	// Break union — set to suspicious
	RELATIONS.set({
		nation: junior,
		other: senior,
		relation: "suspicious",
	})

	// Probabilistic counter-war
	const counterWarChance = 0.7 * (1 - threat)
	if (window.dice.random < counterWarChance) {
		WAR.start({ attacker: senior, defender: junior })
	}
}

/**
 * Sync a vassal's relations to match their overlord's relations.
 * Vassals inherit their overlord's rival/suspicious/war relations
 * with nations the vassal is also neighbors with.
 */
function syncVassalRelations(vassal: Province, overlord: Province) {
	const vassalNeighbors = NATION.neighbors({ nation: vassal })
	for (const neighbor of vassalNeighbors) {
		if (neighbor === overlord) continue
		const vassalRel = RELATIONS.get({ nation: vassal, other: neighbor })
		// Don't override existing vassal/overlord or PU bonds
		if (
			vassalRel === "vassal" ||
			vassalRel === "overlord" ||
			vassalRel === "personal_union_senior" ||
			vassalRel === "personal_union_junior"
		)
			continue

		const overlordRel = RELATIONS.get({
			nation: overlord,
			other: neighbor,
		})
		// Inherit war, rival, and suspicious from overlord
		if (
			overlordRel === "suspicious" ||
			overlordRel === "war" ||
			overlordRel === "rival"
		) {
			RELATIONS.set({
				nation: vassal,
				other: neighbor,
				relation: "suspicious",
			})
		}
	}
}
