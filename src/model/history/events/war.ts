import { CELL } from "@/model/cells"
import { NATION } from "@/model/nations"
import { RELATIONS } from "@/model/nations/relations"
import { Relation } from "@/model/nations/relations/types"
import { WAR } from "@/model/nations/wars"
import { PROVINCE } from "@/model/provinces"
import { Province } from "@/model/provinces/types"
import { TIME } from "@/model/utilities/time"
import { WarEvent } from "../types"

// Relation-based threat threshold for attack willingness
// 0 = never attack this relation
const ATTACK_THRESHOLD: Record<Relation, number> = {
	war: 0.9, // already at war — most eager
	rival: 0.8,
	suspicious: 0.6,
	neutral: 0.45,
	friendly: 0.1, // never attack
	ally: 0, // never attack
	vassal: 0, // never attack
	overlord: 0, // never attack
	personal_union_senior: 0, // never attack
	personal_union_junior: 0, // never attack
}

const nextEvent = (province: Province, years?: number) => {
	window.world.future.enqueue({
		type: "war",
		nation: province.idx,
		previous: window.world.time,
		time:
			window.world.time + TIME.delta.year(years ?? window.dice.uniform(5, 10)),
	})
}

export const WAR_EVENT = {
	init: () => {
		window.world.provinces.forEach((p) => {
			nextEvent(p, window.dice.uniform(0, 5))
		})
	},
	run: (event: WarEvent) => {
		const nation = window.world.provinces[event.nation]
		const ruler = PROVINCE.parent.get(nation)
		const overlord = RELATIONS.overlord(nation)

		// Only independent nations can act
		if (!ruler && !overlord) {
			const wars = WAR.nation.get(nation)
			// Find weaker neighbors, preferring distant ones (frontier expansion)
			// Use effectiveStrength for deterrence (accounts for defender's allies)
			const neighbors = NATION.neighbors({ nation })
				.map((n) => {
					const relation = RELATIONS.get({
						nation,
						other: n,
					})
					const threshold = ATTACK_THRESHOLD[relation]
					return {
						n,
						relation,
						threshold,
						war: wars.find((w) => w.defender === n.idx || w.attacker === n.idx),
						w: WAR.threat({ attacker: nation, defender: n }),
						d: CELL.distance(
							window.world.cells[nation.cell],
							window.world.cells[n.cell],
						),
					}
				})
				.filter(
					({ w, war, threshold }) => threshold > 0 && w < threshold && !war,
				)
				.sort((a, b) => b.d - a.d)

			if (neighbors.length) {
				// Consider war against weakest neighbor (last in sorted list)
				const [weakest] = neighbors.slice(-1)
				if (window.dice.random > weakest.w) {
					WAR.start({ attacker: nation, defender: weakest.n })
				}
			}
		} else if (
			ruler === PROVINCE.nation(nation) &&
			!WAR.nation.get(ruler).length &&
			NATION.neighbors({ nation }).length > 0
		) {
			// Exclude the prospective rebel from overlord's wealth calculation
			// to get accurate post-rebellion strength comparison
			const threat = WAR.threat({
				attacker: ruler,
				defender: nation,
				exclude: nation,
			})
			if (threat > 0.4 && window.dice.random < threat) {
				window.world.past.push({
					tag: "rebellion",
					time: window.world.time,
					agents: [ruler.idx, nation.idx],
					overlord: ruler.idx,
					subject: nation.idx,
				})
				NATION.domains.release(nation)
				if (window.dice.random > threat)
					WAR.start({ attacker: ruler, defender: nation, rebel: true }) // Civil war
				NATION.connections(nation)
			}
		}
		nextEvent(nation)
	},
}
