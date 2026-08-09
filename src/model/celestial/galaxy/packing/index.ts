import type {
	GalaxyPacking,
	GalaxyPackingParams,
} from "@/model/celestial/galaxy/packing/types"
import { RNG } from "@/model/shared/random/rng"

const MAX_PLACEMENT_TRIES = 30

/**
 * Poisson-disc-ish rejection sampling of `size` points in an annulus around
 * the canvas center, using a uniform spatial hash grid for neighbor lookups.
 * Ported from galaxy-gen's SCALED_GALAXY.spawn point-placement step -- kept
 * as its own module (rather than inlined in the orchestrator) so packing can
 * change independently of topology/system generation (axiomatic
 * independence -- see plans/galaxy-view-port.md).
 */
function place({
	size,
	seed,
	radius,
	dimensions,
}: GalaxyPackingParams): GalaxyPacking {
	const rng = RNG.createRng({ seed })
	const { w, h } = dimensions
	const cx = w / 2
	const cy = h / 2

	const r_xy = new Float32Array(2 * size)
	const r_edge = new Uint8Array(size)

	const annularArea = Math.PI * (radius.max ** 2 - radius.min ** 2)
	const minDist = 0.55 * Math.sqrt(annularArea / size)
	const minDist2 = minDist * minDist

	const cellSize = minDist
	const gridW = Math.ceil(w / cellSize) + 2
	const gridCells = new Map<number, number[]>()
	const cellKey = (gx: number, gy: number) => gy * gridW + gx

	const addToGrid = (idx: number, x: number, y: number) => {
		const key = cellKey(Math.floor(x / cellSize), Math.floor(y / cellSize))
		const bucket = gridCells.get(key)
		if (bucket) bucket.push(idx)
		else gridCells.set(key, [idx])
	}

	const tooClose = (x: number, y: number, placedCount: number): boolean => {
		const gx = Math.floor(x / cellSize)
		const gy = Math.floor(y / cellSize)
		for (let dy = -2; dy <= 2; dy++) {
			for (let dx = -2; dx <= 2; dx++) {
				const bucket = gridCells.get(cellKey(gx + dx, gy + dy))
				if (!bucket) continue
				for (const idx of bucket) {
					if (idx >= placedCount) continue
					const ex = r_xy[2 * idx]! - x
					const ey = r_xy[2 * idx + 1]! - y
					if (ex * ex + ey * ey < minDist2) return true
				}
			}
		}
		return false
	}

	for (let i = 0; i < size; i++) {
		let x = cx
		let y = cy
		for (let attempt = 0; attempt < MAX_PLACEMENT_TRIES; attempt++) {
			const r = Math.sqrt(
				rng.random() * (radius.max ** 2 - radius.min ** 2) + radius.min ** 2,
			)
			const angle = rng.uniform(0, 2 * Math.PI)
			x = cx + r * Math.cos(angle)
			y = cy + r * Math.sin(angle)
			if (!tooClose(x, y, i)) break
		}
		r_xy[2 * i] = x
		r_xy[2 * i + 1] = y
		addToGrid(i, x, y)

		const dx = x - cx
		const dy = y - cy
		const dist = Math.hypot(dx, dy)
		r_edge[i] = dist > radius.max || dist < radius.min ? 1 : 0
	}

	return { r_xy, r_edge }
}

export const GALAXY_PACKING = { place }
