import { describe, expect, it } from "vitest"
import { PLATE_MOTION } from "@/model/geography/tectonics/plate-motion"
import type { SimFrontKind } from "@/model/geography/tectonics/world-sample/types"
import { GENERATE_WORLD } from "@/model/pipelines/generate-world"
import type { GenesisWorld } from "@/model/pipelines/types"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"

const SEEDS = [14963991, 20251107, 77031]
const RMS_PLATE_SPEED_CM_YR = 4
const FRONT_MIN_CELLS = 3
const ACTIVE_MYR: Record<SimFrontKind, [number, number]> = {
	ridge: [0, 0],
	subduction: [40, 140],
	collision: [8, 45],
	rift: [3, 25],
	transform: [5, 25],
}

const worlds = new Map<number, GenesisWorld>()
function cachedWorld(seed: number): GenesisWorld {
	let world = worlds.get(seed)
	if (!world) {
		world = GENERATE_WORLD.generateGenesisWorld({
			params: { seed, ...DEFAULT_WORLD_PARAMS, tideLock: null },
		})
		worlds.set(seed, world)
	}
	return world
}

describe("present tectonics: motion and fronts", () => {
	for (const seed of SEEDS) {
		it(`scales plate speeds to the RMS target (seed ${seed})`, () => {
			const world = cachedWorld(seed)
			const { mesh } = world
			const { motion } = world.presentTectonics!
			let weighted = 0
			let area = 0
			for (let r = 0; r < mesh.numRegions; r++) {
				const v = PLATE_MOTION.velocityCmYr({
					motion,
					plate: motion.plates.cellPlate[r],
					x: mesh.r_xyz[3 * r],
					y: mesh.r_xyz[3 * r + 1],
					z: mesh.r_xyz[3 * r + 2],
				})
				weighted += mesh.regionArea[r] * (v[0] ** 2 + v[1] ** 2 + v[2] ** 2)
				area += mesh.regionArea[r]
			}
			expect(Math.sqrt(weighted / area)).toBeCloseTo(RMS_PLATE_SPEED_CM_YR, 1)
		})

		it(`classifies fronts consistently (seed ${seed})`, () => {
			const world = cachedWorld(seed)
			const { simFronts, fronts } = world.presentTectonics!
			const counts: Record<string, number> = {}
			for (const front of simFronts) {
				counts[front.kind] = (counts[front.kind] ?? 0) + 1
				expect(front.cells.length).toBeGreaterThanOrEqual(FRONT_MIN_CELLS)
				const [lo, hi] = ACTIVE_MYR[front.kind]
				expect(front.activeMyr).toBeGreaterThanOrEqual(lo)
				expect(front.activeMyr).toBeLessThanOrEqual(hi)
				if (front.kind === "ridge" || front.kind === "rift")
					expect(front.rateCmYr).toBeLessThan(0)
				if (front.kind === "subduction" || front.kind === "collision")
					expect(front.rateCmYr).toBeGreaterThan(0)
				if (front.kind === "subduction")
					expect([front.plateA, front.plateB]).toContain(front.overPlate)
			}
			expect(counts.ridge).toBeGreaterThan(0)
			expect(counts.subduction).toBeGreaterThan(0)
			expect(fronts.edges.count).toBeGreaterThan(0)
		})

		it(`shares an active time with the arc stage's front (seed ${seed})`, () => {
			const world = cachedWorld(seed)
			const { fronts } = world.presentTectonics!
			const arcFronts = world.arcRun!.fronts.subduction
			const superOf = new Map<number, number>()
			const superCell = world.arcRun!.motion.plates.cellPlate
			const coarseCell = world.presentTectonics!.motion.plates.cellPlate
			for (let r = 0; r < world.mesh.numRegions; r++)
				if (!superOf.has(coarseCell[r]))
					superOf.set(coarseCell[r], superCell[r])
			let shared = 0
			for (const front of fronts.subduction) {
				const a = superOf.get(front.pa)
				const b = superOf.get(front.pb)
				if (a === undefined || b === undefined || a === b) continue
				const arc = arcFronts.find(
					(f) => f.pa === Math.min(a, b) && f.pb === Math.max(a, b),
				)
				if (!arc) continue
				expect(front.activeMyr).toBe(arc.activeMyr)
				shared++
			}
			expect(shared).toBeGreaterThan(0)
		})
	}
})
