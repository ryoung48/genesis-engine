import { describe, expect, it } from "vitest"
import type { HistoryNote } from "@/model/history/state"
import { REL, YEAR_MS } from "@/model/history/state"
import {
	CULTURE_GENDER_SYSTEM,
	leaderGenderSymbol,
	resolveLeaderGender,
} from "@/model/society/gender-system"
import type { SerializedOrogenWorld } from "@/model/transport/worker-types"
import type { HistoryView } from "../history/history-query"
import type { DisplayNationModel } from "./display-model"
import {
	buildConflictDistribution,
	buildNationHistory,
	buildNationSizeDistribution,
	buildRelationDistribution,
	buildSelectedNationDetails,
	buildWindowedNationEvents,
} from "./nation-details-model"

function makeEvent(
	tag: string,
	time: number,
	data: HistoryNote["data"],
): HistoryNote {
	return { tag, time, data }
}

const getCultureName = (id: number) => `culture-${id}`
const getHeritageName = (id: number) => `heritage-${id}`
const getFaithName = (id: number) => `faith-${id}`
const getReligionName = (id: number) => `religion-${id}`

describe("buildNationSizeDistribution", () => {
	it("counts nations into size buckets", () => {
		const counts = new Map([
			[0, 1],
			[1, 3],
			[2, 60],
		])

		const result = buildNationSizeDistribution(counts)

		const bucket1 = result.find((b) => b.label === "1")
		const bucket2_4 = result.find((b) => b.label === "2-4")
		const bucket50plus = result.find((b) => b.label === "50+")

		expect(bucket1?.count).toBe(1)
		expect(bucket2_4?.count).toBe(1)
		expect(bucket50plus?.count).toBe(1)
	})

	it("returns 6 buckets matching NATION_BUCKETS length", () => {
		const result = buildNationSizeDistribution(new Map())
		expect(result).toHaveLength(6)
	})
})

describe("buildConflictDistribution", () => {
	it("returns zero counts when no history view", () => {
		const result = buildConflictDistribution(null)
		expect(result.find((b) => b.label === "Wars")?.count).toBe(0)
		expect(result.find((b) => b.label === "Rebellions")?.count).toBe(0)
	})

	it("separates wars from rebellions", () => {
		const view = {
			activeWars: [{ rebel: false }, { rebel: false }, { rebel: true }],
		} as unknown as HistoryView

		const result = buildConflictDistribution(view)

		expect(result.find((b) => b.label === "Wars")?.count).toBe(2)
		expect(result.find((b) => b.label === "Rebellions")?.count).toBe(1)
	})
})

describe("buildRelationDistribution", () => {
	it("returns empty array when no history view", () => {
		const result = buildRelationDistribution(null, null, null)
		expect(result).toEqual([])
	})

	it("counts allied pairs among neighbors", () => {
		// Complete graph: nations 0, 1, 2 all adjacent to each other
		const relations = new Map<string, number>([
			["0,1", REL.ALLY],
			["0,2", REL.NEUTRAL],
			["1,2", REL.RIVAL],
		])
		const view = {
			relationAt: (a: number, b: number) =>
				relations.get(`${Math.min(a, b)},${Math.max(a, b)}`) ?? REL.NEUTRAL,
		} as unknown as HistoryView
		const nationModel = {
			counts: new Map([
				[0, 1],
				[1, 1],
				[2, 1],
			]),
		} as unknown as DisplayNationModel
		const nationAdj = {
			adjOffset: new Int32Array([0, 2, 4, 6]),
			adjList: new Int32Array([1, 2, 0, 2, 0, 1]),
		}

		const result = buildRelationDistribution(view, nationModel, nationAdj)

		expect(result.find((b) => b.label === "Allied")?.count).toBe(1)
		expect(result.find((b) => b.label === "Rival")?.count).toBe(1)
	})
})

describe("buildSelectedNationDetails", () => {
	it("aggregates population, deduplicates neighbors, and maps active wars", () => {
		const world = {
			provinces: {
				count: 2,
				adjOffset: new Int32Array([0, 1, 2]),
				adjList: new Int32Array([1, 0]),
			},
			cultures: {
				assignment: new Int32Array([0, 1]),
				colors: new Float32Array([1, 0, 0, 0, 1, 0]),
				genderSystems: new Uint8Array([
					CULTURE_GENDER_SYSTEM.PATRIARCHAL,
					CULTURE_GENDER_SYSTEM.PATRIARCHAL,
				]),
			},
			heritages: {
				assignment: new Int32Array([0, 1]),
				colors: new Float32Array([0, 0, 1, 1, 1, 0]),
			},
			faiths: {
				assignment: new Int32Array([0, 1]),
				colors: new Float32Array([1, 0, 1, 0, 1, 1]),
			},
			religions: {
				assignment: new Int32Array([0, 1]),
				colors: new Float32Array([0.5, 0.5, 0.5, 0.25, 0.25, 0.25]),
			},
			nations: {
				parent: new Int32Array([-1, -1]),
				childOffset: new Int32Array([0, 0, 0]),
				childList: new Int32Array(0),
			},
			population: {
				population: new Float32Array([100, 40]),
				habitability: new Float32Array([10, 6]),
				habitabilityScore: 0,
				totalPopulation: 140,
			},
			leaderNameSeed: new Int32Array([99, 11]),
			leaderClaim: new Int32Array([3, 2]),
			leaderBirthYear: new Float32Array([0, 0]),
		} as unknown as SerializedOrogenWorld
		const nationModel = {
			assignment: new Int32Array([0, 1]),
			counts: new Map([
				[0, 1],
				[1, 1],
			]),
		}
		const details = buildSelectedNationDetails({
			selectedNationId: 0,
			selectedTimeMs: YEAR_MS,
			world,
			nationModel: nationModel as never,
			selectedHistoryView: {
				leaderDynasty: new Int32Array([4, 5]),
				consumption: new Float32Array([2, 1]),
				activeWars: [{ idx: 9, attacker: 0, defender: 1, rebel: false }],
				relationAt: (a: number, b: number) =>
					(a === 0 && b === 1) || (a === 1 && b === 0) ? REL.ALLY : REL.NONE,
			} as unknown as HistoryView,
			getNationColor: (nationId) => `color-${nationId}`,
			getNationName: (nationId) => `nation-${nationId}`,
			getLeaderName: (nationId, timeMs) => `leader-${nationId}-${timeMs}`,
			getDynastyName: (dynastyId) => `dynasty-${dynastyId}`,
			getCultureName,
			getHeritageName,
			getFaithName,
			getReligionName,
		})

		expect(details).toMatchObject({
			id: 0,
			name: "nation-0",
			ruler: {
				name: `leader-0-${YEAR_MS}`,
				age: 1,
				genderSymbol: leaderGenderSymbol(
					resolveLeaderGender(CULTURE_GENDER_SYSTEM.PATRIARCHAL, 99),
				),
				claimStrength: "Strong claim",
				isRegency: true,
				dynasty: "dynasty-4",
				dynastyColor: expect.stringMatching(/^rgb/),
			},
			provinceCount: 1,
			totalPopulation: 100,
			color: "color-0",
			neighbors: [
				{ id: 1, name: "nation-1", color: "color-1", relation: "Ally" },
			],
			activeWars: [
				{
					id: 9,
					opponentId: 1,
					opponentName: "nation-1",
					opponentColor: "color-1",
					role: "Attacker",
					rebel: false,
				},
			],
		})
		expect(details?.neighbors[0]?.threat).toBeGreaterThan(0)
		expect(details?.neighbors[0]?.threat).toBeLessThan(1)
		expect(details?.cultureDistribution).toEqual([
			{ label: "culture-0", count: 1, color: "rgb(255, 0, 0)" },
		])
		expect(details?.heritageDistribution).toEqual([
			{ label: "heritage-0", count: 1, color: "rgb(0, 0, 255)" },
		])
		expect(details?.faithDistribution).toEqual([
			{ label: "faith-0", count: 1, color: "rgb(255, 0, 255)" },
		])
		expect(details?.religionDistribution).toEqual([
			{ label: "religion-0", count: 1, color: "rgb(128, 128, 128)" },
		])
	})

	it("returns null for missing worlds or nations outside the display model", () => {
		expect(
			buildSelectedNationDetails({
				selectedNationId: null,
				world: null,
				nationModel: null,
				selectedHistoryView: null,
				getNationColor: () => null,
				getNationName: () => "nation",
				getCultureName,
				getHeritageName,
				getFaithName,
				getReligionName,
			}),
		).toBeNull()

		expect(
			buildSelectedNationDetails({
				selectedNationId: 4,
				world: {
					provinces: { count: 1 },
					nations: {
						parent: new Int32Array([-1]),
						childOffset: new Int32Array([0, 0]),
						childList: new Int32Array(0),
					},
				} as unknown as SerializedOrogenWorld,
				nationModel: {
					assignment: new Int32Array([0]),
					counts: new Map([[0, 1]]),
					adjOffset: new Int32Array([0, 0]),
					adjList: new Int32Array(0),
				} as never,
				selectedHistoryView: null,
				getNationColor: () => null,
				getNationName: () => "nation",
				getCultureName,
				getHeritageName,
				getFaithName,
				getReligionName,
			}),
		).toBeNull()
	})

	it("returns null for each missing prerequisite branch in selected nation details", () => {
		const baseWorld = {
			provinces: { count: 1 },
			nations: {
				parent: new Int32Array([-1]),
				childOffset: new Int32Array([0, 0]),
				childList: new Int32Array(0),
			},
		} as unknown as SerializedOrogenWorld
		const baseNationModel = {
			assignment: new Int32Array([0]),
			counts: new Map([[0, 1]]),
			adjOffset: new Int32Array([0, 0]),
			adjList: new Int32Array(0),
		} as never

		expect(
			buildSelectedNationDetails({
				selectedNationId: 0,
				world: { provinces: { count: 1 } } as never,
				nationModel: baseNationModel,
				selectedHistoryView: null,
				getNationColor: () => null,
				getNationName: () => "nation",
				getCultureName,
				getHeritageName,
				getFaithName,
				getReligionName,
			}),
		).toBeNull()
		expect(
			buildSelectedNationDetails({
				selectedNationId: 0,
				world: { nations: baseWorld.nations } as never,
				nationModel: baseNationModel,
				selectedHistoryView: null,
				getNationColor: () => null,
				getNationName: () => "nation",
				getCultureName,
				getHeritageName,
				getFaithName,
				getReligionName,
			}),
		).toBeNull()
		expect(
			buildSelectedNationDetails({
				selectedNationId: null,
				world: baseWorld,
				nationModel: baseNationModel,
				selectedHistoryView: null,
				getNationColor: () => null,
				getNationName: () => "nation",
				getCultureName,
				getHeritageName,
				getFaithName,
				getReligionName,
			}),
		).toBeNull()
		expect(
			buildSelectedNationDetails({
				selectedNationId: 0,
				world: baseWorld,
				nationModel: null,
				selectedHistoryView: null,
				getNationColor: () => null,
				getNationName: () => "nation",
				getCultureName,
				getHeritageName,
				getFaithName,
				getReligionName,
			}),
		).toBeNull()
		expect(
			buildSelectedNationDetails({
				selectedNationId: -1,
				world: baseWorld,
				nationModel: baseNationModel,
				selectedHistoryView: null,
				getNationColor: () => null,
				getNationName: () => "nation",
				getCultureName,
				getHeritageName,
				getFaithName,
				getReligionName,
			}),
		).toBeNull()
	})

	it("drops threats when wealth inputs are unavailable and excludes allied targets", () => {
		const world = {
			provinces: {
				count: 3,
				adjOffset: new Int32Array([0, 2, 3, 4]),
				adjList: new Int32Array([1, 2, 0, 0]),
			},
			nations: {
				parent: new Int32Array([-1, -1, -1]),
				childOffset: new Int32Array([0, 0, 0, 0]),
				childList: new Int32Array(0),
			},
		} as unknown as SerializedOrogenWorld
		const details = buildSelectedNationDetails({
			selectedNationId: 0,
			world,
			nationModel: {
				assignment: new Int32Array([0, 1, 2]),
				counts: new Map([
					[0, 1],
					[1, 1],
					[2, 1],
				]),
			} as never,
			selectedHistoryView: {
				activeWars: [],
				relationAt: (a: number, b: number) => {
					if ((a === 0 && b === 1) || (a === 1 && b === 0)) return REL.ALLY
					if ((a === 0 && b === 2) || (a === 2 && b === 0)) return REL.RIVAL
					return REL.NONE
				},
			} as unknown as HistoryView,
			getNationColor: () => null,
			getNationName: (nationId) => `nation-${nationId}`,
			getCultureName,
			getHeritageName,
			getFaithName,
			getReligionName,
		})

		expect(details?.neighbors).toEqual([
			{ id: 1, name: "nation-1", color: null, relation: "Ally", threat: null },
			{ id: 2, name: "nation-2", color: null, relation: "Rival", threat: null },
		])
	})

	it("applies recursive wealth penalties, defender war roles, and unknown relation fallbacks", () => {
		const world = {
			provinces: {
				count: 6,
				adjOffset: new Int32Array([0, 2, 2, 2, 2, 3, 4]),
				adjList: new Int32Array([4, 5, 0, 0]),
			},
			nations: {
				parent: new Int32Array([-1, 0, 0, 0, 0, 0]),
				childOffset: new Int32Array([0, 5, 5, 5, 5, 5, 5]),
				childList: new Int32Array([1, 2, 3, 4, 5]),
			},
			population: {
				population: new Float32Array([50, 40, 30, 20, 10, 5]),
				habitability: new Float32Array([30, 18, 17, 16, 20, 19]),
				habitabilityScore: 0,
				totalPopulation: 155,
			},
		} as unknown as SerializedOrogenWorld
		const details = buildSelectedNationDetails({
			selectedNationId: 0,
			world,
			nationModel: {
				assignment: new Int32Array([0, 1, 2, 3, 4, 5]),
				counts: new Map([
					[0, 1],
					[1, 1],
					[2, 1],
					[3, 1],
					[4, 1],
					[5, 1],
				]),
			} as never,
			selectedHistoryView: {
				consumption: new Float32Array([3, 2, 2, 2, 3, 3]),
				activeWars: [
					{ idx: 10, attacker: 4, defender: 0, rebel: false },
					{ idx: 11, attacker: 4, defender: 5, rebel: false },
				],
				relationAt: (a: number, b: number) => {
					if ((a === 0 && b === 1) || (a === 1 && b === 0)) return REL.VASSAL
					if ((a === 4 && b === 5) || (a === 5 && b === 4)) return REL.ALLY
					if ((a === 0 && b === 4) || (a === 4 && b === 0)) return REL.OVERLORD
					if ((a === 0 && b === 2) || (a === 2 && b === 0)) return REL.ALLY
					if ((a === 0 && b === 3) || (a === 3 && b === 0)) return REL.PU_JUNIOR
					return 999
				},
			} as unknown as HistoryView,
			getNationColor: (nationId) => `color-${nationId}`,
			getNationName: (nationId) => `nation-${nationId}`,
			getCultureName,
			getHeritageName,
			getFaithName,
			getReligionName,
		})

		expect(details).toMatchObject({
			id: 0,
			name: "nation-0",
			totalPopulation: 50,
			activeWars: [
				{
					id: 10,
					opponentId: 4,
					opponentName: "nation-4",
					opponentColor: "color-4",
					role: "Defender",
					rebel: false,
				},
			],
			neighbors: [
				{ id: 4, name: "nation-4", color: "color-4", relation: "Overlord" },
				{ id: 5, name: "nation-5", color: "color-5", relation: "Unknown" },
			],
		})
		expect(details?.neighbors[0]?.threat).toBeGreaterThan(0)
		expect(details?.neighbors[1]?.threat).toBeGreaterThan(0)
	})

	it("computes historical neighbors lazily from province adjacency", () => {
		const world = {
			provinces: {
				count: 4,
				adjOffset: new Int32Array([0, 2, 4, 6, 8]),
				adjList: new Int32Array([1, 2, 0, 3, 0, 3, 1, 2]),
			},
			nations: {
				parent: new Int32Array([-1, -1, -1, -1]),
				childOffset: new Int32Array([0, 0, 0, 0, 0]),
				childList: new Int32Array(0),
			},
			population: {
				population: new Float32Array([10, 20, 30, 40]),
				habitability: new Float32Array([5, 6, 7, 8]),
				habitabilityScore: 0,
				totalPopulation: 100,
			},
		} as unknown as SerializedOrogenWorld
		const details = buildSelectedNationDetails({
			selectedNationId: 0,
			world,
			nationModel: {
				assignment: new Int32Array([0, 0, 1, 2]),
				counts: new Map([
					[0, 2],
					[1, 1],
					[2, 1],
				]),
			} as never,
			selectedHistoryView: {
				consumption: new Float32Array([1, 1, 1, 1]),
				activeWars: [],
				relationAt: (a: number, b: number) => {
					if ((a === 0 && b === 1) || (a === 1 && b === 0)) return REL.ALLY
					if ((a === 0 && b === 2) || (a === 2 && b === 0)) return REL.RIVAL
					return REL.NONE
				},
			} as unknown as HistoryView,
			getNationColor: (nationId) => `color-${nationId}`,
			getNationName: (nationId) => `nation-${nationId}`,
			getCultureName,
			getHeritageName,
			getFaithName,
			getReligionName,
		})

		expect(details?.neighbors).toEqual([
			expect.objectContaining({
				id: 1,
				name: "nation-1",
				color: "color-1",
				relation: "Ally",
			}),
			expect.objectContaining({
				id: 2,
				name: "nation-2",
				color: "color-2",
				relation: "Rival",
			}),
		])
		expect(details?.neighbors[0]?.threat).toBeGreaterThan(0)
		expect(details?.neighbors[1]?.threat).toBeGreaterThan(0)
	})

	it("always uses province adjacency for neighbor resolution", () => {
		const world = {
			provinces: {
				count: 4,
				adjOffset: new Int32Array([0, 2, 4, 6, 8]),
				adjList: new Int32Array([1, 2, 0, 3, 0, 3, 1, 2]),
			},
			nations: {
				parent: new Int32Array([-1, -1, -1, -1]),
				childOffset: new Int32Array([0, 0, 0, 0, 0]),
				childList: new Int32Array(0),
			},
			population: {
				population: new Float32Array([10, 20, 30, 40]),
				habitability: new Float32Array([5, 6, 7, 8]),
				habitabilityScore: 0,
				totalPopulation: 100,
			},
		} as unknown as SerializedOrogenWorld
		const details = buildSelectedNationDetails({
			selectedNationId: 0,
			world,
			nationModel: {
				assignment: new Int32Array([0, 0, 1, 2]),
				counts: new Map([
					[0, 2],
					[1, 1],
					[2, 1],
				]),
			} as never,
			selectedHistoryView: {
				consumption: new Float32Array([1, 1, 1, 1]),
				activeWars: [],
				relationAt: (a: number, b: number) => {
					if ((a === 0 && b === 1) || (a === 1 && b === 0)) return REL.ALLY
					if ((a === 0 && b === 2) || (a === 2 && b === 0)) return REL.RIVAL
					return REL.NONE
				},
			} as unknown as HistoryView,
			getNationColor: () => null,
			getNationName: (nationId) => `nation-${nationId}`,
			getCultureName,
			getHeritageName,
			getFaithName,
			getReligionName,
		})

		expect(details?.neighbors.map((neighbor) => neighbor.id)).toEqual([1, 2])
	})

	it("uses default relations, empty wars, and zeroed history wealth fallbacks", () => {
		const world = {
			provinces: {
				count: 2,
				adjOffset: new Int32Array([0, 1, 2]),
				adjList: new Int32Array([1, 0]),
			},
			nations: {
				parent: new Int32Array([-1, -1]),
				childOffset: new Int32Array([0, 0, 0]),
				childList: new Int32Array(0),
			},
		} as unknown as SerializedOrogenWorld
		const details = buildSelectedNationDetails({
			selectedNationId: 0,
			world,
			nationModel: {
				assignment: new Int32Array([0, 1]),
				counts: new Map([
					[0, 1],
					[1, 1],
				]),
			} as never,
			selectedHistoryView: null,
			getNationColor: () => null,
			getNationName: (nationId) => `nation-${nationId}`,
			getCultureName,
			getHeritageName,
			getFaithName,
			getReligionName,
		})
		const history = buildNationHistory({
			selectedNationId: 1,
			historyQuery: {
				getView: () => ({
					assignment: new Int32Array([1, 1]),
					getNationWealth: () => 0,
					getNationOptimalWealth: () => 0,
				}),
			} as never,
			selectedTimeMs: 0,
			simStartTimeMs: 0,
			simTimeMs: 0,
			world: {
				provinces: { count: 2 },
			} as unknown as SerializedOrogenWorld,
		})

		expect(details).toMatchObject({
			id: 0,
			name: "nation-0",
			activeWars: [],
			neighbors: [
				{
					id: 1,
					name: "nation-1",
					color: null,
					relation: "None",
					threat: null,
				},
			],
		})
		expect(history).toEqual([
			{ timeMs: 0, size: 2, wealth: 0, optimalWealth: 0 },
		])
	})

	it("prefers lazy history wealth accessors over eager snapshot arrays", () => {
		const history = buildNationHistory({
			selectedNationId: 1,
			historyQuery: {
				getView: () => ({
					assignment: new Int32Array([1, 1]),
					nationWealth: new Float32Array([10, 20]),
					nationOptimalWealth: new Float32Array([30, 40]),
					getNationWealth: (nationId: number) => nationId + 100,
					getNationOptimalWealth: (nationId: number) => nationId + 200,
				}),
			} as never,
			selectedTimeMs: 0,
			simStartTimeMs: 0,
			simTimeMs: 0,
			world: {
				provinces: { count: 2 },
			} as unknown as SerializedOrogenWorld,
		})

		expect(history).toEqual([
			{ timeMs: 0, size: 2, wealth: 101, optimalWealth: 201 },
		])
	})

	it("returns no neighbors when province adjacency is absent", () => {
		const details = buildSelectedNationDetails({
			selectedNationId: 1,
			world: {
				provinces: { count: 2 },
				nations: {
					parent: new Int32Array([-1, -1]),
					childOffset: new Int32Array([0, 0, 0]),
					childList: new Int32Array(0),
				},
			} as unknown as SerializedOrogenWorld,
			nationModel: {
				assignment: new Int32Array([0, 1]),
				counts: new Map([[1, 1]]),
			} as never,
			selectedHistoryView: null,
			getNationColor: () => null,
			getNationName: (nationId) => `nation-${nationId}`,
			getCultureName,
			getHeritageName,
			getFaithName,
			getReligionName,
		})

		expect(details).toMatchObject({
			id: 1,
			name: "nation-1",
			neighbors: [],
		})
	})

	it("uses world dynasty fallbacks and allows ruler entries without a named dynasty", () => {
		const details = buildSelectedNationDetails({
			selectedNationId: 0,
			selectedTimeMs: 0,
			world: {
				provinces: { count: 1 },
				leaderDynasty: new Int32Array([-1]),
				nations: {
					parent: new Int32Array([-1]),
					childOffset: new Int32Array([0, 0]),
					childList: new Int32Array(0),
				},
			} as unknown as SerializedOrogenWorld,
			nationModel: {
				assignment: new Int32Array([0]),
				counts: new Map([[0, 1]]),
				adjOffset: new Int32Array([0, 0]),
				adjList: new Int32Array(0),
			} as never,
			selectedHistoryView: null,
			getNationColor: () => null,
			getNationName: (nationId) => `nation-${nationId}`,
			getLeaderName: (nationId, timeMs) => `leader-${nationId}-${timeMs}`,
			getCultureName,
			getHeritageName,
			getFaithName,
			getReligionName,
		})

		expect(details?.ruler).toEqual({
			name: "leader-0-0",
			age: null,
			genderSymbol: null,
			claimStrength: null,
			isRegency: false,
			dynasty: null,
			dynastyColor: null,
		})
	})

	it("omits ruler info when the selected time or leader formatter is unavailable", () => {
		const world = {
			provinces: { count: 1 },
			leaderDynasty: new Int32Array([3]),
			nations: {
				parent: new Int32Array([-1]),
				childOffset: new Int32Array([0, 0]),
				childList: new Int32Array(0),
			},
		} as unknown as SerializedOrogenWorld
		const nationModel = {
			assignment: new Int32Array([0]),
			counts: new Map([[0, 1]]),
			adjOffset: new Int32Array([0, 0]),
			adjList: new Int32Array(0),
		} as never

		const missingTime = buildSelectedNationDetails({
			selectedNationId: 0,
			world,
			nationModel,
			selectedHistoryView: null,
			getNationColor: () => null,
			getNationName: (nationId) => `nation-${nationId}`,
			getLeaderName: (nationId, timeMs) => `leader-${nationId}-${timeMs}`,
			getDynastyName: (dynastyId) => `dynasty-${dynastyId}`,
			getCultureName,
			getHeritageName,
			getFaithName,
			getReligionName,
		})
		const missingLeaderName = buildSelectedNationDetails({
			selectedNationId: 0,
			selectedTimeMs: 0,
			world,
			nationModel,
			selectedHistoryView: null,
			getNationColor: () => null,
			getNationName: (nationId) => `nation-${nationId}`,
			getDynastyName: (dynastyId) => `dynasty-${dynastyId}`,
			getCultureName,
			getHeritageName,
			getFaithName,
			getReligionName,
		})

		expect(missingTime?.ruler).toBeNull()
		expect(missingLeaderName?.ruler).toBeNull()
	})

	it("uses world dynasty data for named rulers when no history snapshot is present", () => {
		const details = buildSelectedNationDetails({
			selectedNationId: 0,
			selectedTimeMs: 0,
			world: {
				provinces: { count: 1 },
				leaderDynasty: new Int32Array([3]),
				nations: {
					parent: new Int32Array([-1]),
					childOffset: new Int32Array([0, 0]),
					childList: new Int32Array(0),
				},
			} as unknown as SerializedOrogenWorld,
			nationModel: {
				assignment: new Int32Array([0]),
				counts: new Map([[0, 1]]),
				adjOffset: new Int32Array([0, 0]),
				adjList: new Int32Array(0),
			} as never,
			selectedHistoryView: null,
			getNationColor: () => null,
			getNationName: (nationId) => `nation-${nationId}`,
			getLeaderName: (nationId, timeMs) => `leader-${nationId}-${timeMs}`,
			getDynastyName: (dynastyId) => `dynasty-${dynastyId}`,
			getCultureName,
			getHeritageName,
			getFaithName,
			getReligionName,
		})

		expect(details?.ruler).toEqual({
			name: "leader-0-0",
			age: null,
			genderSymbol: null,
			claimStrength: null,
			isRegency: false,
			dynasty: "dynasty-3",
			dynastyColor: expect.stringMatching(/^rgb/),
		})
	})

	it("skips unresolved demographic groups and falls back when partition colors are missing", () => {
		const details = buildSelectedNationDetails({
			selectedNationId: 0,
			world: {
				provinces: { count: 4 },
				cultures: {
					assignment: new Int32Array([1, 0, 1, -1]),
					colors: new Float32Array([1, 0, 0]),
				},
				heritages: {
					assignment: new Int32Array([2, 1]),
					colors: new Float32Array([0, 1, 0]),
				},
				faiths: {
					assignment: new Int32Array([-1, 0]),
					colors: new Float32Array(0),
				},
				religions: {
					assignment: new Int32Array([0]),
					colors: new Float32Array(0),
				},
				nations: {
					parent: new Int32Array([-1]),
					childOffset: new Int32Array([0, 0]),
					childList: new Int32Array(0),
				},
				population: {
					population: new Float32Array([10, 20, 30, 40]),
					habitability: new Float32Array([5, 5, 5, 5]),
					habitabilityScore: 0,
					totalPopulation: 100,
				},
			} as unknown as SerializedOrogenWorld,
			nationModel: {
				assignment: new Int32Array([0, 0, 0, 0]),
				counts: new Map([[0, 4]]),
				adjOffset: new Int32Array([0, 0]),
				adjList: new Int32Array(0),
			} as never,
			selectedHistoryView: null,
			getNationColor: () => "color-0",
			getNationName: (nationId) => `nation-${nationId}`,
			getCultureName,
			getHeritageName,
			getFaithName,
			getReligionName,
		})

		expect(details?.cultureDistribution).toEqual([
			{ label: "culture-1", count: 2, color: "rgb(148, 163, 184)" },
			{ label: "culture-0", count: 1, color: "rgb(255, 0, 0)" },
		])
		expect(details?.heritageDistribution).toEqual([
			{ label: "heritage-1", count: 2, color: "rgb(148, 163, 184)" },
			{ label: "heritage-2", count: 1, color: "rgb(148, 163, 184)" },
		])
		expect(details?.faithDistribution).toEqual([
			{ label: "faith-0", count: 2, color: "rgb(148, 163, 184)" },
		])
		expect(details?.religionDistribution).toEqual([
			{ label: "religion-0", count: 2, color: "rgb(148, 163, 184)" },
		])
	})
})

describe("buildNationHistory", () => {
	it("builds yearly points over the clamped history window", () => {
		const views = new Map([
			[
				0,
				{
					assignment: new Int32Array([1, 0, 1]),
					getNationWealth: (nationId: number) =>
						new Float32Array([4, 10])[nationId] ?? 0,
					getNationOptimalWealth: (nationId: number) =>
						new Float32Array([6, 12])[nationId] ?? 0,
				},
			],
			[
				YEAR_MS,
				{
					assignment: new Int32Array([1, 1, 0]),
					getNationWealth: (nationId: number) =>
						new Float32Array([5, 11])[nationId] ?? 0,
					getNationOptimalWealth: (nationId: number) =>
						new Float32Array([7, 13])[nationId] ?? 0,
				},
			],
			[
				2 * YEAR_MS,
				{
					assignment: new Int32Array([0, 1, 0]),
					getNationWealth: (nationId: number) =>
						new Float32Array([6, 12])[nationId] ?? 0,
					getNationOptimalWealth: (nationId: number) =>
						new Float32Array([8, 14])[nationId] ?? 0,
				},
			],
		])

		const result = buildNationHistory({
			selectedNationId: 1,
			historyQuery: {
				getView: (timeMs: number) => views.get(timeMs),
			} as never,
			selectedTimeMs: YEAR_MS,
			simStartTimeMs: 0,
			simTimeMs: 2 * YEAR_MS,
			world: {
				provinces: { count: 3 },
			} as unknown as SerializedOrogenWorld,
		})

		expect(result).toEqual([
			{ timeMs: 0, size: 2, wealth: 10, optimalWealth: 12 },
			{ timeMs: YEAR_MS, size: 2, wealth: 11, optimalWealth: 13 },
			{ timeMs: 2 * YEAR_MS, size: 1, wealth: 12, optimalWealth: 14 },
		])
	})

	it("falls back to snapshot wealth arrays when lazy accessors are unavailable", () => {
		const result = buildNationHistory({
			selectedNationId: 1,
			historyQuery: {
				getView: () => ({
					assignment: new Int32Array([1, 0, 1]),
					nationWealth: new Float32Array([4, 10]),
					nationOptimalWealth: new Float32Array([6, 12]),
				}),
			} as never,
			selectedTimeMs: 0,
			simStartTimeMs: 0,
			simTimeMs: 0,
			world: {
				provinces: { count: 3 },
			} as unknown as SerializedOrogenWorld,
		})

		expect(result).toEqual([
			{ timeMs: 0, size: 2, wealth: 10, optimalWealth: 12 },
		])
	})

	it("returns undefined without a selected nation, history query, or provinces", () => {
		expect(
			buildNationHistory({
				selectedNationId: null,
				historyQuery: null,
				selectedTimeMs: 0,
				simStartTimeMs: 0,
				simTimeMs: YEAR_MS,
				world: null,
			}),
		).toBeUndefined()
	})

	it("returns undefined when the world lacks provinces even with the other history inputs", () => {
		expect(
			buildNationHistory({
				selectedNationId: 0,
				historyQuery: {
					getView: () => ({
						assignment: new Int32Array([0]),
						getNationWealth: () => 0,
						getNationOptimalWealth: () => 0,
					}),
				} as never,
				selectedTimeMs: 0,
				simStartTimeMs: 0,
				simTimeMs: YEAR_MS,
				world: { nations: {} } as never,
			}),
		).toBeUndefined()
	})
})

describe("buildWindowedNationEvents", () => {
	it("filters to involved events, sorts them, and caps the result to the newest 50", () => {
		const result = buildWindowedNationEvents({
			selectedNationId: 2,
			historyQuery: {
				getEventsInRange: () => [
					...Array.from({ length: 55 }, (_, index) =>
						makeEvent("war started", (54 - index) * YEAR_MS, {
							attacker: 2,
							defender: 100 + index,
							war: index,
						}),
					),
					makeEvent("war started", YEAR_MS, {
						attacker: 7,
						defender: 8,
						war: 999,
					}),
				],
			} as never,
			nationHistory: [{ timeMs: 0 }, { timeMs: 54 * YEAR_MS }] as never,
		})

		expect(result).toHaveLength(50)
		expect(result?.[0]?.time).toBe(5 * YEAR_MS)
		expect(result?.[49]?.time).toBe(54 * YEAR_MS)
		expect(result?.every((event) => event.data.attacker === 2)).toBe(true)
	})

	it("returns undefined when the event window cannot be established", () => {
		expect(
			buildWindowedNationEvents({
				selectedNationId: 2,
				historyQuery: null,
				nationHistory: undefined,
			}),
		).toBeUndefined()
	})

	it("returns undefined for null nations and empty history windows", () => {
		expect(
			buildWindowedNationEvents({
				selectedNationId: null,
				historyQuery: {
					getEventsInRange: (): HistoryNote[] => [],
				} as never,
				nationHistory: [{ timeMs: 0 }] as never,
			}),
		).toBeUndefined()
		expect(
			buildWindowedNationEvents({
				selectedNationId: 2,
				historyQuery: {
					getEventsInRange: (): HistoryNote[] => [],
				} as never,
				nationHistory: [],
			}),
		).toBeUndefined()
	})

	it("returns the full sorted event list when the window stays under the cap", () => {
		const result = buildWindowedNationEvents({
			selectedNationId: 2,
			historyQuery: {
				getEventsInRange: () => [
					makeEvent("war started", 2 * YEAR_MS, {
						attacker: 2,
						defender: 9,
						war: 1,
					}),
					makeEvent("war started", YEAR_MS, {
						attacker: 8,
						defender: 2,
						war: 2,
					}),
				],
			} as never,
			nationHistory: [{ timeMs: 0 }, { timeMs: 2 * YEAR_MS }] as never,
		})

		expect(result?.map((event) => event.time)).toEqual([YEAR_MS, 2 * YEAR_MS])
	})
})

describe("buildRelationDistribution", () => {
	it("counts every relation bucket including neutral neighbor pairs", () => {
		const nations = new Map([
			[0, 1],
			[1, 1],
			[2, 1],
			[3, 1],
			[4, 1],
		])
		const relations = new Map<string, number>([
			["0,1", REL.OVERLORD],
			["0,2", REL.PU_SENIOR],
			["0,3", REL.ALLY],
			["0,4", REL.FRIENDLY],
			["1,2", REL.SUSPICIOUS],
			["1,3", REL.RIVAL],
			["1,4", REL.WAR],
		])
		// Complete graph: all 5 nations are neighbors with each other
		const nationAdj = {
			adjOffset: new Int32Array([0, 4, 8, 12, 16, 20]),
			adjList: new Int32Array([
				1, 2, 3, 4, 0, 2, 3, 4, 0, 1, 3, 4, 0, 1, 2, 4, 0, 1, 2, 3,
			]),
		}
		const nationModel = {
			counts: nations,
		} as unknown as DisplayNationModel

		const result = buildRelationDistribution(
			{
				relationAt: (a: number, b: number) =>
					relations.get(`${Math.min(a, b)},${Math.max(a, b)}`) ?? REL.NEUTRAL,
			} as unknown as HistoryView,
			nationModel,
			nationAdj,
		)

		expect(result.find((bucket) => bucket.label === "Vassal")?.count).toBe(1)
		expect(
			result.find((bucket) => bucket.label === "Personal Union")?.count,
		).toBe(1)
		expect(result.find((bucket) => bucket.label === "Allied")?.count).toBe(1)
		expect(result.find((bucket) => bucket.label === "Friendly")?.count).toBe(1)
		expect(result.find((bucket) => bucket.label === "Suspicious")?.count).toBe(
			1,
		)
		expect(result.find((bucket) => bucket.label === "Rival")?.count).toBe(1)
		expect(result.find((bucket) => bucket.label === "War")?.count).toBe(1)
		expect(result.find((bucket) => bucket.label === "Neutral")?.count).toBe(3)
	})
})
