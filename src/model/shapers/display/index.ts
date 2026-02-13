import { CELL } from "@/model/cells"
import { Province } from "@/model/provinces/types"
import { POINT } from "@/model/utilities/points"
import { WORLD } from "../.."
import { CoastalEdge } from "../../types"
import { Display } from "./types"

const drawCoasts = (params: {
	landmarks: number[]
	coastFilter: (_landmark: number) => (_edge: CoastalEdge) => boolean
}) => {
	const { landmarks, coastFilter } = params
	const coast = Object.values(window.world.coasts)
	const boundaries: { path: [number, number][]; idx: number }[] = []
	landmarks.forEach((i) => {
		// get ocean coastline edges
		const group = coast.filter(coastFilter(i)).map((e) => e.edge)
		const start = group.shift()
		let [current] = start
		const [, end] = start
		// pick a random edge to start
		const ordered = [end, current]
		// loop until we arrive at the end
		while (group.length > 0) {
			let idx = 0
			// find the next edge in the segment
			for (let j = 0; j < group.length; j++) {
				const edge = group[j]
				// the next segment shares a vertex with the current segment
				if (
					POINT.sameEdge(edge[0], current) ||
					POINT.sameEdge(edge[1], current)
				) {
					current = POINT.sameEdge(edge[0], current) ? edge[1] : edge[0]
					idx = j
					break
				}
			}
			// add current vertex
			ordered.push(current)
			// don't consider already visited points
			group.splice(idx, 1)
		}
		// add ordered path to the list of ocean paths
		boundaries.push({ path: ordered, idx: i })
	})
	return boundaries
}

export const SHAPER_DISPLAY = {
	borders: {
		provinces: (provinces: Province[]) => {
			const edges = provinces
				.map((province) => {
					return CELL.bfsNeighborhood({
						start: window.world.cells[province.cell],
						spread: (cell) => cell.province === province.idx,
					})
				})
				.flat()
			const group = new Set(edges.map((e) => e.idx))
			return CELL.boundary({
				cells: edges.filter((edge) => !edge.isWater),
				boundary: (cell) => !group.has(cell.idx) || cell.isWater,
			})
		},
	},
	_islands: () => {
		// land (ocean)
		const islands = drawCoasts({
			landmarks: WORLD.landmarks("land"),
			coastFilter: (i) => (e) =>
				e.land === i && window.world.landmarks[e.water].type === "ocean",
		})
		window.world.display.islands = islands.reduce(
			(dict: Display["islands"], { path, idx }) => {
				dict[idx] = { path, idx }
				return dict
			},
			{},
		)
	},
	_lakes: () => {
		// land (ocean)
		const lakes = drawCoasts({
			landmarks: WORLD.landmarks("water").filter(
				(i) => window.world.landmarks[i].type !== "ocean",
			),
			coastFilter: (i) => (e) => e.water === i,
		})

		// create ocean curve
		const lakeEdges = WORLD.cells
			.water()
			.filter((cell) => cell.isWater && cell.shallow && !cell.ocean)
		window.world.display.lakes = lakes.reduce(
			(dict: Display["lakes"], { path, idx }) => {
				dict[idx] = {
					path,
					idx,
					border: lakeEdges.some((cell) => cell.landmark === idx),
				}
				return dict
			},
			{},
		)
	},
	build: () => {
		SHAPER_DISPLAY._islands()
		SHAPER_DISPLAY._lakes()
	},
}
