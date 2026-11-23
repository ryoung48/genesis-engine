import { describe, expect, it } from "vitest"
import { ARC_CRUST } from "@/model/geography/terrain/arc-crust"
import { GENERATE_WORLD } from "@/model/pipelines/generate-world"
import type { GenesisWorld } from "@/model/pipelines/types"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"

const SEEDS = [14963991, 20251107, 77031]
const ARC_MIN_RATE_CM_YR = 2
const ARC_MIN_SLAB_MYR = 15
const ARC_MATURE_CONSUMED_KM = 1000
const ARC_NEAR_KM = 500
const ARC_FAR_KM = 1800
const ARC_AGE_MYR_MAX = 120
const ARC_AGE_MYR_MIN = 25 * 0.15
const BACK_ARC_AGE_MYR_MAX = 30
const SUNDA_MAX = 2
const BACK_ARC_MAX_CHANCE = 0.85

function worldFor(seed: number): GenesisWorld {
	return GENERATE_WORLD.generateGenesisWorld({
		params: { seed, ...DEFAULT_WORLD_PARAMS, tideLock: null },
	})
}

function kmToContinent(world: GenesisWorld): Float64Array {
	const { mesh, params, arcRun } = world
	const { numRegions, adjOffset, adjList, neighborDist } = mesh
	const plates = arcRun!.motion.plates
	const km = new Float64Array(numRegions).fill(Infinity)
	const order: number[] = []
	for (let c = 0; c < numRegions; c++) {
		if (plates.isOcean.has(plates.cellPlate[c])) continue
		km[c] = 0
		order.push(c)
	}
	for (let head = 0; head < order.length; head++) {
		const c = order[head]
		if (km[c] > ARC_FAR_KM) continue
		for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
			const chord = 2 * Math.asin(Math.min(1, neighborDist[k] / 2))
			const nd = km[c] + chord * params.planetRadiusKm
			if (nd < km[adjList[k]]) {
				km[adjList[k]] = nd
				order.push(adjList[k])
			}
		}
	}
	return km
}

const worlds = new Map<number, GenesisWorld>()
function cachedWorld(seed: number): GenesisWorld {
	let world = worlds.get(seed)
	if (!world) {
		world = worldFor(seed)
		worlds.set(seed, world)
	}
	return world
}

describe("arc crust", () => {
	it("cuts arcs only where the slab is fast and old, and likelier near continents", () => {
		let nearKept = 0
		let nearAll = 0
		let farKept = 0
		let farAll = 0
		for (const seed of SEEDS) {
			const world = cachedWorld(seed)
			const run = world.arcRun!
			const { fronts, seaAgeMyr, crust, motion } = run
			const contKm = kmToContinent(world)
			const plates = motion.plates
			let sunda = 0
			for (const report of crust.reports) {
				const front = fronts.subduction.find((f) => f.id === report.id)!
				const kept = new Set(report.arcSources)
				if (report.sunda) sunda++
				expect(report.splitChance).toBeGreaterThanOrEqual(0)
				expect(report.splitChance).toBeLessThanOrEqual(BACK_ARC_MAX_CHANCE)
				if (report.splitSources.length)
					expect(report.splitChance).toBeGreaterThan(0)
				const passing = new Set<number>()
				for (const edge of front.edges) {
					const overA = fronts.edges.overA[edge] === 1
					const over = overA
						? fronts.edges.cellA[edge]
						: fronts.edges.cellB[edge]
					const down = overA
						? fronts.edges.cellB[edge]
						: fronts.edges.cellA[edge]
					if (!plates.isOcean.has(plates.cellPlate[over])) continue
					const rate = fronts.edges.closingCmYr[edge]
					const passes =
						rate * 10 * front.activeMyr > ARC_MATURE_CONSUMED_KM &&
						rate >= ARC_MIN_RATE_CM_YR &&
						seaAgeMyr[down] >= ARC_MIN_SLAB_MYR
					if (!passes || passing.has(over)) continue
					passing.add(over)
					const isKept = kept.has(over) ? 1 : 0
					if (contKm[over] < ARC_NEAR_KM) {
						nearAll++
						nearKept += isKept
					} else if (contKm[over] > ARC_FAR_KM) {
						farAll++
						farKept += isKept
					}
				}
				for (const cell of kept) expect(passing.has(cell)).toBe(true)
			}
			expect(sunda).toBeLessThanOrEqual(SUNDA_MAX)
			for (let c = 0; c < world.mesh.numRegions; c++) {
				const type = crust.crustType[c]
				if (type === ARC_CRUST.CRUST.ARC) {
					expect(crust.formedAtMyr[c]).toBeLessThan(0)
				}
				if (
					type === ARC_CRUST.CRUST.OCEAN &&
					crust.formedAtMyr[c] < 0 &&
					crust.shelfSea[c] === 0 &&
					crust.sundaDeep[c] === 0
				) {
					expect(-crust.formedAtMyr[c]).toBeLessThanOrEqual(
						BACK_ARC_AGE_MYR_MAX,
					)
				}
			}
		}
		expect(nearAll + farAll).toBeGreaterThan(0)
		if (nearAll >= 20 && farAll >= 20)
			expect(nearKept / nearAll).toBeGreaterThan(farKept / farAll)
	}, 600_000)

	it("keeps arc ages in range and stays deterministic", () => {
		const world = cachedWorld(SEEDS[0])
		const run = world.arcRun!
		for (let c = 0; c < world.mesh.numRegions; c++) {
			if (
				run.crust.crustType[c] !== ARC_CRUST.CRUST.ARC ||
				!run.motion.plates.isOcean.has(run.motion.plates.cellPlate[c])
			)
				continue
			const age = -run.crust.formedAtMyr[c]
			expect(age).toBeGreaterThanOrEqual(ARC_AGE_MYR_MIN - 1e-3)
			expect(age).toBeLessThanOrEqual(ARC_AGE_MYR_MAX + 1e-3)
		}
		const again = ARC_CRUST.run({
			mesh: world.mesh,
			planetRadiusKm: world.params.planetRadiusKm,
			seed: world.params.seed,
			plates: run.motion.plates,
		})
		expect(
			Buffer.from(again.crust.crustType.buffer).equals(
				Buffer.from(run.crust.crustType.buffer),
			),
		).toBe(true)
		expect(
			Buffer.from(again.crust.formedAtMyr.buffer).equals(
				Buffer.from(run.crust.formedAtMyr.buffer),
			),
		).toBe(true)
		expect(
			Buffer.from(again.crust.shelfSea.buffer).equals(
				Buffer.from(run.crust.shelfSea.buffer),
			),
		).toBe(true)
	}, 600_000)
})
