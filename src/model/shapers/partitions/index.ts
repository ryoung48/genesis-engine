import { WORLD } from "@/model"
import { CELL } from "@/model/cells"
import { Cell } from "@/model/cells/types"
import { NATION } from "@/model/nations"
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

const PROVINCE_COUNT = 3500

export const SHAPER_PARTITIONS = {
	build: () => {
		SHAPER_PARTITIONS._provinces()
		PROVINCE.population.init()
		CULTURE.build()
		HERITAGE.build()
		FAITH.build()
		RELIGION.build()
		NATION.build()
	},
	_provinces: () => {
		const land = WORLD.cells.land()
		const spacing = WORLD.placement.autoSpacing(
			PROVINCE_COUNT,
			land.length * window.world.cell.area,
		)
		WORLD.placement
			.run({
				count: PROVINCE_COUNT,
				spacing,
				whitelist: land,
			})
			.map(PROVINCE.spawn)

		const queue = window.world.provinces.map((province) => {
			const cell = window.world.cells[province.cell]
			claimCell.province(cell, province)
			const { climate } = cell
			if (climate === "arctic") province.desolate = true
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
}
