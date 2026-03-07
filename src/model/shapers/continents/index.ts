import { SIMPLEX } from "@/model/utilities/noise"
import { POINT } from "@/model/utilities/points"
import { VORONOI } from "@/model/utilities/voronoi"
import { WORLD } from "../.."
import { CELL } from "../../cells"
import { LANDMARKS as SHAPER_LANDMARKS } from "./landmarks"
import { OCEANS as SHAPER_OCEANS } from "./oceans"

export const SHAPER_CONTINENTS = {
	build: (landFraction?: number) => {
		SHAPER_CONTINENTS._setup()
		SHAPER_CONTINENTS._coastGen(landFraction)
		const idx = SHAPER_LANDMARKS.water(1)
		SHAPER_LANDMARKS.land(idx)
		SHAPER_CONTINENTS._coastalDistances()
		SHAPER_OCEANS.build()
	},
	_coastalDistances: () => {
		// get distance to oceans (for rivers)
		let queue = WORLD.cells.land().filter((p) => p.beach)
		queue.forEach((n) => {
			n.oceanDist = 1
		})
		while (queue.length > 0) {
			const current = queue.shift()
			const neighbors = CELL.neighbors(current).filter(
				(n) => !n.ocean && n.oceanDist === 0,
			)
			neighbors.forEach((n) => {
				n.oceanDist = current.oceanDist + 1
			})
			queue = queue.concat(neighbors)
		}
	},
	_coastGen: (landFraction?: number) => {
		// start from fractal noise
		const elev = SIMPLEX.continents(window.world.cells, {
			octaves: 12,
			frequency: 0.4,
			persistence: 0.7,
		})
		let cutoff = 0.4
		let land = 0
		const target = landFraction
			? [landFraction - 0.05, landFraction + 0.05]
			: [0.25, 0.35]
		while (land < target[0] || land > target[1]) {
			land = elev.filter((e) => e > cutoff).length / window.world.cells.length
			if (land > target[1]) cutoff += 0.02
			if (land < target[0]) cutoff -= 0.02
		}
		elev.forEach(
			(e, i) =>
				(window.world.cells[i].h = e > cutoff ? WORLD.elevation.seaLevel : 0),
		)
		console.log("land ratio: " + land + " | cutoff: " + cutoff)
	},
	_setup: () => {
		// create initial points
		let points = POINT.random(window.world.cell.count)
		const { vor, sites } = VORONOI.relaxed({ points, relaxation: 2 })
		window.world.diagram = vor
		points = sites
		// get voronoi polygon data
		window.world.cells = points.map((point, idx) => CELL.spawn({ idx, point }))
	},
}
