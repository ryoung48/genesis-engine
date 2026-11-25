import { beforeAll, describe, expect, it } from "vitest"
import { CAVES } from "@/model/geography/terrain/caves"
import { SPRINGS } from "@/model/geography/terrain/groundwater/springs"
import { KARST } from "@/model/geography/terrain/karst"
import { KARST_CAVES } from "@/model/geography/terrain/karst-caves"
import { ROCKS } from "@/model/geography/terrain/rocks"
import type { GenesisWorld } from "@/model/pipelines/types"
import { cachedWorld, generateWorld } from "@/test/tectonics/world-cache"

const SEED = 14963991
const TIMEOUT_MS = 600_000
const RELATIVE = 1e-9

const BASELINE = {
	rock: 12645884,
	youngKind: 1652691,
	glaciated: 30225,
	soilFertility: 1618310.9521834096,
	elevation: -21346146.104027674,
	waterTable: 530979929.59488523,
	spring: 273277,
	shoreLabel: 2419222,
}

function sum(values: ArrayLike<number>): number {
	let total = 0
	for (let i = 0; i < values.length; i++) total += values[i] * ((i % 97) + 1)
	return total
}

function relativeError(value: number, expected: number): number {
	return Math.abs(value / expected - 1)
}

function sameArray(a: ArrayLike<number>, b: ArrayLike<number>): boolean {
	if (a.length !== b.length) return false
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
	return true
}

function layers(world: GenesisWorld) {
	const { karst, caveSites, karstStats, bedrock, rock, groundwater } = world
	if (!karst || !caveSites || !karstStats || !bedrock || !rock || !groundwater)
		throw new Error("world has no karst layers")
	return { karst, caveSites, karstStats, bedrock, rock, groundwater }
}

let world: GenesisWorld

describe("karst and caves on a generated world", () => {
	beforeAll(() => {
		world = cachedWorld(SEED)
	}, TIMEOUT_MS)

	it("leaves the existing surface, water and shore layers unchanged", () => {
		const { rock, groundwater } = layers(world)
		const { youngKind, glaciated, soilFertility, shore } = world
		if (!youngKind || !glaciated || !soilFertility || !shore)
			throw new Error("world has no surface layers")
		expect(sum(rock)).toBe(BASELINE.rock)
		expect(sum(youngKind)).toBe(BASELINE.youngKind)
		expect(sum(glaciated)).toBe(BASELINE.glaciated)
		expect(
			relativeError(sum(soilFertility), BASELINE.soilFertility),
		).toBeLessThan(RELATIVE)
		expect(
			relativeError(sum(world.elevation_km), BASELINE.elevation),
		).toBeLessThan(RELATIVE)
		expect(
			relativeError(sum(groundwater.waterTableM), BASELINE.waterTable),
		).toBeLessThan(RELATIVE)
		expect(sum(groundwater.spring)).toBe(BASELINE.spring)
		expect(sum(shore.label)).toBe(BASELINE.shoreLabel)
	})

	it("keeps bedrock equal to rock off young sediment and never young under land", () => {
		const { bedrock, rock } = layers(world)
		let youngLand = 0
		for (let r = 0; r < rock.length; r++) {
			if (!world.isLand[r]) continue
			if (rock[r] !== ROCKS.code.young) expect(bedrock[r]).toBe(rock[r])
			else youngLand++
			expect(bedrock[r]).toBeGreaterThan(0)
		}
		expect(youngLand).toBeGreaterThan(0)
	})

	it("gives every land region one class and every other region none", () => {
		const { karst } = layers(world)
		for (let r = 0; r < world.isLand.length; r++) {
			if (!world.isLand[r]) {
				expect(karst.kind[r]).toBe(0)
				expect(karst.karstClass[r]).toBe(KARST_CAVES.classCode.none)
				continue
			}
			expect(karst.karstClass[r]).toBeLessThan(KARST_CAVES.classes.length)
			expect(karst.kind[r]).toBeLessThan(KARST.kinds.length)
			expect(karst.activity[r]).toBeLessThan(KARST.activities.length)
		}
	})

	it("has potentials inside 0..1, no NaN, and activity only where there is karst", () => {
		const { karst } = layers(world)
		for (let r = 0; r < karst.potential.length; r++) {
			expect(Number.isNaN(karst.potential[r])).toBe(false)
			expect(karst.potential[r]).toBeGreaterThanOrEqual(0)
			expect(karst.potential[r]).toBeLessThanOrEqual(1)
			if (karst.kind[r] === 0) expect(karst.activity[r]).toBe(0)
			else expect(karst.activity[r]).toBeGreaterThan(0)
		}
	})

	it("marks karst regions as springs exactly where groundwater has a karst spring", () => {
		const { karst, groundwater } = layers(world)
		let springs = 0
		for (let r = 0; r < karst.kind.length; r++) {
			if (karst.kind[r] === 0) continue
			const isSpring = KARST.activities[karst.activity[r]] === "spring"
			expect(isSpring).toBe(groundwater.spring[r] === SPRINGS.code.karst)
			if (isSpring) springs++
		}
		expect(springs).toBeGreaterThan(0)
	})

	it("places sites on land regions, sorted, with finite lengths and unit positions", () => {
		const { caveSites } = layers(world)
		expect(caveSites.region.length).toBeGreaterThan(0)
		for (let i = 0; i < caveSites.region.length; i++) {
			expect(world.isLand[caveSites.region[i]]).toBe(1)
			expect(caveSites.type[i]).toBeLessThan(CAVES.types.length)
			expect(caveSites.lengthM[i]).toBeGreaterThan(0)
			expect(Number.isFinite(caveSites.lengthM[i])).toBe(true)
			expect(
				Math.hypot(
					caveSites.xyz[3 * i],
					caveSites.xyz[3 * i + 1],
					caveSites.xyz[3 * i + 2],
				),
			).toBeCloseTo(1, 4)
			if (i > 0)
				expect(caveSites.region[i] * 16 + caveSites.type[i]).toBeGreaterThan(
					caveSites.region[i - 1] * 16 + caveSites.type[i - 1],
				)
		}
	})

	it("reports shares that sum to 1 and a stage time", () => {
		const { karstStats } = layers(world)
		expect(karstStats.landRegions).toBeGreaterThan(0)
		for (const shares of [
			karstStats.kindShare,
			karstStats.classShare,
			karstStats.activityShare,
		])
			expect(Object.values(shares).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6)
		expect(karstStats.stageMs).toBeGreaterThan(0)
	})

	it(
		"builds the same layers twice from one seed",
		() => {
			const a = layers(world)
			const b = layers(generateWorld({ seed: SEED }))
			expect(sameArray(a.karst.kind, b.karst.kind)).toBe(true)
			expect(sameArray(a.karst.karstClass, b.karst.karstClass)).toBe(true)
			expect(sameArray(a.karst.potential, b.karst.potential)).toBe(true)
			expect(sameArray(a.caveSites.region, b.caveSites.region)).toBe(true)
			expect(sameArray(a.caveSites.xyz, b.caveSites.xyz)).toBe(true)
			expect(sameArray(a.caveSites.lengthM, b.caveSites.lengthM)).toBe(true)
		},
		TIMEOUT_MS,
	)
})
