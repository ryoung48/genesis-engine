import { WORLD } from "../.."
import { CELL } from "../../cells"
import { SHAPER_CONTINENTS } from "../continents"
import { LANDMARKS as SHAPER_LANDMARKS } from "../continents/landmarks"
import { OCEANS as SHAPER_OCEANS } from "../continents/oceans"
import { SHAPER_MOUNTAINS } from "../topagraphy"
import { RegionBorders } from "../topagraphy/types"

export const SHAPER_HEIGHTMAP = {
	continents: (heightmap: ImageData, seaLevel: number) => {
		SHAPER_CONTINENTS._setup()

		const { width, height, data } = heightmap
		let land = 0
		window.world.cells.forEach((cell) => {
			const lon = cell.x
			const lat = cell.y

			let px = Math.floor((((lon + 180) % 360) / 360) * width)
			let py = Math.floor(((90 - lat) / 180) * height)

			px = Math.max(0, Math.min(width - 1, px))
			py = Math.max(0, Math.min(height - 1, py))

			const index = (py * width + px) * 4
			const r = data[index]
			const g = data[index + 1]
			const b = data[index + 2]

			const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255

			if (brightness >= seaLevel) {
				const landRatio = (brightness - seaLevel) / (1 - seaLevel || 1)
				cell.elevation =
					WORLD.elevation.seaLevel +
					landRatio * (WORLD.elevation.max - WORLD.elevation.seaLevel)
				land++
			} else {
				const waterRatio = brightness / (seaLevel || 1)
				cell.elevation = waterRatio * WORLD.elevation.seaLevel
			}
		})

		console.log(
			`land ratio from heightmap: ${land / window.world.cells.length}`,
		)

		const idx = SHAPER_LANDMARKS.water(1)
		SHAPER_LANDMARKS.land(idx)
		SHAPER_CONTINENTS._coastalDistances()
		SHAPER_OCEANS.build()
	},
	topography: () => {
		const mountainProspects: RegionBorders = {}
		const regionBorders: RegionBorders = {}
		SHAPER_MOUNTAINS._centers()
		SHAPER_MOUNTAINS._spheres(mountainProspects, regionBorders)

		WORLD.cells.land().forEach((l) => {
			if (l.elevation > WORLD.elevation.mountains) {
				l.isMountains = true
			}
			l.highlandDist = -1
		})

		let idx = window.world.mountains.length
		let mountains = WORLD.cells.land().filter((p) => p.isMountains)
		while (mountains.length > 0) {
			let queue = [mountains[0].idx]
			window.world.mountains.push({ size: 0, cell: mountains[0].idx })
			while (queue.length > 0) {
				const current = window.world.cells[queue.shift()!]
				current.mountain = idx
				window.world.mountains[idx].size += 1
				queue = queue.concat(
					CELL.neighbors(current)
						.filter(
							(p) =>
								p.isMountains &&
								p.mountain === undefined &&
								!queue.includes(p.idx),
						)
						.map((p) => p.idx),
				)
			}
			mountains = mountains.filter((p) => p.mountain === undefined)
			idx += 1
		}

		const queue = WORLD.cells.land().filter((p) => p.isMountains || p.plateau)
		queue.forEach((c) => {
			c.highlandDist = 0
		})
		while (queue.length > 0) {
			const curr = queue.shift()!
			CELL.neighbors(curr)
				.filter((n) => n.highlandDist === -1 && !n.ocean)
				.forEach((n) => {
					n.highlandDist = curr.highlandDist + 1
					queue.push(n)
				})
		}
	},
}
