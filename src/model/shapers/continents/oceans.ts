import { WORLD } from "../.."
import { CELL } from "../../cells"
import { Cell } from "../../cells/types"
import { ARRAY } from "../../utilities/array"

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
	_markOceans: (oceans: Cell[]) => {
		const regions = Object.values(window.world.oceanRegions)
		const deep = regions
			.filter((r) => r.distanceFromContinent > 3)
			.map((r) => window.world.cells[r.cell])
		const deepWaters = WORLD.placement
			.run({
				count: 5,
				spacing: WORLD.placement.spacing.oceans,
				whitelist: deep,
			})
			.map((cell, i) => {
				const region = window.world.oceanRegions[cell.oceanRegion]
				region.ocean = i
				region.type = "ocean"
				return region
			})
		const shallow = regions
			.filter((r) => r.distanceFromContinent < 1)
			.map((r) => window.world.cells[r.cell])
		const shallowWaters = WORLD.placement
			.run({
				count: shallow.length / 4,
				spacing: WORLD.placement.spacing.oceanRegions * 4,
				whitelist: shallow,
			})
			.map((cell, i) => {
				const region = window.world.oceanRegions[cell.oceanRegion]
				region.ocean = deepWaters.length + i
				region.type = "sea"
				return region
			})
		while (shallowWaters.length > 0) {
			const current = shallowWaters.shift()
			current.neighbors
				.map((n) => window.world.oceanRegions[n])
				.forEach((n) => {
					if (n.ocean === -1 && n.distanceFromContinent < 2) {
						n.ocean = current.ocean
						n.type = current.type
						shallowWaters.push(n)
					}
				})
		}
		while (deepWaters.length > 0) {
			const current = deepWaters.shift()
			current.neighbors
				.map((n) => window.world.oceanRegions[n])
				.forEach((n) => {
					if (n.ocean === -1) {
						n.ocean = current.ocean
						n.type = current.type
						deepWaters.push(n)
					}
				})
		}
		const landmarks: Record<number, { landmark: number; size: number }> = {
			0: { landmark: oceans[0].landmark, size: 0 },
		}
		let idx =
			Math.max(...Object.keys(window.world.landmarks).map((n) => parseInt(n))) +
			1
		oceans.forEach((cell) => {
			const ocean = window.world.oceanRegions[cell.oceanRegion]
			if (!landmarks[ocean.ocean]) {
				window.world.landmarks[idx] = {
					size: 0,
					type: "ocean",
					sea: ocean.type === "sea",
					water: true,
					cell: cell.idx,
				}
				landmarks[ocean.ocean] = { landmark: idx, size: 0 }
				idx += 1
			}
			cell.landmark = landmarks[ocean.ocean].landmark
			landmarks[ocean.ocean].size += 1
		})
		Object.values(landmarks).forEach(({ landmark, size }) => {
			window.world.landmarks[landmark].size = size
		})
	},
	_oceanRegions: (oceans: Cell[]) => {
		WORLD.placement
			.run({
				count: 1000,
				spacing: WORLD.placement.spacing.oceanRegions,
				whitelist: oceans,
			})
			.forEach((cell) => {
				window.world.oceanRegions.push({
					cell: cell.idx,
					idx: window.world.oceanRegions.length,
					borders: [],
					neighbors: [],
					cells: [cell.idx],
					ocean: -1,
					distanceFromContinent: -1,
				})
			})
		const queue = window.world.oceanRegions.map((o) => {
			const cell = window.world.cells[o.cell]
			cell.oceanRegion = o.idx
			return cell
		})
		while (queue.length > 0) {
			const current = queue.shift()
			CELL.neighbors(current).forEach((n) => {
				if (n.ocean && n.oceanRegion === undefined) {
					n.oceanRegion = current.oceanRegion
					queue.push(n)
					window.world.oceanRegions[current.oceanRegion].cells.push(n.idx)
				} else {
					if (n.oceanRegion !== current.oceanRegion) {
						window.world.oceanRegions[current.oceanRegion].borders.push(
							current.idx,
						)
						if (n.oceanRegion !== undefined) {
							window.world.oceanRegions[current.oceanRegion].neighbors.push(
								n.oceanRegion,
							)
						} else if (
							!n.isWater &&
							window.world.landmarks[n.landmark].type === "continent"
						) {
							window.world.oceanRegions[
								current.oceanRegion
							].distanceFromContinent = 0
						}
					}
				}
			})
		}
		window.world.oceanRegions.forEach((region) => {
			region.borders = ARRAY.unique(region.borders)
			region.neighbors = ARRAY.unique(region.neighbors)
		})
		const coastal = window.world.oceanRegions.filter(
			(r) => r.distanceFromContinent === 0,
		)
		while (coastal.length > 0) {
			const current = coastal.shift()
			current.neighbors
				.map((n) => window.world.oceanRegions[n])
				.forEach((n) => {
					if (n.distanceFromContinent === -1) {
						n.distanceFromContinent = current.distanceFromContinent + 1
						coastal.push(n)
					}
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
		OCEANS._oceanRegions(oceans)
		OCEANS._markOceans(oceans)
		OCEANS._landDist(oceans)
	},
}
