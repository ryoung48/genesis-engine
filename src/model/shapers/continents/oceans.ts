import { WORLD } from "../.."
import { CELL } from "../../cells"
import { Cell } from "../../cells/types"

export const OCEANS = {
	_landDist: (oceans: Cell[]) => {
		const queue = oceans.filter((o) => o.shallow)
		queue.forEach((o) => {
			o.landDist = 1
		})
		while (queue.length > 0) {
			const current = queue.shift()
			const neighbors = CELL.neighbors(current).filter(
				(n) => n.ocean && n.landDist === 0,
			)
			neighbors.forEach((n) => {
				n.landDist = current.landDist + 1
				queue.push(n)
			})
		}
	},
	build: () => {
		const oceans = WORLD.cells
			.water()
			.filter(
				(cell) =>
					cell.ocean && window.world.landmarks[cell.landmark] !== undefined,
			)
		OCEANS._landDist(oceans)
	},
}
