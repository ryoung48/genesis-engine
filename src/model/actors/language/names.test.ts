import { afterEach, describe, expect, it, vi } from "vitest"
import { LANGUAGE } from "./languages"
import type { LanguageNameContext } from "./names"
import { createNames, createWorldNames } from "./names"

describe("createNames", () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("uses injected context instead of globals and caches generated names", () => {
		const language = LANGUAGE.spawn("name-cache")
		const simpleSpy = vi
			.spyOn(LANGUAGE.word, "simple")
			.mockImplementation(({ key }) => ({
				morphemes: [key],
				word: `north ${key}`,
			}))

		const names = createNames({
			provinces: [{ culture: 0 }],
			cultures: [{ language, traditions: [] }],
			dynasties: [{ name: "Stone" }],
		})

		expect(names.province(0)).toBe("North Settlement")
		expect(names.province(0)).toBe("North Settlement")
		const nation = names.nation(0)
		expect(names.river(0)).toBe("North River")
		expect(names.mountain(0)).toBe("North Mountain")
		expect(names.dynasty(0)).toBe("Stone")
		expect(nation).toMatch(/^[A-Z]/)
		expect(names.nation(0)).toBe(nation)
		expect(simpleSpy).toHaveBeenCalledTimes(4)

		names.clear()
		expect(names.province(0)).toBe("North Settlement")
		expect(simpleSpy).toHaveBeenCalledTimes(5)
	})

	it("persists generated leader names on the provided leader entry", () => {
		const language = LANGUAGE.spawn("leader-name")
		const simpleSpy = vi
			.spyOn(LANGUAGE.word, "simple")
			.mockImplementation(({ key }) => ({ morphemes: [key], word: key }))

		const names = createNames({
			provinces: [
				{
					culture: 0,
					leaders: [{ time: 800 }],
				},
			],
			cultures: [
				{
					language,
					traditions: ["matriarchal_society"],
				},
			],
			dynasties: [],
		})

		expect(names.leader(0, 800)).toBe("Person_female")
		expect(names.leader(0, 801)).toBe("Person_female")
		expect(simpleSpy).toHaveBeenCalledTimes(1)
		expect(simpleSpy).toHaveBeenCalledWith(
			expect.objectContaining({ key: "person_female" }),
		)
	})

	it("falls back for missing province languages and dynasties", () => {
		const names = createNames({
			provinces: [
				{ culture: -1 },
				{
					culture: 0,
					leaders: [{ time: 500 }],
				},
			],
			cultures: [{ language: null, traditions: [] }],
			dynasties: [],
		})

		expect(names.province(0)).toBe("#0")
		expect(names.nation(0)).toBe("#0")
		expect(names.river(0)).toBe("River #0")
		expect(names.mountain(0)).toBe("Mount #0")
		expect(names.leader(0, 500)).toBe("Leader #0")
		expect(names.leader(1, 499)).toBe("Leader #1")
		expect(names.leader(1, 500)).toBe("Leader #1")
		expect(names.dynasty(1)).toBe("Dynasty #1")
	})

	it("reuses existing leader entries before generating default male names", () => {
		const language = LANGUAGE.spawn("leader-defaults")
		const simpleSpy = vi
			.spyOn(LANGUAGE.word, "simple")
			.mockImplementation(({ key }) => ({ morphemes: [key], word: key }))

		const names = createNames({
			provinces: [
				{
					culture: 0,
					leaders: [{ time: 100, name: "Elder Rowan" }, { time: 200 }],
				},
			],
			cultures: [{ language, traditions: [] }],
			dynasties: [],
		})

		expect(names.leader(0, 150)).toBe("Elder Rowan")
		expect(names.leader(0, 250)).toBe("Person_male")
		expect(names.leader(0, 300)).toBe("Person_male")
		expect(simpleSpy).toHaveBeenCalledTimes(1)
		expect(simpleSpy).toHaveBeenCalledWith(
			expect.objectContaining({ key: "person_male" }),
		)
	})

	it("treats missing cultures and empty leader lists as fallback cases", () => {
		const names = createNames({
			provinces: [{ culture: 1, leaders: [] }, { culture: 0 }],
			cultures: [{ language: null, traditions: [] }],
			dynasties: [],
		})

		expect(names.province(0)).toBe("#0")
		expect(names.leader(0, 100)).toBe("Leader #0")
		expect(names.leader(1, 100)).toBe("Leader #1")
	})

	it("lazily instantiates heritage languages, culture dialects, and nation names from seeds", () => {
		const spawnSpy = vi.spyOn(LANGUAGE, "spawn")
		const dialectSpy = vi.spyOn(LANGUAGE, "dialect")

		const names = createWorldNames({
			provinces: { count: 2 } as never,
			cultures: {
				count: 1,
				assignment: new Int32Array([0, 0]),
				languageSeeds: new Int32Array([202]),
			} as never,
			heritages: {
				count: 1,
				assignment: new Int32Array([0]),
				languageSeeds: new Int32Array([101]),
			} as never,
			nations: {
				seeds: new Int32Array([1]),
				nameSeeds: new Int32Array([303]),
			} as never,
		})

		expect(spawnSpy).not.toHaveBeenCalled()
		expect(dialectSpy).not.toHaveBeenCalled()

		const nationName = names.nation(1)

		expect(nationName).toBe(names.nation(1))
		expect(spawnSpy).toHaveBeenCalledWith("heritage:101")
		expect(dialectSpy).toHaveBeenCalledTimes(1)
		expect(dialectSpy).toHaveBeenCalledWith(expect.any(Object), 202)
	})

	it("lazily names cultures, heritages, faiths, and religions from world seeds", () => {
		const spawnSpy = vi.spyOn(LANGUAGE, "spawn")
		const dialectSpy = vi.spyOn(LANGUAGE, "dialect")

		const names = createWorldNames({
			provinces: { count: 2 } as never,
			cultures: {
				count: 1,
				assignment: new Int32Array([0, 0]),
				languageSeeds: new Int32Array([202]),
				nameSeeds: new Int32Array([302]),
				seeds: new Int32Array([0]),
			} as never,
			heritages: {
				count: 1,
				assignment: new Int32Array([0]),
				languageSeeds: new Int32Array([101]),
				nameSeeds: new Int32Array([301]),
				seeds: new Int32Array([0]),
			} as never,
			faiths: {
				count: 1,
				assignment: new Int32Array([0]),
				nameSeeds: new Int32Array([303]),
				seeds: new Int32Array([0]),
			} as never,
			religions: {
				count: 1,
				assignment: new Int32Array([0]),
				nameSeeds: new Int32Array([304]),
				seeds: new Int32Array([0]),
			} as never,
			nations: {
				seeds: new Int32Array([1]),
				nameSeeds: new Int32Array([305]),
			} as never,
		})

		expect(names.heritage(0)).toMatch(/^[A-Z]/)
		expect(names.culture(0)).toMatch(/^[A-Z]/)
		expect(names.faith(0)).toMatch(/^[A-Z]/)
		expect(names.religion(0)).toMatch(/^[A-Z]/)
		expect(spawnSpy).toHaveBeenCalledWith("heritage:101")
		expect(dialectSpy).toHaveBeenCalledWith(expect.any(Object), 202)
	})

	it("persists seeded faith and religion names while falling back for unresolvable groups", () => {
		const simpleSpy = vi
			.spyOn(LANGUAGE.word, "simple")
			.mockImplementation(({ slot }) => ({
				morphemes: [slot],
				word: `slot ${slot}`,
			}))

		const context: LanguageNameContext = {
			provinces: [{ culture: 0 }],
			cultures: [
				{ language: null, languageSeed: 55, nameSeed: 77, traditions: [] },
			],
			faiths: [{ nameSeed: 88, seedCulture: 0 }, { nameSeed: 99 }],
			religions: [{ nameSeed: 111, seedFaith: 0 }, { nameSeed: 222 }],
		}
		const names = createNames(context)

		expect(names.faith(0)).toBe("Slot Faith:0:88")
		expect(names.religion(0)).toBe("Slot Religion:0:111")
		expect(names.faith(0)).toBe("Slot Faith:0:88")
		expect(names.religion(0)).toBe("Slot Religion:0:111")
		expect(context.faiths?.[0]?.name).toBe("Slot Faith:0:88")
		expect(context.religions?.[0]?.name).toBe("Slot Religion:0:111")
		expect(names.faith(1)).toBe("Faith #1")
		expect(names.religion(1)).toBe("Religion #1")
		expect(simpleSpy).toHaveBeenCalledTimes(2)
	})

	it("defaults missing world faith and religion seed arrays to deterministic fallbacks", () => {
		const names = createWorldNames({
			provinces: { count: 0 } as never,
			cultures: { count: 0, assignment: new Int32Array(0) } as never,
			faiths: {
				count: 1,
			} as never,
			religions: {
				count: 1,
			} as never,
			nations: {
				seeds: new Int32Array(0),
			} as never,
		})

		expect(names.faith(0)).toBe("Faith #0")
		expect(names.religion(0)).toBe("Religion #0")
	})

	it("covers seeded and fallback language resolution branches for provinces and nations", () => {
		const heritageLanguage = LANGUAGE.spawn("heritage-existing")
		const spawnSpy = vi.spyOn(LANGUAGE, "spawn")
		const dialectSpy = vi.spyOn(LANGUAGE, "dialect")
		const simpleSpy = vi
			.spyOn(LANGUAGE.word, "simple")
			.mockImplementation(({ slot }) => ({
				morphemes: [slot],
				word: `slot ${slot}`,
			}))

		const names = createNames({
			provinces: [
				{ culture: 0 },
				{ culture: 1 },
				{ culture: 2 },
				{ culture: 3 },
			],
			cultures: [
				{ language: null, languageSeed: 11, heritage: 0, traditions: [] },
				{ language: null, languageSeed: 22, heritage: 1, traditions: [] },
				{ language: null, languageSeed: 33, heritage: 2, traditions: [] },
				{ language: null, languageSeed: 44, heritage: 99, traditions: [] },
			],
			heritages: [
				{ language: null, languageSeed: 7 },
				{ language: heritageLanguage },
				{ language: null },
			],
			nations: [
				{ id: 1, capital: 1, culture: -1 },
				{ id: 3, capital: 3, culture: 3 },
			],
		})

		expect(names.province(0)).toBe("Slot Province:0")
		expect(names.province(2)).toBe("Slot Province:2")
		expect(names.province(3)).toBe("Slot Province:3")
		const fallbackNationName = names.nation(1)
		const seededNationName = names.nation(3)
		expect(names.nation(99)).toBe("#99")
		expect(simpleSpy).toHaveBeenCalledWith(
			expect.objectContaining({ slot: "province:0" }),
		)
		expect(simpleSpy).toHaveBeenCalledWith(
			expect.objectContaining({ slot: "province:2" }),
		)
		expect(simpleSpy).toHaveBeenCalledWith(
			expect.objectContaining({ slot: "province:3" }),
		)
		expect(fallbackNationName).toMatch(/^[A-Z]/)
		expect(seededNationName).toMatch(/^[A-Z]/)
		expect(names.nation(1)).toBe(fallbackNationName)
		expect(names.nation(3)).toBe(seededNationName)
		expect(spawnSpy).toHaveBeenCalledWith("heritage:7")
		expect(spawnSpy).toHaveBeenCalledWith("culture:33")
		expect(spawnSpy).toHaveBeenCalledWith("culture:44")
		expect(dialectSpy).toHaveBeenCalledWith(expect.any(Object), 11)
		expect(dialectSpy).toHaveBeenCalledWith(heritageLanguage, 22)
	})

	it("handles missing world collections by returning deterministic fallbacks", () => {
		const names = createWorldNames({} as never)

		expect(names.province(0)).toBe("#0")
		expect(names.nation(0)).toBe("#0")
		expect(names.culture(0)).toBe("Culture #0")
		expect(names.heritage(0)).toBe("Heritage #0")
		expect(names.faith(0)).toBe("Faith #0")
		expect(names.religion(0)).toBe("Religion #0")
		expect(names.river(0)).toBe("River #0")
		expect(names.mountain(0)).toBe("Mount #0")
		expect(names.leader(0, 0)).toBe("Leader #0")
		expect(names.dynasty(0)).toBe("Dynasty #0")
	})

	it("spawns a seeded culture directly when no heritage is assigned", () => {
		const spawnSpy = vi.spyOn(LANGUAGE, "spawn")
		const names = createNames({
			provinces: [{ culture: 0 }],
			cultures: [{ language: null, languageSeed: 55, traditions: [] }],
		})

		expect(names.province(0)).toMatch(/^[A-Z]/)
		expect(spawnSpy).toHaveBeenCalledWith("culture:55")
	})

	it("defaults missing world assignments and missing leader cultures to fallbacks", () => {
		const names = createWorldNames({
			provinces: { count: 2 } as never,
			cultures: {
				count: 2,
				assignment: [] as never,
				languageSeeds: new Int32Array([11, 22]),
			} as never,
			heritages: {
				count: 1,
				assignment: [] as never,
				languageSeeds: new Int32Array([33]),
			} as never,
			nations: {
				seeds: [undefined, 0] as never,
				nameSeeds: new Int32Array([44, 55]),
			} as never,
		})

		expect(names.province(0)).toBe("#0")
		expect(names.nation(0)).toBe("#0")
		expect(
			createNames({
				provinces: [{ culture: 1, leaders: [{ time: 10 }] }],
				cultures: [
					{ language: LANGUAGE.spawn("leader-culture"), traditions: [] },
				],
			}).leader(0, 10),
		).toBe("Leader #0")
	})
})
