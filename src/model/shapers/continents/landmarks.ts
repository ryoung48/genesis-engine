import { WORLD } from "../.."
import { CELL } from "../../cells"

export const LANDMARKS = {
	land: (idx: number) => {
		let land = WORLD.cells.land()
		// mark land cells
		const total = window.world.cells.length
		// iterate through all islands
		while (land.length > 0) {
			let queue = [land[0].idx]
			window.world.landmarks[idx] = {
				type: "continent",
				size: 0,
				water: false,
				cell: land[0].idx,
			}
			// floodfill all connecting land cells to mark an island
			const lake: { isle: boolean; idx?: number } = { isle: true }
			while (queue.length > 0) {
				// grab the next item in the queue
				const current = window.world.cells[queue.shift()]
				// mark it with the current land feature index
				current.landmark = idx
				current.isWater = false
				const water = CELL.neighbors(current).filter(
					(p) => p.elevation < WORLD.elevation.seaLevel,
				)
				current.isCoast = water.length > 0
				const ocean = water.filter((cell) => cell.ocean)
				current.beach = ocean.length > 0
				// mark neighboring water cells as shallow
				water.forEach((i) => (i.shallow = true))
				// identify lake isles
				if (current.beach) lake.isle = false
				if (lake.isle && !lake.idx && water.length > 0) {
					const lakeCell = water.find((cell) => !cell.ocean)
					lake.idx = lakeCell?.landmark
				}
				// add neighboring land cells to the queue
				queue = queue.concat(
					CELL.neighbors(current)
						.filter(
							(p) =>
								p.elevation >= WORLD.elevation.seaLevel &&
								!p.landmark &&
								!queue.includes(p.idx),
						)
						.map((p) => p.idx),
				)
			}
			const island = land.filter((poly) => poly.landmark === idx)
			// remove lake isles
			if (lake.isle) {
				delete window.world.landmarks[idx]
				island.forEach((p) => {
					p.landmark = lake.idx
					p.isWater = true
					p.isCoast = false
					p.ocean = false
					p.elevation = 0
				})
				island.forEach((p) => {
					CELL.neighbors(p)
						.filter((n) => n.isWater)
						.forEach((n) => {
							const coast = CELL.neighbors(n).filter((p) => !p.isWater)
							n.shallow = coast.length > 0
						})
				})
				window.world.landmarks[lake.idx].size += island.length
			} else {
				// mark islands
				const landmark = window.world.landmarks[idx]
				landmark.size = island.length
				if (landmark.size / total < 0.001) landmark.type = "isle"
				else if (landmark.size / total < 0.01) landmark.type = "island"
			}
			// only consider cells that haven't been marked
			land = land.filter((poly) => !poly.landmark)
			// increment the land feature index after a completed floodfill
			idx += 1
		}
		WORLD.cells.reshape()
		// assign parents
		LANDMARKS._assignParents()
		// remove super lakes
		const lakes = WORLD.cells.lakes.get()
		WORLD.landmarks("water")
			.filter((idx) => window.world.landmarks[idx].type === "lake")
			.forEach((idx) => {
				const lake = window.world.landmarks[idx]
				const shallow = lakes
					.filter((cell) => cell.landmark === idx)
					.find((cell) => cell.shallow)
				if (!shallow) return WORLD.cells.lakes.merge({ lakes, lake: idx })
				const { landmark } = CELL.neighbors(shallow).find(
					(cell) => cell.landmark !== idx,
				)
				lake.parent = landmark
				const ratio = lake.size / window.world.landmarks[landmark].size
				if (ratio > 0.025) WORLD.cells.lakes.remove({ lakes, lake: idx })
				if (lake.size / window.world.cells.length > 0.001) lake.type = "sea"
			})
		WORLD.cells.reshape()
	},
	water: (idx: number) => {
		const total = window.world.cells.length
		// mark water cells
		let water = WORLD.cells.water()
		// iterate through all bodies of water
		while (water.length > 0) {
			let queue = [water[0].idx]
			window.world.landmarks[idx] = {
				size: 1,
				type: "ocean",
				water: true,
				cell: water[0].idx,
			}
			// floodfill all connecting water cells to mark a body of water
			while (queue.length > 0) {
				// grab the next item in the queue
				const current = window.world.cells[queue.shift()]
				// mark it with the current water feature index
				current.landmark = idx
				current.isWater = true
				current.ocean = true
				// add neighboring water cells to the queue
				queue = queue.concat(
					CELL.neighbors(current)
						.filter(
							(p) =>
								p.elevation < WORLD.elevation.seaLevel &&
								!p.landmark &&
								!queue.includes(p.idx),
						)
						.map((n) => n.idx),
				)
			}
			// mark bodies of water
			const curr = water.filter((poly) => poly.landmark === idx)
			const landmark = window.world.landmarks[idx]
			landmark.size = curr.length
			const ratio = landmark.size / total
			if (ratio < 0.001) landmark.type = "lake"
			else if (ratio < 0.01) landmark.type = "sea"
			// flip ocean markers
			if (landmark.type !== "ocean")
				curr.forEach((p) => (p.ocean = false))
			// only consider cells that haven't been marked
			water = water.filter((poly) => !poly.landmark)
			// increment the water feature index after a completed floodfill
			idx += 1
		}
		return idx
	},
	_assignParents: () => {
		const landmarks = window.world.landmarks
		// for each landmark, find distinct opposite-type neighbors
		Object.entries(landmarks).forEach(([key, landmark]) => {
			const idx = parseInt(key)
			const cells = window.world.cells.filter((c) => c.landmark === idx)
			// collect all neighboring landmarks of opposite type
			const neighborLandmarks = new Set<number>()
			cells.forEach((cell) => {
				CELL.neighbors(cell).forEach((n) => {
					if (n.landmark !== undefined && n.landmark !== idx) {
						const nLandmark = landmarks[n.landmark]
						if (nLandmark && nLandmark.water !== landmark.water) {
							neighborLandmarks.add(n.landmark)
						}
					}
				})
			})
			if (neighborLandmarks.size >= 1) {
				// pick the largest opposite-type neighbor as parent,
				// but only if it's larger (it encloses us)
				const largest = [...neighborLandmarks].reduce((a, b) =>
					landmarks[a].size > landmarks[b].size ? a : b,
				)
				if (landmarks[largest].size > landmark.size) {
					landmark.parent = largest
				}
			}
		})
		// compute depth by walking the parent chain
		const computeDepth = (idx: number): number => {
			const landmark = landmarks[idx]
			if (landmark.depth !== undefined) return landmark.depth
			if (landmark.parent === undefined) {
				landmark.depth = 0
				return 0
			}
			landmark.depth = computeDepth(landmark.parent) + 1
			return landmark.depth
		}
		Object.keys(landmarks).forEach((key) => computeDepth(parseInt(key)))
		// absorb lake isles — small land bodies with a single water parent
		Object.entries(landmarks).forEach(([key, landmark]) => {
			const idx = parseInt(key)
			if (!landmark.water && landmark.parent !== undefined) {
				const parentLandmark = landmarks[landmark.parent]
				if (landmark.depth > 2) {
					// absorb this land into the parent water body
					const cells = window.world.cells.filter((c) => c.landmark === idx)
					cells.forEach((p) => {
						p.landmark = landmark.parent
						p.isWater = true
						p.isCoast = false
						p.ocean = false
						p.elevation = 0
					})
					// update shallow status for neighbors
					cells.forEach((p) => {
						CELL.neighbors(p)
							.filter((n) => n.isWater)
							.forEach((n) => {
								const coast = CELL.neighbors(n).filter((c) => !c.isWater)
								n.shallow = coast.length > 0
							})
					})
					parentLandmark.size += cells.length
					delete landmarks[idx]
				}
			}
		})
	},
}
