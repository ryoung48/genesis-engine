import { afterEach, describe, expect, it, vi } from "vitest"
import { TRAITS } from "@/model/history/sim/people/traits"
import { RELIGION } from "@/model/history/sim/religion"
import { RELIGION_DOCTRINE } from "@/model/history/sim/religion/doctrine"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { RNG } from "@/model/shared/random/rng"
import { loadEarthGrayscale } from "@/test/earth/assets"
import { HISTORY_RUN } from "@/test/history-run"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"

const width = RELIGION_DOCTRINE.groups.length
const groupIndex = (name: string) =>
	RELIGION_DOCTRINE.groups.findIndex((group) => group.name === name)
const params = {
	religionTypes: new Uint8Array([3, 3, 0, 0, 4, 4]),
	religionFamilies: new Int32Array([0, 0, 1, 1, 2, 2]),
	familyCount: 3,
	seed: 1234,
}
afterEach(() => vi.restoreAllMocks())
describe("religion doctrines", () => {
	it("assigns five era-based types deterministically and shares each family type", () => {
		const input = {
			religionCount: 6,
			religionFamilies: params.religionFamilies,
			religionFamilyCount: 3,
			cultureToReligion: new Int32Array([0, 1, 2, 3, 4, 5]),
			cultureCount: 6,
			provinceCount: 6,
			cultureAssignment: new Int32Array([0, 1, 2, 3, 4, 5]),
			era: "lateMedieval" as const,
			seed: 1234,
		}
		const types = RELIGION.assignReligionTypes(input)
		expect(types).toEqual(RELIGION.assignReligionTypes(input))
		expect(RELIGION.religionTypeNames).toHaveLength(5)
		let violations = 0
		for (let religion = 0; religion < types.length; religion++)
			if (
				types[religion] > 4 ||
				types[religion] !== types[religion - (religion % 2)]
			)
				violations++
		expect(violations).toBe(0)
	})
	it("uses the smoothed CK3 marriage probabilities", () => {
		const probabilities = RELIGION_DOCTRINE.probabilities({
			group: groupIndex("marriage_type"),
			type: 0,
		})
		expect(probabilities).toEqual([
			(5 + 32 / 103) / 40,
			(6 + 31 / 103) / 40,
			(28 + 40 / 103) / 40,
		])
		expect(probabilities.reduce((a, b) => a + b, 0)).toBeCloseTo(1)
	})
	it("reads conduct from the same fixed quantile and consumes every slot", () => {
		const draws = new Map<number, number>()
		vi.spyOn(RNG, "createRng").mockImplementation(({ seed }) =>
			RNG.fromSource({
				random: () => {
					draws.set(seed, (draws.get(seed) ?? 0) + 1)
					return 0.4
				},
				nonPositiveWeightBehavior: "undefined",
			}),
		)
		const doctrine = RELIGION_DOCTRINE.assign(params)
		let violations = 0
		for (let family = 0; family < 3; family++)
			for (const name of ["adultery", "homosexuality", "witchcraft"]) {
				const group = groupIndex(name),
					type = params.religionTypes[family * 2]
				const probabilities = RELIGION_DOCTRINE.probabilities({ group, type })
				let cumulative = 0
				const expected = probabilities.findIndex((probability) => {
					cumulative += probability
					return cumulative > 0.4
				})
				if (doctrine.familyOptions[family * width + group] !== expected)
					violations++
			}
		expect(violations).toBe(0)
		expect(draws.get(params.seed + 7411)).toBe(31)
		expect(draws.get(params.seed + 7412)).toBe(30)
		expect(draws.get(params.seed + 7413)).toBe(9)
	})
	it("enforces all three clerical cases without shifting later draws", () => {
		const family = Array(31).fill(0.5),
			religion = Array(30).fill(0.9)
		const head = groupIndex("head_of_faith"),
			clergy = groupIndex("theocracy")
		family[1 + head * 2] = 0.5
		family[1 + clergy * 2] = 0
		religion[head * 2] = 0
		religion[head * 2 + 1] = 0.999
		const streams = new Map([
			[7411, family],
			[7412, religion],
		])
		vi.spyOn(RNG, "createRng").mockImplementation(({ seed }) => {
			let index = 0
			return RNG.fromSource({
				random: () => streams.get(seed)?.[index++] ?? 0.5,
				nonPositiveWeightBehavior: "undefined",
			})
		})
		const input = {
			religionTypes: new Uint8Array([3]),
			religionFamilies: new Int32Array([0]),
			familyCount: 1,
			seed: 0,
		}
		const forced = RELIGION_DOCTRINE.assign(input)
		expect(forced.familyOptions[head]).toBe(1)
		expect(forced.familyOptions[clergy]).toBe(0)
		expect(forced.options[head]).toBe(2)
		expect(forced.options[clergy]).toBe(1)
		family[1 + head * 2] = 0.999
		religion[head * 2] = 0.9
		religion[clergy * 2] = 0
		const suppressed = RELIGION_DOCTRINE.assign(input)
		expect(suppressed.options[head]).toBe(2)
		expect(suppressed.options[clergy]).toBe(1)
		family[1 + head * 2] = 0
		family[1 + clergy * 2] = 0.999
		const redrawn = RELIGION_DOCTRINE.assign(input)
		expect(redrawn.options[head]).toBe(0)
		expect(redrawn.familyOptions[clergy]).toBe(1)
		expect(redrawn.options[clergy]).toBe(0)
	})
	it("selects a zero-weight opposite and excludes previously chosen sins", () => {
		let traits = [0.985, 0, 0, 0, 0, 0, 0, 0, 0]
		vi.spyOn(RNG, "createRng").mockImplementation(({ seed }) => {
			let index = 0
			return RNG.fromSource({
				random: () => (seed === 7413 ? traits[index++] : 0.5),
				nonPositiveWeightBehavior: "undefined",
			})
		})
		const input = {
			religionTypes: new Uint8Array([0]),
			religionFamilies: new Int32Array([0]),
			familyCount: 1,
			seed: 0,
		}
		const zero = RELIGION_DOCTRINE.assign(input)
		expect(zero.virtues[0][0]).toBe("wrathful")
		expect(zero.sins[0][0]).toBe("calm")
		traits = [0.3, 0, 0.05, 0.99, 0, 0, 0, 0, 0]
		const exclusion = RELIGION_DOCTRINE.assign(input)
		expect(exclusion.virtues[0]).toEqual(["just", "brave", "honest"])
		expect(exclusion.sins[0][0]).toBe("craven")
		expect(new Set(exclusion.sins[0]).size).toBe(3)
	})
	it("carries valid family assignments through world generation and structured transfer", () => {
		const { generated } = HISTORY_RUN.createEngine({
			seed: 14963991,
			era: "lateMedieval",
			numPoints: 12000,
		})
		const doctrine = generated.religionDoctrine!,
			families = generated.religionFamilies!
		expect(doctrine).toBeDefined()
		expect(doctrine.options.length).toBe(generated.religions!.count * width)
		let violations = 0
		const head = groupIndex("head_of_faith"),
			clergy = groupIndex("theocracy"),
			funeral = groupIndex("funeral")
		for (let religion = 0; religion < generated.religions!.count; religion++) {
			const family = families[religion],
				virtues = doctrine.virtues[religion],
				sins = doctrine.sins[religion]
			if (
				virtues.length !== 3 ||
				sins.length !== 3 ||
				new Set(sins).size !== 3 ||
				sins.some((sin) => virtues.includes(sin)) ||
				virtues.some((trait) =>
					TRAITS.opposites({ trait }).some((opposite) =>
						virtues.includes(opposite),
					),
				)
			)
				violations++
			const sibling = families.indexOf(family)
			if (
				JSON.stringify(virtues) !== JSON.stringify(doctrine.virtues[sibling]) ||
				JSON.stringify(sins) !== JSON.stringify(doctrine.sins[sibling])
			)
				violations++
			for (let group = 0; group < width; group++)
				if (
					doctrine.options[religion * width + group] >=
						RELIGION_DOCTRINE.groups[group].options.length ||
					doctrine.familyOptions[family * width + group] >=
						RELIGION_DOCTRINE.groups[group].options.length
				)
					violations++
			if (
				(doctrine.options[religion * width + head] === 2 &&
					doctrine.options[religion * width + clergy] === 0) ||
				(doctrine.familyOptions[family * width + head] === 2 &&
					doctrine.familyOptions[family * width + clergy] === 0) ||
				doctrine.options[religion * width + funeral] !==
					doctrine.familyOptions[family * width + funeral]
			)
				violations++
		}
		expect(violations).toBe(0)
		const copy = structuredClone(doctrine)
		expect(
			structuredClone(doctrine, {
				transfer: [doctrine.options.buffer, doctrine.familyOptions.buffer],
			}),
		).toEqual(copy)
		expect(RELIGION_DOCTRINE.assign(params)).toEqual(
			RELIGION_DOCTRINE.assign(params),
		)
	})
	it("excludes doctrines from an Earth import without province rasters", () => {
		const earth = loadEarthGrayscale("earth.png")
		const world = IMPORT_HEIGHTMAP.importGenesisWorld({
			params: {
				...DEFAULT_WORLD_PARAMS,
				seed: 14963991,
				terrainWarp: 0,
				smoothing: 0,
				hydraulicErosion: 0,
				thermalErosion: 0,
				ridgeSharpening: 0,
				glacialErosion: 0,
				numPoints: 12000,
				grayscale: earth.grayscale,
				imageWidth: earth.width,
				imageHeight: earth.height,
				volcanism: 1,
				craters: 0,
			},
		})
		expect(world.provinces?.realIds).toBeUndefined()
		expect(world.religionDoctrine).toBeUndefined()
		expect(world.religionTypes).toBeDefined()
		expect(Array.from(world.religionTypes!).every((type) => type < 5)).toBe(
			true,
		)
	})
})
