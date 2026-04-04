import { WORLD } from "@/model"
import { CELL } from "@/model/cells"
import { EBM } from "@/model/cells/ebm"
import { Cell } from "@/model/cells/types"
import { NATION } from "@/model/nations"
import { RELATIONS } from "@/model/nations/relations"
import { Relation } from "@/model/nations/relations/types"
import type { OrogenNationHierarchy } from "@/model/orogen/types"
import { PROVINCE } from "@/model/provinces"
import { Province } from "@/model/provinces/types"
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
		const hierarchy = (
			window.world as typeof window.world & {
				orogen?: { nations?: OrogenNationHierarchy }
			}
		).orogen?.nations
		if (hierarchy) {
			for (let p = 0; p < hierarchy.parent.length; p++) {
				const province = window.world.provinces[p]
				if (!province || province.desolate) continue
				PROVINCE.children.add(province, [])
				PROVINCE.occupations.add(province, undefined)
				const parentIdx = hierarchy.parent[p]
				if (parentIdx >= 0) {
					PROVINCE.parent.add(province, parentIdx)
				} else {
					PROVINCE.parent.remove(province)
				}
			}

			for (let p = 0; p < hierarchy.childOffset.length - 1; p++) {
				const province = window.world.provinces[p]
				if (!province || province.desolate) continue
				const start = hierarchy.childOffset[p]
				const end = hierarchy.childOffset[p + 1]
				if (end > start) {
					PROVINCE.children.add(
						province,
						Array.from(hierarchy.childList.subarray(start, end)),
					)
				}
			}
		}

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
