import { WORLD } from "../.."
import { CELL } from "../../cells"

export const LANDMARKS = {
	land: (idx: number) => {
		let land = WORLD.cells.land()
		const total = window.world.cells.length
		// iterate through all contiguous land bodies
		while (land.length > 0) {
			let queue = [land[0].idx]
			window.world.landmarks[idx] = {
				type: "continent",
				size: 0,
				water: false,
				cell: land[0].idx,
			}
			// floodfill all connecting land cells
			while (queue.length > 0) {
				const current = window.world.cells[queue.shift()]
				current.landmark = idx
				current.isWater = false
				const water = CELL.neighbors(current).filter(
					(p) => p.h < WORLD.elevation.seaLevel,
				)
				current.isCoast = water.length > 0
				const ocean = water.filter((cell) => cell.ocean)
				current.beach = ocean.length > 0
				// mark neighboring water cells as shallow
				water.forEach((i) => (i.shallow = true))
				// add neighboring land cells to the queue
				queue = queue.concat(
					CELL.neighbors(current)
						.filter(
							(p) =>
								p.h >= WORLD.elevation.seaLevel &&
								!p.landmark &&
								!queue.includes(p.idx),
						)
						.map((p) => p.idx),
				)
			}
			// classify by size
			const body = land.filter((poly) => poly.landmark === idx)
			const landmark = window.world.landmarks[idx]
			landmark.size = body.length
			if (landmark.size / total < 0.001) landmark.type = "isle"
			else if (landmark.size / total < 0.01) landmark.type = "island"
			// only consider cells that haven't been marked
			land = land.filter((poly) => !poly.landmark)
			idx += 1
		}
		WORLD.cells.reshape()
		// assign parents and handle isles/inland seas
		LANDMARKS._assignParents()
		WORLD.cells.reshape()
	},
	water: (idx: number) => {
		let water = WORLD.cells.water()
		const total = window.world.cells.length
		// iterate through all contiguous water bodies
		while (water.length > 0) {
			let queue = [water[0].idx]
			window.world.landmarks[idx] = {
				size: 0,
				type: "ocean",
				water: true,
				cell: water[0].idx,
			}
			// floodfill all connecting water cells
			while (queue.length > 0) {
				const current = window.world.cells[queue.shift()]
				current.landmark = idx
				current.isWater = true
				current.ocean = true
				queue = queue.concat(
					CELL.neighbors(current)
						.filter(
							(p) =>
								p.h < WORLD.elevation.seaLevel &&
								!p.landmark &&
								!queue.includes(p.idx),
						)
						.map((n) => n.idx),
				)
			}
			// classify by size
			const body = water.filter((poly) => poly.landmark === idx)
			const landmark = window.world.landmarks[idx]
			landmark.size = body.length
			if (landmark.size / total < 0.001) {
				landmark.type = "lake"
				body.forEach((p) => (p.ocean = false))
			} else if (landmark.size / total < 0.01) {
				landmark.type = "sea"
				body.forEach((p) => (p.ocean = false))
			}
			// only consider cells that haven't been marked
			water = water.filter((poly) => !poly.landmark)
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
						p.h = 0
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
