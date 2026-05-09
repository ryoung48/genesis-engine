import { describe, expect, it } from "vitest"
import type { LanguageNameContext } from "@/model/society/language/names"
import type {
	SerializedOrogenWorld,
	SerializedTimelines,
} from "@/model/transport/worker-types"
import type { TimelineBundle } from "../history/history-query"
import { createDisplayNames, displayNamesInternals } from "./display-names"

function makeProvinceTimelineInt(
	valuesByProvince: number[][],
): SerializedTimelines["assignment"] {
	const offsets = new Int32Array(valuesByProvince.length + 1)
	const times: number[] = []
	const values: number[] = []
	let cursor = 0
	for (let province = 0; province < valuesByProvince.length; province++) {
		offsets[province] = cursor
		for (let step = 0; step < valuesByProvince[province].length; step++) {
			times.push(step * 10)
			values.push(valuesByProvince[province][step])
			cursor++
		}
	}
	offsets[valuesByProvince.length] = cursor
	return {
		times: new Float64Array(times),
		values: new Int32Array(values),
		offsets,
	}
}

function makeProvinceTimelineFloat(
	valuesByProvince: number[][],
): SerializedTimelines["populationRural"] {
	const offsets = new Int32Array(valuesByProvince.length + 1)
	const times: number[] = []
	const values: number[] = []
	let cursor = 0
	for (let province = 0; province < valuesByProvince.length; province++) {
		offsets[province] = cursor
		for (let step = 0; step < valuesByProvince[province].length; step++) {
			times.push(step * 10)
			values.push(valuesByProvince[province][step])
			cursor++
		}
	}
	offsets[valuesByProvince.length] = cursor
	return {
		times: new Float64Array(times),
		values: new Float32Array(values),
		offsets,
	}
}

describe("createDisplayNames", () => {
	it("builds leader and dynasty names from timeline data", () => {
		const world = {
			provinces: {
				count: 1,
				regionProvince: new Int32Array([0]),
			},
			cultures: {
				count: 1,
				assignment: new Int32Array([0]),
				seeds: new Int32Array([0]),
				languageSeeds: new Int32Array([17]),
				nameSeeds: new Int32Array([23]),
			},
			heritages: {
				count: 1,
				assignment: new Int32Array([0]),
				seeds: new Int32Array([0]),
				languageSeeds: new Int32Array([5]),
				nameSeeds: new Int32Array([7]),
			},
			faiths: {
				count: 1,
				assignment: new Int32Array([0]),
				seeds: new Int32Array([0]),
				nameSeeds: new Int32Array([11]),
			},
			religions: {
				count: 1,
				assignment: new Int32Array([0]),
				seeds: new Int32Array([0]),
				nameSeeds: new Int32Array([13]),
			},
			nations: {
				seeds: new Int32Array([0]),
				nameSeeds: new Int32Array([29]),
			},
			landmarks: {
				count: 1,
				dominantCulture: new Int32Array([0]),
				nameSeeds: new Int32Array([31]),
			},
			rivers: {
				riverId: new Int32Array([0]),
			},
		} as unknown as SerializedOrogenWorld
		const timelines: SerializedTimelines = {
			P: 1,
			startTimeMs: 0,
			endTimeMs: 20,
			parent: makeProvinceTimelineInt([[-1]]),
			assignment: makeProvinceTimelineInt([[0]]),
			populationRural: makeProvinceTimelineFloat([[1]]),
			populationUrban: makeProvinceTimelineFloat([[0]]),
			development: makeProvinceTimelineFloat([[0]]),
			consumption: makeProvinceTimelineFloat([[0]]),
			leaderDynasty: makeProvinceTimelineInt([[2, 1]]),
			leaderNameSeed: makeProvinceTimelineInt([[101, 202]]),
			leaderClaim: makeProvinceTimelineInt([[0]]),
			occupation: makeProvinceTimelineInt([[-1]]),
			relations: {
				aIdx: new Int32Array(),
				bIdx: new Int32Array(),
				offsets: new Int32Array(),
				times: new Float64Array(),
				values: new Int32Array(),
			},
			nationColorKeys: new Int32Array([0]),
			nationColorValues: new Float32Array([0.4, 0.5, 0.6]),
			wars: [],
		}
		const bundle: TimelineBundle = {
			timelines,
			events: [{ tag: "succession", time: 10, data: { nation: 0 } } as never],
		}

		const names = createDisplayNames(world, bundle)
		const leaderBefore = names.leader(0, 5)
		const leaderAfter = names.leader(0, 15)

		expect(leaderBefore).not.toBe("Leader #0")
		expect(leaderAfter).not.toBe("Leader #0")
		expect(leaderAfter).not.toBe(leaderBefore)
		expect(names.leader(0, 15)).toBe(leaderAfter)
		expect(names.dynasty(2)).not.toBe("Dynasty #2")
		expect(names.dynasty(1)).not.toBe("Dynasty #1")
		expect(names.nation(0)).not.toBe("#0")
		expect(names.culture(0)).not.toBe("Culture #0")
		expect(names.heritage(0)).not.toBe("Heritage #0")
		expect(names.faith(0)).not.toBe("Faith #0")
		expect(names.religion(0)).not.toBe("Religion #0")
		expect(names.landmark(0)).not.toBe("#0")
		expect(names.river(0)).not.toBe("River #0")
	})

	it("builds leader names from leader-name-seed timelines without succession events", () => {
		const world = {
			provinces: { count: 1 },
			cultures: {
				count: 1,
				assignment: new Int32Array([0]),
				languageSeeds: new Int32Array([11]),
			},
			heritages: {
				count: 0,
				assignment: new Int32Array(0),
			},
		} as unknown as SerializedOrogenWorld
		const names = createDisplayNames(world, {
			timelines: {
				P: 1,
				startTimeMs: 0,
				endTimeMs: 20,
				parent: makeProvinceTimelineInt([[-1]]),
				assignment: makeProvinceTimelineInt([[0]]),
				populationRural: makeProvinceTimelineFloat([[0]]),
				populationUrban: makeProvinceTimelineFloat([[0]]),
				development: makeProvinceTimelineFloat([[0]]),
				consumption: makeProvinceTimelineFloat([[0]]),
				leaderDynasty: makeProvinceTimelineInt([[-1]]),
				leaderNameSeed: makeProvinceTimelineInt([[1001, 1002]]),
				leaderClaim: makeProvinceTimelineInt([[0]]),
				occupation: makeProvinceTimelineInt([[-1]]),
				relations: {
					aIdx: new Int32Array(),
					bIdx: new Int32Array(),
					offsets: new Int32Array(),
					times: new Float64Array(),
					values: new Int32Array(),
				},
				nationColorKeys: new Int32Array(),
				nationColorValues: new Float32Array(),
				wars: [],
			},
			events: [],
		})

		expect(names.leader(0, 5)).not.toBe("Leader #0")
		expect(names.leader(0, 6)).toBe(names.leader(0, 5))
		expect(names.leader(0, 15)).not.toBe(names.leader(0, 5))
	})

	it("falls back to base world naming when no timeline bundle is available", () => {
		const names = createDisplayNames(
			{
				provinces: { count: 1 },
				cultures: {
					count: 1,
					assignment: new Int32Array([0]),
					languageSeeds: new Int32Array([202]),
				},
				leaderNameSeed: new Int32Array([303]),
				leaderDynasty: new Int32Array([4]),
			} as unknown as SerializedOrogenWorld,
			null,
		)

		expect(names.culture(0)).not.toBe("Culture #0")
		expect(names.heritage(0)).toBe("Heritage #0")
		expect(names.faith(0)).toBe("Faith #0")
		expect(names.religion(0)).toBe("Religion #0")
		expect(names.landmark(0)).toBe("#0")
		expect(names.river(0)).toBe("River #0")
		expect(names.leader(0, 0)).not.toBe("Leader #0")
		expect(names.dynasty(4)).not.toBe("Dynasty #4")
	})

	it("falls back cleanly for sparse cultures, dynasties, rivers, and ignored events", () => {
		const world = {
			provinces: {
				count: 3,
				regionProvince: new Int32Array([-1, 1, 1, -1]),
			},
			cultures: {
				count: 2,
				assignment: new Int32Array([-1, 0, 1]),
				seeds: new Int32Array([0, 1]),
			},
			heritages: {
				count: 1,
				assignment: new Int32Array([0, 0]),
				seeds: new Int32Array([0]),
			},
			faiths: {
				count: 1,
				assignment: new Int32Array([0, 0]),
				seeds: new Int32Array([-1]),
			},
			religions: {
				count: 1,
				assignment: new Int32Array([0]),
				seeds: new Int32Array([-1]),
			},
			nations: {
				seeds: new Int32Array([-1, 2]),
				nameSeeds: new Int32Array([0, 7]),
			},
			landmarks: {
				count: 1,
				dominantCulture: new Int32Array([-1]),
				nameSeeds: new Int32Array([19]),
			},
			rivers: {
				riverId: new Int32Array([-1, 4, 4, 5]),
			},
		} as unknown as SerializedOrogenWorld
		const timelines: SerializedTimelines = {
			P: 3,
			startTimeMs: 0,
			endTimeMs: 20,
			parent: makeProvinceTimelineInt([[-1], [-1], [-1]]),
			assignment: makeProvinceTimelineInt([[0], [1], [2]]),
			populationRural: makeProvinceTimelineFloat([[1], [1], [1]]),
			populationUrban: makeProvinceTimelineFloat([[0], [0], [0]]),
			development: makeProvinceTimelineFloat([[0], [0], [0]]),
			consumption: makeProvinceTimelineFloat([[0], [0], [0]]),
			leaderDynasty: makeProvinceTimelineInt([[-1], [6], [7]]),
			leaderClaim: makeProvinceTimelineInt([[0], [0], [0]]),
			occupation: makeProvinceTimelineInt([[-1], [-1], [-1]]),
			relations: {
				aIdx: new Int32Array(),
				bIdx: new Int32Array(),
				offsets: new Int32Array(),
				times: new Float64Array(),
				values: new Int32Array(),
			},
			nationColorKeys: new Int32Array([0, 1, 2]),
			nationColorValues: new Float32Array([
				0.1, 0.2, 0.3, 0.3, 0.2, 0.1, 0.4, 0.5, 0.6,
			]),
			wars: [],
		}
		const bundle: TimelineBundle = {
			timelines,
			events: [
				{ tag: "war started", time: 5, data: { attacker: 0 } } as never,
				{ tag: "succession", time: 10, data: { nation: 99 } } as never,
			],
		}

		const names = createDisplayNames(world, bundle)

		expect(names.nation(-1)).toBe("#-1")
		expect(names.nation(2)).toBe("#2")
		expect(names.faith(0)).toBe("Faith #0")
		expect(names.religion(0)).toBe("Religion #0")
		expect(names.landmark(0)).toBe("#0")
		expect(names.river(4)).toBe("River #4")
		expect(names.river(5)).toBe("River #5")
		expect(names.leader(0, 0)).toBe("Leader #0")
		expect(names.leader(1, 0)).toBe("Leader #1")
		expect(names.leader(2, 20)).toBe("Leader #2")
		expect(names.dynasty(6)).toBe("Dynasty #6")
		expect(names.dynasty(7)).toBe("Dynasty #7")
	})

	it("handles bundled worlds with no dynasties or generated languages", () => {
		const world = {
			provinces: {
				count: 1,
			},
			cultures: {
				count: 1,
				assignment: new Int32Array([0]),
				seeds: new Int32Array([0]),
				languageSeeds: new Int32Array(0),
			},
			heritages: {
				count: 1,
				assignment: new Int32Array([0]),
				seeds: new Int32Array([0]),
				languageSeeds: new Int32Array(0),
			},
			nations: {
				seeds: new Int32Array([0]),
			},
		} as unknown as SerializedOrogenWorld
		const timelines: SerializedTimelines = {
			P: 1,
			startTimeMs: 0,
			endTimeMs: 0,
			parent: makeProvinceTimelineInt([[-1]]),
			assignment: makeProvinceTimelineInt([[0]]),
			populationRural: makeProvinceTimelineFloat([[0]]),
			populationUrban: makeProvinceTimelineFloat([[0]]),
			development: makeProvinceTimelineFloat([[0]]),
			consumption: makeProvinceTimelineFloat([[0]]),
			leaderDynasty: makeProvinceTimelineInt([[-1]]),
			leaderClaim: makeProvinceTimelineInt([[0]]),
			occupation: makeProvinceTimelineInt([[-1]]),
			relations: {
				aIdx: new Int32Array(),
				bIdx: new Int32Array(),
				offsets: new Int32Array(),
				times: new Float64Array(),
				values: new Int32Array(),
			},
			nationColorKeys: new Int32Array([0]),
			nationColorValues: new Float32Array([0.1, 0.2, 0.3]),
			wars: [],
		}
		const bundle: TimelineBundle = { timelines, events: [] }

		const names = createDisplayNames(world, bundle)

		expect(names.nation(0)).toBe("#0")
		expect(names.culture(0)).toBe("Culture #0")
		expect(names.heritage(0)).toBe("Heritage #0")
		expect(names.leader(0, 0)).toBe("Leader #0")
		expect(names.dynasty(0)).toBe("Dynasty #0")
	})

	it("handles completely empty bundled worlds with fallback names", () => {
		const timelines: SerializedTimelines = {
			P: 0,
			startTimeMs: 0,
			endTimeMs: 0,
			parent: makeProvinceTimelineInt([]),
			assignment: makeProvinceTimelineInt([]),
			populationRural: makeProvinceTimelineFloat([]),
			populationUrban: makeProvinceTimelineFloat([]),
			development: makeProvinceTimelineFloat([]),
			consumption: makeProvinceTimelineFloat([]),
			leaderDynasty: makeProvinceTimelineInt([]),
			leaderClaim: makeProvinceTimelineInt([]),
			occupation: makeProvinceTimelineInt([]),
			relations: {
				aIdx: new Int32Array(),
				bIdx: new Int32Array(),
				offsets: new Int32Array(),
				times: new Float64Array(),
				values: new Int32Array(),
			},
			nationColorKeys: new Int32Array(),
			nationColorValues: new Float32Array(),
			wars: [],
		}
		const names = createDisplayNames({} as SerializedOrogenWorld, {
			timelines,
			events: [],
		})

		expect(names.nation(0)).toMatch(/^[A-Z]/)
		expect(names.culture(0)).toBe("Culture #0")
		expect(names.heritage(0)).toBe("Heritage #0")
		expect(names.faith(0)).toBe("Faith #0")
		expect(names.religion(0)).toBe("Religion #0")
		expect(names.landmark(0)).toBe("#0")
		expect(names.river(0)).toBe("River #0")
		expect(names.leader(0, 0)).toBe("Leader #0")
		expect(names.dynasty(0)).toBe("Dynasty #0")
	})

	it("uses direct culture languages when no heritage language is available", () => {
		const world = {
			provinces: {
				count: 1,
				regionProvince: new Int32Array([0]),
			},
			cultures: {
				count: 1,
				assignment: new Int32Array([0]),
				seeds: new Int32Array([0]),
				languageSeeds: new Int32Array([41]),
				nameSeeds: new Int32Array([43]),
			},
		} as unknown as SerializedOrogenWorld
		const timelines: SerializedTimelines = {
			P: 1,
			startTimeMs: 0,
			endTimeMs: 0,
			parent: makeProvinceTimelineInt([[-1]]),
			assignment: makeProvinceTimelineInt([[0]]),
			populationRural: makeProvinceTimelineFloat([[0]]),
			populationUrban: makeProvinceTimelineFloat([[0]]),
			development: makeProvinceTimelineFloat([[0]]),
			consumption: makeProvinceTimelineFloat([[0]]),
			leaderDynasty: makeProvinceTimelineInt([[0]]),
			leaderClaim: makeProvinceTimelineInt([[0]]),
			occupation: makeProvinceTimelineInt([[-1]]),
			relations: {
				aIdx: new Int32Array(),
				bIdx: new Int32Array(),
				offsets: new Int32Array(),
				times: new Float64Array(),
				values: new Int32Array(),
			},
			nationColorKeys: new Int32Array([0]),
			nationColorValues: new Float32Array([0.1, 0.2, 0.3]),
			wars: [],
		}

		const names = createDisplayNames(world, { timelines, events: [] })

		expect(names.culture(0)).not.toBe("Culture #0")
		expect(names.nation(0)).not.toBe("#0")
		expect(names.dynasty(0)).not.toBe("Dynasty #0")
	})

	it("falls back when dynasty cultures point outside the culture table", () => {
		const world = {
			provinces: {
				count: 1,
			},
			cultures: {
				count: 0,
				assignment: new Int32Array([5]),
				seeds: new Int32Array(),
			},
		} as unknown as SerializedOrogenWorld
		const timelines: SerializedTimelines = {
			P: 1,
			startTimeMs: 0,
			endTimeMs: 0,
			parent: makeProvinceTimelineInt([[-1]]),
			assignment: makeProvinceTimelineInt([[0]]),
			populationRural: makeProvinceTimelineFloat([[0]]),
			populationUrban: makeProvinceTimelineFloat([[0]]),
			development: makeProvinceTimelineFloat([[0]]),
			consumption: makeProvinceTimelineFloat([[0]]),
			leaderDynasty: makeProvinceTimelineInt([[2]]),
			leaderClaim: makeProvinceTimelineInt([[0]]),
			occupation: makeProvinceTimelineInt([[-1]]),
			relations: {
				aIdx: new Int32Array(),
				bIdx: new Int32Array(),
				offsets: new Int32Array(),
				times: new Float64Array(),
				values: new Int32Array(),
			},
			nationColorKeys: new Int32Array([0]),
			nationColorValues: new Float32Array([0.1, 0.2, 0.3]),
			wars: [],
		}

		const names = createDisplayNames(world, { timelines, events: [] })

		expect(names.dynasty(2)).toBe("Dynasty #2")
	})

	it("uses direct culture spawning when a referenced heritage is missing", () => {
		const world = {
			provinces: {
				count: 1,
			},
			cultures: {
				count: 1,
				assignment: new Int32Array([0]),
				seeds: new Int32Array([0]),
				languageSeeds: new Int32Array([53]),
			},
			heritages: {
				count: 0,
				assignment: new Int32Array([4]),
				seeds: new Int32Array(),
			},
		} as unknown as SerializedOrogenWorld
		const timelines: SerializedTimelines = {
			P: 1,
			startTimeMs: 0,
			endTimeMs: 0,
			parent: makeProvinceTimelineInt([[-1]]),
			assignment: makeProvinceTimelineInt([[0]]),
			populationRural: makeProvinceTimelineFloat([[0]]),
			populationUrban: makeProvinceTimelineFloat([[0]]),
			development: makeProvinceTimelineFloat([[0]]),
			consumption: makeProvinceTimelineFloat([[0]]),
			leaderDynasty: makeProvinceTimelineInt([[1]]),
			leaderClaim: makeProvinceTimelineInt([[0]]),
			occupation: makeProvinceTimelineInt([[-1]]),
			relations: {
				aIdx: new Int32Array(),
				bIdx: new Int32Array(),
				offsets: new Int32Array(),
				times: new Float64Array(),
				values: new Int32Array(),
			},
			nationColorKeys: new Int32Array([0]),
			nationColorValues: new Float32Array([0.1, 0.2, 0.3]),
			wars: [],
		}

		const names = createDisplayNames(world, { timelines, events: [] })

		expect(names.dynasty(1)).not.toBe("Dynasty #1")
	})

	it("covers internal heritage and culture language fallbacks directly", () => {
		const heritageContext: LanguageNameContext = {
			provinces: [],
			cultures: [],
			heritages: [{ language: null, languageSeed: 7 }],
		}
		expect(
			displayNamesInternals.getHeritageLanguage(heritageContext as never, 2),
		).toBeNull()
		expect(
			displayNamesInternals.getHeritageLanguage(heritageContext as never, 0),
		).not.toBeNull()
		expect(
			displayNamesInternals.getHeritageLanguage(heritageContext as never, 0),
		).toBe(heritageContext.heritages[0]?.language)

		const cultureContext: LanguageNameContext = {
			provinces: [],
			cultures: [
				{ language: null, languageSeed: 11, heritage: 0 },
				{ language: null, languageSeed: 13, heritage: 0 },
				{ language: null, heritage: 4 },
			],
			heritages: [{ language: null, languageSeed: 3 }],
		}
		expect(
			displayNamesInternals.getCultureLanguage(cultureContext as never, 5),
		).toBeNull()
		expect(
			displayNamesInternals.getCultureLanguage(cultureContext as never, 0),
		).not.toBeNull()
		expect(
			displayNamesInternals.getCultureLanguage(cultureContext as never, 1),
		).not.toBeNull()
		expect(
			displayNamesInternals.getCultureLanguage(cultureContext as never, 2),
		).toBeNull()
	})

	it("covers cached and missing heritage/culture language branches directly", () => {
		const existingLanguage =
			{} as LanguageNameContext["cultures"][number]["language"]
		const heritageContext: LanguageNameContext = {
			provinces: [],
			cultures: [],
			heritages: [{ language: existingLanguage }, { language: null }],
		}
		expect(
			displayNamesInternals.getHeritageLanguage(heritageContext as never, 0),
		).toBe(existingLanguage)
		expect(
			displayNamesInternals.getHeritageLanguage(heritageContext as never, 1),
		).toBeNull()

		const cultureContext: LanguageNameContext = {
			provinces: [],
			cultures: [
				{ language: existingLanguage },
				{ language: null, languageSeed: 17, heritage: -1 },
				{ language: null },
			],
			heritages: [],
		}
		expect(
			displayNamesInternals.getCultureLanguage(cultureContext as never, 0),
		).toBe(existingLanguage)
		expect(
			displayNamesInternals.getCultureLanguage(cultureContext as never, 1),
		).not.toBeNull()
		expect(
			displayNamesInternals.getCultureLanguage(cultureContext as never, 2),
		).toBeNull()
	})

	it("covers internal empty dynasty and ignored succession helpers directly", () => {
		const bundle: TimelineBundle = {
			timelines: {
				P: 2,
				startTimeMs: 0,
				endTimeMs: 10,
				parent: makeProvinceTimelineInt([[-1], [-1]]),
				assignment: makeProvinceTimelineInt([[0], [1]]),
				populationRural: makeProvinceTimelineFloat([[0], [0]]),
				populationUrban: makeProvinceTimelineFloat([[0], [0]]),
				development: makeProvinceTimelineFloat([[0], [0]]),
				consumption: makeProvinceTimelineFloat([[0], [0]]),
				leaderDynasty: makeProvinceTimelineInt([[-1], [-1]]),
				leaderNameSeed: makeProvinceTimelineInt([[11], [22]]),
				leaderClaim: makeProvinceTimelineInt([[0], [0]]),
				occupation: makeProvinceTimelineInt([[-1], [-1]]),
				relations: {
					aIdx: new Int32Array(),
					bIdx: new Int32Array(),
					offsets: new Int32Array(),
					times: new Float64Array(),
					values: new Int32Array(),
				},
				nationColorKeys: new Int32Array(),
				nationColorValues: new Float32Array(),
				wars: [],
			},
			events: [
				{ tag: "war started", time: 1, data: {} } as never,
				{ tag: "succession", time: 2, data: { nation: -1 } } as never,
			],
		}
		expect(displayNamesInternals.buildLeaderEntries(bundle, 2)).toEqual([
			[{ time: 0, nameSeed: 11 }],
			[{ time: 0, nameSeed: 22 }],
		])
		expect(
			displayNamesInternals.buildDynasties(
				{
					provinces: [{ culture: 0 }],
					cultures: [{ language: null, languageSeed: 1, heritage: -1 }],
					heritages: [],
				} as never,
				{
					provinces: { count: 1 },
					cultures: { assignment: new Int32Array([0]) },
				} as never,
				bundle.timelines.leaderDynasty,
			),
		).toEqual([])
	})

	it("falls back to start-time leader entries when leader-name seeds are missing", () => {
		const bundle: TimelineBundle = {
			timelines: {
				P: 3,
				startTimeMs: 50,
				endTimeMs: 60,
				parent: makeProvinceTimelineInt([[-1], [-1], [-1]]),
				assignment: makeProvinceTimelineInt([[0], [1], [2]]),
				populationRural: makeProvinceTimelineFloat([[0], [0], [0]]),
				populationUrban: makeProvinceTimelineFloat([[0], [0], [0]]),
				development: makeProvinceTimelineFloat([[0], [0], [0]]),
				consumption: makeProvinceTimelineFloat([[0], [0], [0]]),
				leaderDynasty: makeProvinceTimelineInt([[-1], [-1], [-1]]),
				leaderNameSeed: makeProvinceTimelineInt([[-1], [], [33]]),
				leaderClaim: makeProvinceTimelineInt([[0], [0], [0]]),
				occupation: makeProvinceTimelineInt([[-1], [-1], [-1]]),
				relations: {
					aIdx: new Int32Array(),
					bIdx: new Int32Array(),
					offsets: new Int32Array(),
					times: new Float64Array(),
					values: new Int32Array(),
				},
				nationColorKeys: new Int32Array(),
				nationColorValues: new Float32Array(),
				wars: [],
			},
			events: [],
		}

		expect(displayNamesInternals.buildLeaderEntries(bundle, 3)).toEqual([
			[{ time: 50 }],
			[{ time: 50 }],
			[{ time: 0, nameSeed: 33 }],
		])
	})

	it("falls back to bundle start time when leader-name seed timestamps are missing", () => {
		const bundle: TimelineBundle = {
			timelines: {
				P: 1,
				startTimeMs: 25,
				endTimeMs: 40,
				parent: makeProvinceTimelineInt([[-1]]),
				assignment: makeProvinceTimelineInt([[0]]),
				populationRural: makeProvinceTimelineFloat([[0]]),
				populationUrban: makeProvinceTimelineFloat([[0]]),
				development: makeProvinceTimelineFloat([[0]]),
				consumption: makeProvinceTimelineFloat([[0]]),
				leaderDynasty: makeProvinceTimelineInt([[-1]]),
				leaderNameSeed: {
					times: new Float64Array(0),
					values: new Int32Array([44]),
					offsets: new Int32Array([0, 1]),
				},
				leaderClaim: makeProvinceTimelineInt([[0]]),
				occupation: makeProvinceTimelineInt([[-1]]),
				relations: {
					aIdx: new Int32Array(),
					bIdx: new Int32Array(),
					offsets: new Int32Array(),
					times: new Float64Array(),
					values: new Int32Array(),
				},
				nationColorKeys: new Int32Array(),
				nationColorValues: new Float32Array(),
				wars: [],
			},
			events: [],
		}

		expect(displayNamesInternals.buildLeaderEntries(bundle, 1)).toEqual([
			[{ time: 25, nameSeed: 44 }],
		])
	})

	it("builds empty and sparse name contexts directly", () => {
		expect(
			displayNamesInternals.buildNameContext({} as SerializedOrogenWorld, []),
		).toEqual({
			provinces: [],
			cultures: [],
			heritages: [],
		})

		expect(
			displayNamesInternals.buildNameContext(
				{
					provinces: { count: 2 },
					cultures: {
						count: 1,
						assignment: new Int32Array([5]),
						languageSeeds: new Int32Array([11]),
						nameSeeds: new Int32Array([12]),
					},
					heritages: {
						count: 1,
						assignment: new Int32Array([9]),
						languageSeeds: new Int32Array([21]),
						nameSeeds: new Int32Array([22]),
					},
				} as unknown as SerializedOrogenWorld,
				[[{ time: 1 }], []],
			),
		).toEqual({
			provinces: [
				{ culture: 5, leaders: [{ time: 1 }] },
				{ culture: -1, leaders: [] },
			],
			cultures: [
				{
					language: null,
					languageSeed: 11,
					nameSeed: 12,
					heritage: 9,
				},
			],
			heritages: [{ language: null, languageSeed: 21, nameSeed: 22 }],
		})
	})

	it("covers legacy succession leader entries and dynasty fallback names", () => {
		const legacyBundle: TimelineBundle = {
			timelines: {
				P: 2,
				startTimeMs: 0,
				endTimeMs: 20,
				parent: makeProvinceTimelineInt([[-1], [-1]]),
				assignment: makeProvinceTimelineInt([[0], [1]]),
				populationRural: makeProvinceTimelineFloat([[0], [0]]),
				populationUrban: makeProvinceTimelineFloat([[0], [0]]),
				development: makeProvinceTimelineFloat([[0], [0]]),
				consumption: makeProvinceTimelineFloat([[0], [0]]),
				leaderDynasty: makeProvinceTimelineInt([[0], [1]]),
				leaderClaim: makeProvinceTimelineInt([[0], [0]]),
				occupation: makeProvinceTimelineInt([[-1], [-1]]),
				relations: {
					aIdx: new Int32Array(),
					bIdx: new Int32Array(),
					offsets: new Int32Array(),
					times: new Float64Array(),
					values: new Int32Array(),
				},
				nationColorKeys: new Int32Array(),
				nationColorValues: new Float32Array(),
				wars: [],
			},
			events: [
				{ tag: "succession", time: 5, data: { nation: 1 } } as never,
				{ tag: "succession", time: 7, data: { nation: "x" } } as never,
				{ tag: "succession", time: 9, data: { nation: 5 } } as never,
				{ tag: "war started", time: 11, data: { nation: 1 } } as never,
			],
		}

		expect(displayNamesInternals.buildLeaderEntries(legacyBundle, 2)).toEqual([
			[{ time: 0 }],
			[{ time: 0 }, { time: 5 }],
		])
		expect(
			displayNamesInternals.buildDynasties(
				{
					provinces: [{ culture: -1 }, { culture: 0 }],
					cultures: [{ language: null }],
					heritages: [],
				} as never,
				{
					provinces: { count: 2 },
					cultures: { assignment: new Int32Array([-1, 0]) },
				} as never,
				legacyBundle.timelines.leaderDynasty,
			),
		).toEqual([{ name: "Dynasty #0" }, { name: "Dynasty #1" }])
	})

	it("preserves the first dynasty culture and mixes named and fallback dynasties", () => {
		const bundleField = makeProvinceTimelineInt([[0], [0, 1], [-1]])
		const dynasties = displayNamesInternals.buildDynasties(
			{
				provinces: [{ culture: 0 }, { culture: 1 }, { culture: -1 }],
				cultures: [
					{ language: null, languageSeed: 5, heritage: -1 },
					{ language: null },
				],
				heritages: [],
			} as never,
			{
				provinces: { count: 3 },
				cultures: { assignment: new Int32Array([0, 1, -1]) },
			} as never,
			bundleField,
		)

		expect(dynasties[0]?.name).not.toBe("Dynasty #0")
		expect(dynasties[1]).toEqual({ name: "Dynasty #1" })
	})

	it("covers current-world dynasty fallbacks and empty current-world names directly", () => {
		expect(
			displayNamesInternals.buildDynastiesFromCurrentWorld(
				{
					provinces: [],
					cultures: [],
					heritages: [],
				},
				{} as SerializedOrogenWorld,
			),
		).toEqual([])

		const context: LanguageNameContext = {
			provinces: [{ culture: -1 }, { culture: 0 }],
			cultures: [{ language: null }],
			heritages: [],
		}
		expect(
			displayNamesInternals.buildDynastiesFromCurrentWorld(context, {
				provinces: { count: 2 },
				cultures: { assignment: new Int32Array([-1, 0]) },
				leaderDynasty: new Int32Array([0, 1]),
			} as unknown as SerializedOrogenWorld),
		).toEqual([{ name: "Dynasty #0" }, { name: "Dynasty #1" }])

		const names = displayNamesInternals.createCurrentWorldPoliticalNames(
			{} as SerializedOrogenWorld,
		)
		expect(names.leader(0, 0)).toBe("Leader #0")
		expect(names.dynasty(0)).toBe("Dynasty #0")
	})

	it("covers current-world political names with seeded leaders and dynasties directly", () => {
		const names = displayNamesInternals.createCurrentWorldPoliticalNames({
			provinces: { count: 2 },
			cultures: {
				count: 1,
				assignment: new Int32Array([0, -1]),
				languageSeeds: new Int32Array([31]),
			},
			leaderNameSeed: new Int32Array([41, -1]),
			leaderDynasty: new Int32Array([2, 3]),
		} as unknown as SerializedOrogenWorld)

		expect(names.leader(0, 0)).not.toBe("Leader #0")
		expect(names.leader(1, 0)).toBe("Leader #1")
		expect(names.dynasty(2)).not.toBe("Dynasty #2")
		expect(names.dynasty(3)).toBe("Dynasty #3")
		names.clear()
		expect(names.leader(0, 0)).not.toBe("Leader #0")
	})

	it("covers timeline political names directly", () => {
		const names = displayNamesInternals.createTimelineNames(
			{
				provinces: { count: 1 },
				cultures: {
					count: 1,
					assignment: new Int32Array([0]),
					languageSeeds: new Int32Array([71]),
				},
			} as unknown as SerializedOrogenWorld,
			{
				timelines: {
					P: 1,
					startTimeMs: 0,
					endTimeMs: 20,
					parent: makeProvinceTimelineInt([[-1]]),
					assignment: makeProvinceTimelineInt([[0]]),
					populationRural: makeProvinceTimelineFloat([[0]]),
					populationUrban: makeProvinceTimelineFloat([[0]]),
					development: makeProvinceTimelineFloat([[0]]),
					consumption: makeProvinceTimelineFloat([[0]]),
					leaderDynasty: makeProvinceTimelineInt([[5]]),
					leaderNameSeed: makeProvinceTimelineInt([[77]]),
					leaderClaim: makeProvinceTimelineInt([[0]]),
					occupation: makeProvinceTimelineInt([[-1]]),
					relations: {
						aIdx: new Int32Array(),
						bIdx: new Int32Array(),
						offsets: new Int32Array(),
						times: new Float64Array(),
						values: new Int32Array(),
					},
					nationColorKeys: new Int32Array(),
					nationColorValues: new Float32Array(),
					wars: [],
				},
				events: [],
			},
		)

		expect(names.leader(0, 0)).not.toBe("Leader #0")
		expect(names.dynasty(5)).not.toBe("Dynasty #5")
	})

	it("reads timeline helpers and resolves lazy leader entries directly", () => {
		const intField = makeProvinceTimelineInt([[11, 22], [33]])
		const floatField = makeProvinceTimelineFloat([[1.5, 2.5], [3.5]])
		const bundle: TimelineBundle = {
			timelines: {
				P: 2,
				startTimeMs: 5,
				endTimeMs: 20,
				parent: makeProvinceTimelineInt([[-1], [-1]]),
				assignment: makeProvinceTimelineInt([[0], [1]]),
				populationRural: makeProvinceTimelineFloat([[0], [0]]),
				populationUrban: makeProvinceTimelineFloat([[0], [0]]),
				development: makeProvinceTimelineFloat([[0], [0]]),
				consumption: makeProvinceTimelineFloat([[0], [0]]),
				leaderDynasty: makeProvinceTimelineInt([[4], [5]]),
				leaderNameSeed: intField,
				leaderClaim: makeProvinceTimelineInt([[0], [0]]),
				occupation: makeProvinceTimelineInt([[-1], [-1]]),
				relations: {
					aIdx: new Int32Array(),
					bIdx: new Int32Array(),
					offsets: new Int32Array(),
					times: new Float64Array(),
					values: new Int32Array(),
				},
				nationColorKeys: new Int32Array(),
				nationColorValues: new Float32Array(),
				wars: [],
			},
			events: [{ tag: "succession", time: 17, data: { nation: 1 } } as never],
		}

		expect(
			displayNamesInternals.readTimelineValue(
				intField.times,
				intField.values,
				0,
				2,
				-1,
				15,
			),
		).toBe(22)
		expect(displayNamesInternals.readProvinceInt(intField, 0, 5, -1)).toBe(11)
		expect(displayNamesInternals.readProvinceFloat(floatField, 0, 15, -1)).toBe(
			2.5,
		)
		expect(
			displayNamesInternals.readProvinceTimelineTime(intField, 0, 15, 5),
		).toBe(10)
		expect(
			displayNamesInternals.resolveLeaderEntry(
				{
					provinces: { count: 2 },
					leaderNameSeed: new Int32Array([91, 92]),
				} as unknown as SerializedOrogenWorld,
				bundle,
				0,
				15,
			),
		).toEqual({ time: 10, nameSeed: 22 })
		expect(displayNamesInternals.findLatestSuccessionTime(bundle, 1, 20)).toBe(
			17,
		)
	})

	it("covers lazy leader and dynasty fallback helpers", () => {
		const seedlessField = {
			times: new Float64Array(0),
			values: new Int32Array([-1]),
			offsets: new Int32Array([0, 1]),
		}
		const bundle: TimelineBundle = {
			timelines: {
				P: 1,
				startTimeMs: 25,
				endTimeMs: 40,
				parent: makeProvinceTimelineInt([[-1]]),
				assignment: makeProvinceTimelineInt([[0]]),
				populationRural: makeProvinceTimelineFloat([[0]]),
				populationUrban: makeProvinceTimelineFloat([[0]]),
				development: makeProvinceTimelineFloat([[0]]),
				consumption: makeProvinceTimelineFloat([[0]]),
				leaderDynasty: makeProvinceTimelineInt([[7]]),
				leaderNameSeed: seedlessField,
				leaderClaim: makeProvinceTimelineInt([[0]]),
				occupation: makeProvinceTimelineInt([[-1]]),
				relations: {
					aIdx: new Int32Array(),
					bIdx: new Int32Array(),
					offsets: new Int32Array(),
					times: new Float64Array(),
					values: new Int32Array(),
				},
				nationColorKeys: new Int32Array(),
				nationColorValues: new Float32Array(),
				wars: [],
			},
			events: [],
		}

		expect(
			displayNamesInternals.resolveLeaderEntry(
				{
					provinces: { count: 1 },
					leaderNameSeed: new Int32Array([77]),
				} as unknown as SerializedOrogenWorld,
				bundle,
				0,
				30,
			),
		).toEqual({ time: 25 })
		expect(
			displayNamesInternals.resolveLeaderEntry(
				{
					provinces: { count: 1 },
					leaderNameSeed: new Int32Array([77]),
				} as unknown as SerializedOrogenWorld,
				null,
				0,
				30,
			),
		).toEqual({ time: 0, nameSeed: 77 })
		expect(
			displayNamesInternals.resolveLeaderEntry(
				{} as SerializedOrogenWorld,
				null,
				4,
				30,
			),
		).toBeNull()
		expect(
			displayNamesInternals.findDynastyCultureId(
				{
					provinces: { count: 2 },
					cultures: { assignment: new Int32Array([-1, 3]) },
					leaderDynasty: new Int32Array([5, 9]),
				} as unknown as SerializedOrogenWorld,
				null,
				9,
			),
		).toBe(3)
		expect(
			displayNamesInternals.findDynastyCultureId(
				{
					provinces: { count: 1 },
					cultures: { assignment: new Int32Array([-1]) },
				} as unknown as SerializedOrogenWorld,
				null,
				4,
			),
		).toBe(-1)
	})

	it("clears lazy caches and resolves dynasty cultures from timeline data", () => {
		const world = {
			provinces: { count: 1 },
			cultures: {
				count: 1,
				assignment: new Int32Array([0]),
				languageSeeds: new Int32Array([83]),
			},
			leaderNameSeed: new Int32Array([91]),
		} as unknown as SerializedOrogenWorld
		const bundle: TimelineBundle = {
			timelines: {
				P: 1,
				startTimeMs: 0,
				endTimeMs: 10,
				parent: makeProvinceTimelineInt([[-1]]),
				assignment: makeProvinceTimelineInt([[0]]),
				populationRural: makeProvinceTimelineFloat([[0]]),
				populationUrban: makeProvinceTimelineFloat([[0]]),
				development: makeProvinceTimelineFloat([[0]]),
				consumption: makeProvinceTimelineFloat([[0]]),
				leaderDynasty: makeProvinceTimelineInt([[12]]),
				leaderNameSeed: makeProvinceTimelineInt([[101]]),
				leaderClaim: makeProvinceTimelineInt([[0]]),
				occupation: makeProvinceTimelineInt([[-1]]),
				relations: {
					aIdx: new Int32Array(),
					bIdx: new Int32Array(),
					offsets: new Int32Array(),
					times: new Float64Array(),
					values: new Int32Array(),
				},
				nationColorKeys: new Int32Array(),
				nationColorValues: new Float32Array(),
				wars: [],
			},
			events: [],
		}
		const names = createDisplayNames(world, bundle)
		const leader = names.leader(0, 0)
		const dynasty = names.dynasty(12)

		expect(displayNamesInternals.findDynastyCultureId(world, bundle, 12)).toBe(
			0,
		)
		expect(leader).not.toBe("Leader #0")
		expect(dynasty).not.toBe("Dynasty #12")
		names.clear()
		expect(names.leader(0, 0)).toBe(leader)
		expect(names.dynasty(12)).toBe(dynasty)
	})
})
