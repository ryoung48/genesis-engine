import { WORLD } from "@/model"
import { CELL } from "@/model/cells"
import { EBM } from "@/model/cells/ebm"
import { Cell } from "@/model/cells/types"
import { NATION } from "@/model/nations"
import { RELATIONS } from "@/model/nations/relations"
import { Relation } from "@/model/nations/relations/types"
import { PROVINCE } from "@/model/provinces"
import { Province } from "@/model/provinces/types"
import { ARRAY } from "@/model/utilities/array"
import { MATH } from "@/model/utilities/math"
import { CULTURE } from "../../actors/culture"
import { FAITH } from "../../actors/faith"
import { HERITAGE } from "../../actors/heritage"
import { RELIGION } from "../../actors/religion"
import { SHAPER_MOUNTAINS } from "../topagraphy"

const claimCell = {
	province: (cell: Cell, province: Province) => {
		cell.province = province.idx
		province.land += cell.isWater ? 0 : 1
		if (!cell.isWater) {
			if (!province.islands[cell.landmark]) province.islands[cell.landmark] = 0
			province.islands[cell.landmark] += 1
			province.cells.land.push(cell.idx)
		} else if (window.world.landmarks[cell.landmark].type === "ocean") {
			province.ocean += cell.isWater ? 1 : 0
		} else {
			if (!province.lakes[cell.landmark]) province.lakes[cell.landmark] = 0
			province.lakes[cell.landmark] += 1
		}
	},
}

export const SHAPER_PARTITIONS = {
	build: () => {
		SHAPER_PARTITIONS._provinces()
		PROVINCE.population.init()
		CULTURE.build()
		HERITAGE.build()
		CULTURE.assignEthos()
		CULTURE.assignTraditions()
		FAITH.build()
		RELIGION.build()
		SHAPER_PARTITIONS._nations()
	},
	_provinces: () => {
		const land = WORLD.cells.land()
		const totalArea = land.length * window.world.cell.area
		const count = totalArea / 45e3
		const spacing = WORLD.placement.autoSpacing(
			count,
			land.length * window.world.cell.area,
		)
		WORLD.placement
			.run({
				count,
				spacing,
				whitelist: land,
			})
			.map(PROVINCE.spawn)

		const queue = window.world.provinces.map((province) => {
			const cell = window.world.cells[province.cell]
			claimCell.province(cell, province)
			const { climate } = cell
			if (
				climate === "arctic" ||
				climate === "subarctic" ||
				cell.heat.max > EBM.constants.chaotic.max ||
				cell.rain.annual < 10
			)
				province.desolate = true
			return cell
		})
		const { boundaries } = SHAPER_MOUNTAINS
		while (queue.length > 0) {
			// grab the next item in the queue
			const curr = queue.shift()!
			const province = window.world.provinces[curr.province]

			const unclaimed: Cell[] = []
			CELL.neighbors(curr).forEach((n) => {
				if (n.province === -1) {
					// expand the location's province if unclaimed
					if (boundaries[n.idx] !== boundaries[curr.idx] && n.isMountains)
						return
					unclaimed.push(n)
				} else if (n.province !== curr.province) {
					const [p1, p2] = [window.world.provinces[n.province], province]
					p1.neighbors.add(p2.idx)
					p2.neighbors.add(p1.idx)
				}
			})

			if (unclaimed.length > 0) {
				unclaimed.sort(
					(a, b) => CELL.distance(curr, a) - CELL.distance(curr, b),
				)
				const closest = unclaimed[0]
				claimCell.province(closest, province)
				queue.push(closest)

				if (unclaimed.length > 1) {
					queue.push(curr)
				}
			}
		}
	},
	_nations: () => {
		const provinces = window.world.provinces.filter((p) => !p.desolate)
		const { groups } = ARRAY.distribute<Province>({
			items: provinces,
			percentages: MATH.normalize([0.025, 0.05, 0.1, 0.2, 0.3, 0.4]),
			buckets: [
				[50, 100],
				[25, 49],
				[10, 24],
				[5, 9],
				[2, 4],
				[1, 1],
			],
			neighbors: (p) => PROVINCE.neighbors({ province: p }),
			score: (p, start) => {
				const pCell = window.world.cells[p.cell]
				const startCell = window.world.cells[start.cell]
				const d = CELL.distance(pCell, startCell)
				const coastalBoost = pCell.topography === "coastal" ? 2 : 1
				return (1 / (d + 0.1)) * coastalBoost
			},
			sorted: (items) =>
				items.sort((a, b) => {
					const aCell = window.world.cells[a.cell]
					const bCell = window.world.cells[b.cell]
					const aCoastal = aCell.topography === "coastal" ? 1 : 0
					const bCoastal = bCell.topography === "coastal" ? 1 : 0
					return bCoastal - aCoastal
				}),
		})

		groups.forEach((group) => {
			const sorted = group.sort(
				(a, b) => NATION.wealth.raw(b) - NATION.wealth.raw(a),
			)
			const capital = sorted[0]
			PROVINCE.parent.remove(capital)
			PROVINCE.occupations.add(capital, undefined)
			const reminder = sorted.slice(1)
			NATION.domains.add(capital, reminder)
			reminder
				.filter((subject) => subject._children.length === 0)
				.forEach((subject) => {
					PROVINCE.children.add(subject, [])
				})
		})

		// Initialize relations between neighboring sovereign nations
		// [rival, suspicious, neutral, friendly, ally]
		// "ally" is conditional: if neighbor < 50% wealth → vassal, else ally
		const INIT_STATES: Relation[] = [
			"rival",
			"suspicious",
			"neutral",
			"friendly",
			"ally",
		]
		const INIT_WEIGHTS = [0.15, 0.3, 0.3, 0.15, 0.1]

		const nations = NATION.nations()
		const visited = new Set<string>()
		nations.forEach((nation) => {
			NATION.neighbors({ nation }).forEach((neighbor) => {
				const key =
					nation.idx < neighbor.idx
						? `${nation.idx}-${neighbor.idx}`
						: `${neighbor.idx}-${nation.idx}`
				if (visited.has(key)) return
				visited.add(key)

				let roll = window.dice.random
				let result: Relation = "neutral"
				for (let i = 0; i < INIT_WEIGHTS.length; i++) {
					roll -= INIT_WEIGHTS[i]
					if (roll <= 0) {
						result = INIT_STATES[i]
						break
					}
				}

				if (result === "ally") {
					// Ally is conditional: if one nation < 50% of other's wealth → vassal
					const nationW = NATION.wealth.optimal(nation)
					const neighborW = NATION.wealth.optimal(neighbor)
					const ratio =
						Math.min(nationW, neighborW) / Math.max(nationW, neighborW)
					if (ratio < 0.5) {
						// Weaker becomes vassal
						const vassal = nationW <= neighborW ? nation : neighbor
						RELATIONS.set({
							nation: vassal,
							other: vassal === nation ? neighbor : nation,
							relation: "vassal",
						})
					} else {
						RELATIONS.set({
							nation,
							other: neighbor,
							relation: "ally",
						})
					}
				} else if (result === "rival") {
					// Rivals must be within ±20% of each other's wealth
					const nationW = NATION.wealth.optimal(nation)
					const neighborW = NATION.wealth.optimal(neighbor)
					const ratio =
						Math.min(nationW, neighborW) / Math.max(nationW, neighborW)
					RELATIONS.set({
						nation,
						other: neighbor,
						relation: ratio >= 0.8 ? "rival" : "suspicious",
					})
				} else {
					RELATIONS.set({
						nation,
						other: neighbor,
						relation: result,
					})
				}
			})
		})
	},
}
