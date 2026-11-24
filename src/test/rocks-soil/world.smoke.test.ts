import { beforeAll, describe, expect, it } from "vitest"
import { PASTA } from "@/model/climate/classification/pasta"
import { ROCKS } from "@/model/geography/terrain/rocks"
import { SOILS } from "@/model/geography/terrain/soils"
import type { GenesisWorld } from "@/model/pipelines/types"
import { cachedWorld, generateWorld } from "@/test/tectonics/world-cache"

const SEED = 77031
const MIN_KIND_SHARE = 0.0001
const MAX_ISOLATED_SHARE = 0.05

let world: GenesisWorld

function surface() {
	const { rock, youngKind, glaciated, soilFertility } = world
	if (!rock || !youngKind || !glaciated || !soilFertility)
		throw new Error("world has no surface layers")
	return { rock, youngKind, glaciated, soilFertility }
}

describe("rocks and soil on a generated world", () => {
	beforeAll(() => {
		world = cachedWorld(SEED)
	}, 300_000)

	it("gives every land region a land rock and every other region the sea", () => {
		const { rock } = surface()
		for (let r = 0; r < world.isLand.length; r++) {
			if (world.isLand[r]) expect(rock[r]).toBeGreaterThan(0)
			else expect(rock[r]).toBe(ROCKS.code.sea)
		}
	})

	it("shows each of the thirteen land kinds, with young sediment carrying its tag", () => {
		const { rock, youngKind } = surface()
		const seen = new Set<number>()
		let land = 0
		const counts = new Map<number, number>()
		for (let r = 0; r < rock.length; r++) {
			if (!world.isLand[r]) continue
			land++
			counts.set(rock[r], (counts.get(rock[r]) ?? 0) + 1)
			if (rock[r] === ROCKS.code.young) seen.add(youngKind[r])
			else expect(youngKind[r]).toBe(0)
		}
		const kinds = ROCKS.kinds.filter((k) => k !== "sea")
		for (const kind of kinds)
			expect((counts.get(ROCKS.code[kind]) ?? 0) / land, kind).toBeGreaterThan(
				MIN_KIND_SHARE,
			)
		expect(seen.has(ROCKS.youngCode.river)).toBe(true)
	})

	it("leaves few isolated one-region patches after despeckling", () => {
		const { rock } = surface()
		const { adjOffset, adjList } = world.mesh
		let land = 0
		let isolated = 0
		for (let r = 0; r < rock.length; r++) {
			if (!world.isLand[r]) continue
			land++
			let same = 0
			let landNeighbors = 0
			for (let k = adjOffset[r]; k < adjOffset[r + 1]; k++) {
				const q = adjList[k]
				if (!world.isLand[q]) continue
				landNeighbors++
				if (rock[q] === rock[r]) same++
			}
			if (landNeighbors > 0 && same === 0) isolated++
		}
		expect(isolated / land).toBeLessThan(MAX_ISOLATED_SHARE)
	})

	it("stores the fertility the soil formula gives from the stored climate, plus leaching spared on rising ranges", () => {
		const { rock, youngKind, soilFertility } = surface()
		const climate = world.climate
		const recomputed = SOILS.fertility({
			rock,
			youngKind,
			rising: new Float32Array(rock.length),
			vegetation: world.vegetation,
			isLand: world.isLand,
			temperatureMonthly: climate.temperature_monthly,
			temperatureAvg: climate.temperature_avg,
			rainfallAnnual: world.rainfall.annual,
			petMonthly: climate.pet_monthly,
		})
		for (let r = 0; r < soilFertility.length; r++)
			expect(soilFertility[r]).toBeGreaterThanOrEqual(
				recomputed.fertility[r] - 1e-6,
			)
		let equal = 0
		for (let r = 0; r < soilFertility.length; r++)
			if (Math.abs(recomputed.fertility[r] - soilFertility[r]) < 1e-6) equal++
		expect(equal / soilFertility.length).toBeGreaterThan(0.8)
	})

	it("keeps fertility in 0..1 on land and zero in the sea", () => {
		const { soilFertility } = surface()
		for (let r = 0; r < soilFertility.length; r++) {
			expect(soilFertility[r]).toBeGreaterThanOrEqual(0)
			expect(soilFertility[r]).toBeLessThanOrEqual(1)
			if (!world.isLand[r]) expect(soilFertility[r]).toBe(0)
		}
	})

	it("puts no river sediment or loess under present ice, and no loess on ice-climate land", () => {
		const { rock, youngKind, glaciated } = surface()
		const ice = PASTA.pastaLabels.indexOf("CI")
		for (let r = 0; r < rock.length; r++) {
			if (rock[r] !== ROCKS.code.young) continue
			if (glaciated[r])
				expect([ROCKS.youngCode.river, ROCKS.youngCode.loess]).not.toContain(
					youngKind[r],
				)
			if (world.pastaClimate[r] === ice)
				expect(youngKind[r]).not.toBe(ROCKS.youngCode.loess)
		}
	})

	it("ties the ice mask to land and feeds the farming soil factor", () => {
		const { glaciated } = surface()
		for (let r = 0; r < glaciated.length; r++)
			if (glaciated[r]) expect(world.isLand[r]).toBe(1)
		const soil = world.farming?.ground.soil
		expect(soil).toBeDefined()
		for (const value of soil ?? [])
			expect(value).toBeGreaterThanOrEqual(1 - 0.92 - 1e-6)
	})
	it("gives bit-identical rock, young tags and fertility for one seed built twice", () => {
		const again = generateWorld({ seed: SEED })
		const first = surface()
		expect(Array.from(again.rock ?? [])).toEqual(Array.from(first.rock))
		expect(Array.from(again.youngKind ?? [])).toEqual(
			Array.from(first.youngKind),
		)
		expect(Array.from(again.soilFertility ?? [])).toEqual(
			Array.from(first.soilFertility),
		)
	}, 300_000)
})
