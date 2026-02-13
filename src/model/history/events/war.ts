import { CELL } from "@/model/cells"
import { WAR } from "@/model/history/wars"
import { NATION } from "@/model/nations"
import { PROVINCE } from "@/model/provinces"
import { Province } from "@/model/provinces/types"
import { TIME } from "@/model/utilities/time"
import { WarEvent } from "../types"

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
		const overlord = PROVINCE.parent.get(nation)

		// Only independent nations can act
		// Must have subjects, and not be fatigued from recent war
		if (!overlord && PROVINCE.children.get(nation).length > 0) {
			const wars = PROVINCE.wars.active(nation)
			// Find weaker neighbors, preferring distant ones (frontier expansion)
			const neighbors = NATION.neighbors({ nation })
				.map((n) => ({
					n,
					war: wars.find((w) => w.defender === n.idx || w.attacker === n.idx),
					w: WAR.stats.threat({ attacker: nation, defender: n }),
					d: CELL.distance(
						window.world.cells[nation.cell],
						window.world.cells[n.cell],
					),
				}))
				.filter(({ w, war }) => w < 0.6 && !war)
				.sort((a, b) => b.d - a.d)

			if (neighbors.length) {
				// Consider war against weakest neighbor (last in sorted list)
				const [weakest] = neighbors.slice(-1)
				if (window.dice.random > weakest.w) {
					WAR.start({ attacker: nation, defender: weakest.n })
				}
			}
		} else if (
			overlord === PROVINCE.nation(nation) &&
			!PROVINCE.wars.active(overlord).length &&
			NATION.neighbors({ nation }).length > 0
		) {
			// Exclude the prospective rebel from overlord's wealth calculation
			// to get accurate post-rebellion strength comparison
			const threat = WAR.stats.threat({
				attacker: overlord,
				defender: nation,
				exclude: nation,
			})
			if (threat > 0.4 && window.dice.random < threat) {
				window.world.past.push({
					tag: "rebellion",
					time: window.world.time,
					agents: [overlord.idx, nation.idx],
					overlord: overlord.idx,
					subject: nation.idx,
				})
				NATION.domains.release(nation)
				if (window.dice.random > threat)
					WAR.start({ attacker: overlord, defender: nation, rebel: true }) // Civil war
				NATION.connections(nation)
			}
		}
		nextEvent(nation)
	},
}
