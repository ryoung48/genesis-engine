import { describe, expect, it } from "vitest"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { SEABED } from "@/model/geography/terrain/seabed"
import { SEABED_HABITAT } from "@/model/geography/terrain/seabed/habitat"
import type { SeabedComputeParams } from "@/model/geography/terrain/seabed/types"
import { SEABED_CONFIG } from "@/model/geography/terrain/seabed-config"
import type { GenesisWorld } from "@/model/pipelines/types"
import { cachedWorld } from "@/test/tectonics/world-cache"

const SEEDS = [14963991, 20251107, 77031]
const TIMEOUT_MS = 600_000

function paramsOf(world: GenesisWorld): SeabedComputeParams {
	const { shore } = world
	if (!shore) throw new Error("world has no shore layer")
	return {
		mesh: world.mesh,
		isLand: world.isLand,
		openWater: LANDMARKS.openWaterMask({
			isLand: world.isLand,
			landmarks: world.landmarks,
		}),
		elevationKm: world.elevation_km,
		planetRadiusKm: world.params.planetRadiusKm,
		flow: world.rivers.flow,
		shore,
		climate: world.climate,
		iceMinMonthly: world.iceMinMonthly,
		iceMaxMonthly: world.iceMaxMonthly,
	}
}

function sameArray(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
	if (a.length !== b.length) return false
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
	return true
}

describe("seabed on generated worlds", () => {
	it(
		"habitat and share sit only on reached open-water cells, and shares stay in range",
		() => {
			for (const seed of SEEDS) {
				const world = cachedWorld(seed)
				const { seabed } = world
				if (!seabed) throw new Error("world has no seabed layers")
				const { openWater } = paramsOf(world)
				let habitat = 0
				for (let r = 0; r < world.mesh.numRegions; r++) {
					expect(seabed.share[r]).toBeLessThanOrEqual(100)
					if (!openWater[r]) {
						expect(seabed.habitat[r]).toBe(0)
						expect(seabed.share[r]).toBe(0)
					}
					if (seabed.habitat[r] > 0) {
						habitat++
						expect(seabed.share[r]).toBeGreaterThanOrEqual(
							SEABED_CONFIG.shareMinPercent,
						)
						expect(seabed.substrate[r]).toBeGreaterThan(0)
					}
				}
				expect(habitat).toBeGreaterThan(0)
				expect(world.seabedStats?.habitat.coral).toBeGreaterThan(0)
			}
		},
		TIMEOUT_MS,
	)

	it(
		"recomputing from the world's own layers gives the same result and mutates no input",
		() => {
			const world = cachedWorld(SEEDS[0])
			const params = paramsOf(world)
			const before = {
				elevation: Float32Array.from(params.elevationKm),
				flow: Float32Array.from(params.flow),
				material: Uint8Array.from(params.shore.material),
				lee: Float32Array.from(params.shore.exposureLeeM),
				temperature: Float32Array.from(params.climate.temperature_monthly),
			}
			const again = SEABED.compute(params)
			expect(sameArray(again.layers.habitat, world.seabed?.habitat ?? [])).toBe(
				true,
			)
			expect(sameArray(again.layers.share, world.seabed?.share ?? [])).toBe(
				true,
			)
			expect(sameArray(params.elevationKm, before.elevation)).toBe(true)
			expect(sameArray(params.flow, before.flow)).toBe(true)
			expect(sameArray(params.shore.material, before.material)).toBe(true)
			expect(sameArray(params.shore.exposureLeeM, before.lee)).toBe(true)
			expect(
				sameArray(params.climate.temperature_monthly, before.temperature),
			).toBe(true)
		},
		TIMEOUT_MS,
	)

	it(
		"coral and kelp cells match their own temperature gates",
		() => {
			const world = cachedWorld(SEEDS[0])
			const { seabed } = world
			if (!seabed) throw new Error("world has no seabed layers")
			const n = world.mesh.numRegions
			for (let r = 0; r < n; r++) {
				if (seabed.habitat[r] === 0) continue
				let coldest = Infinity
				let warmest = -Infinity
				for (let m = 0; m < 12; m++) {
					const t = world.climate.temperature_monthly[m * n + r]
					coldest = Math.min(coldest, t)
					warmest = Math.max(warmest, t)
				}
				if (seabed.habitat[r] === SEABED_HABITAT.habitatCode.coral)
					expect(coldest).toBeGreaterThanOrEqual(SEABED_CONFIG.coralMinColdC)
				if (seabed.habitat[r] === SEABED_HABITAT.habitatCode.kelp)
					expect(warmest).toBeLessThanOrEqual(SEABED_CONFIG.kelpMaxWarmC)
			}
		},
		TIMEOUT_MS,
	)
})
