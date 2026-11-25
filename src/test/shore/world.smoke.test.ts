import { describe, expect, it } from "vitest"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { SHORE } from "@/model/geography/terrain/shore"
import { SHORE_EXPOSURE } from "@/model/geography/terrain/shore/exposure"
import { SHORE_MATERIAL } from "@/model/geography/terrain/shore/material"
import type { ShoreLayers } from "@/model/geography/terrain/shore/types"
import type { GenesisWorld } from "@/model/pipelines/types"
import { cachedWorld, generateWorld } from "@/test/tectonics/world-cache"

const SEEDS = [14963991, 20251107, 77031]
const TIMEOUT_MS = 600_000
const SAMPLES = 200

function sameArray(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
	if (a.length !== b.length) return false
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
	return true
}

function shoreOf(world: GenesisWorld): ShoreLayers {
	if (!world.shore) throw new Error("world has no shore layers")
	return world.shore
}

function coastalMaskOf(world: GenesisWorld): Uint8Array {
	const openWater = LANDMARKS.openWaterMask({
		isLand: world.isLand,
		landmarks: world.landmarks,
	})
	return LANDMARKS.coastalLandMask({
		mesh: world.mesh,
		isLand: world.isLand,
		openWater,
	})
}

describe("shoreline on generated worlds", () => {
	it(
		"labels 1-11 appear exactly on coastal land regions",
		() => {
			for (const seed of SEEDS) {
				const world = cachedWorld(seed)
				const shore = shoreOf(world)
				const coastal = coastalMaskOf(world)
				let count = 0
				for (let r = 0; r < world.mesh.numRegions; r++) {
					expect(shore.label[r] > 0).toBe(coastal[r] === 1)
					expect(shore.label[r]).toBeLessThan(SHORE.labels.length)
					count += coastal[r]
				}
				expect(count).toBeGreaterThan(0)
				expect(world.shoreStats?.coastalRegions).toBe(count)
			}
		},
		TIMEOUT_MS,
	)

	it(
		"black sand labels sit exactly on flagged coasts that are not marsh, flat, delta or ice",
		() => {
			for (const seed of SEEDS) {
				const world = cachedWorld(seed)
				const shore = shoreOf(world)
				for (let r = 0; r < world.mesh.numRegions; r++) {
					if (SHORE.labels[shore.label[r]] === "blackSandBeach")
						expect(shore.volcanicSand[r]).toBe(1)
					if (shore.volcanicSand[r]) {
						expect(shore.material[r]).not.toBe(SHORE_MATERIAL.code.ice)
						expect(SHORE.labels[shore.label[r]]).toMatch(
							/^(blackSandBeach|mangroveCoast|saltMarshCoast|tidalFlat|deltaCoast|estuaryCoast)$/,
						)
					}
				}
			}
		},
		TIMEOUT_MS,
	)

	it(
		"labels follow the priority recomputed from the layers",
		() => {
			for (const seed of SEEDS) {
				const world = cachedWorld(seed)
				const shore = shoreOf(world)
				const coastal: number[] = []
				for (let r = 0; r < world.mesh.numRegions; r++)
					if (shore.label[r] > 0) coastal.push(r)
				const stride = Math.max(1, Math.floor(coastal.length / SAMPLES))
				for (let i = 0; i < coastal.length; i += stride) {
					const r = coastal[i]
					expect(
						SHORE.labelOf({
							material: shore.material[r],
							volcanicSand: shore.volcanicSand[r] === 1,
							relief: shore.relief[r],
							openClass: SHORE_EXPOSURE.classOf({
								exposureM: shore.exposureOpenM[r],
							}),
							habitat: shore.habitat[r],
							setting: shore.setting[r],
						}),
					).toBe(shore.label[r])
				}
			}
		},
		TIMEOUT_MS,
	)

	it(
		"exposure is finite, lee never exceeds open, and stats add up",
		() => {
			for (const seed of SEEDS) {
				const world = cachedWorld(seed)
				const shore = shoreOf(world)
				const stats = world.shoreStats
				if (!stats) throw new Error("world has no shore stats")
				for (let r = 0; r < world.mesh.numRegions; r++) {
					expect(Number.isFinite(shore.exposureOpenM[r])).toBe(true)
					expect(shore.exposureLeeM[r]).toBeLessThanOrEqual(
						shore.exposureOpenM[r],
					)
				}
				const total = Object.values(stats.label).reduce((a, b) => a + b, 0)
				expect(total).toBe(stats.coastalRegions)
				expect(stats.label.none).toBe(0)
			}
		},
		TIMEOUT_MS,
	)

	it(
		"every coastal wetland share comes from a region the shore layer calls coastal",
		() => {
			for (const seed of SEEDS) {
				const world = cachedWorld(seed)
				const shore = shoreOf(world)
				const g = world.groundwater
				if (!g) throw new Error("world has no groundwater")
				for (let r = 0; r < world.mesh.numRegions; r++)
					if (g.wetCoast[r] > 0) expect(shore.label[r]).toBeGreaterThan(0)
			}
		},
		TIMEOUT_MS,
	)

	it(
		"two builds of one seed give identical shore, relief, climate and surface layers",
		() => {
			const first = cachedWorld(SEEDS[0])
			const second = generateWorld({ seed: SEEDS[0] })
			const a = shoreOf(first)
			const b = shoreOf(second)
			for (const key of Object.keys(a) as Array<keyof ShoreLayers>)
				expect(sameArray(a[key], b[key])).toBe(true)
			expect(sameArray(first.elevation_km, second.elevation_km)).toBe(true)
			expect(sameArray(first.rivers.flow, second.rivers.flow)).toBe(true)
			expect(
				sameArray(
					first.climate.temperature_monthly,
					second.climate.temperature_monthly,
				),
			).toBe(true)
			expect(sameArray(first.rock ?? [], second.rock ?? [])).toBe(true)
		},
		TIMEOUT_MS,
	)
})
