import { beforeEach, describe, expect, it, vi } from "vitest"

const historyState = {
	time: 1234,
	leaderDynCurrent: new Int32Array([11]),
	leaderNameSeedCurrent: new Int32Array([22]),
	leaderClaimCurrent: [33],
	leaderBirthYearCurrent: new Float32Array([44]),
	routes: { id: "routes" },
	network: { id: "network" },
	events: [] as Array<unknown>,
}

const historyFrame = {
	timeMs: 1234,
	assignment: new Int32Array([1]),
	parent: new Int32Array([0]),
	sovereign: new Int32Array([0]),
	leaderDynasty: new Int32Array([11]),
	leaderNameSeed: new Int32Array([22]),
	leaderClaim: new Int32Array([33]),
	leaderBirthYear: new Float32Array([44]),
	colors: new Float32Array([0.1, 0.2, 0.3]),
	populationTotal: new Float32Array([100]),
	populationUrban: new Float32Array([25]),
	development: new Float32Array([5]),
	consumption: new Float32Array([6]),
	nationWealth: new Float32Array([7]),
	nationOptimalWealth: new Float32Array([8]),
	relationA: new Int32Array(0),
	relationB: new Int32Array(0),
	relationValues: new Int32Array(0),
	cultureBlendSecondary: new Int32Array([0]),
	cultureBlendWeight: new Float32Array([0]),
}

const mockHistoryApi = vi.hoisted(() => ({
	createHistoryRng: vi.fn(() => ({ rng: "history" })),
	initHistory: vi.fn(() => historyState),
	simulateUntil: vi.fn(),
}))

const mockSnapshotApi = vi.hoisted(() => ({
	buildHistoryFrame: vi.fn(() => historyFrame),
	serializeHistoryTimelines: vi.fn(() => ({
		parent: {
			times: new Float64Array(0),
			values: new Int32Array(0),
			offsets: new Int32Array([0, 0]),
		},
		assignment: {
			times: new Float64Array(0),
			values: new Int32Array(0),
			offsets: new Int32Array([0, 0]),
		},
		populationRural: {
			times: new Float64Array(0),
			values: new Float32Array(0),
			offsets: new Int32Array([0, 0]),
		},
		populationUrban: {
			times: new Float64Array(0),
			values: new Float32Array(0),
			offsets: new Int32Array([0, 0]),
		},
		development: {
			times: new Float64Array(0),
			values: new Float32Array(0),
			offsets: new Int32Array([0, 0]),
		},
		consumption: {
			times: new Float64Array(0),
			values: new Float32Array(0),
			offsets: new Int32Array([0, 0]),
		},
		leaderDynasty: {
			times: new Float64Array(0),
			values: new Int32Array(0),
			offsets: new Int32Array([0, 0]),
		},
		leaderNameSeed: {
			times: new Float64Array(0),
			values: new Int32Array(0),
			offsets: new Int32Array([0, 0]),
		},
		leaderClaim: {
			times: new Float64Array(0),
			values: new Int32Array(0),
			offsets: new Int32Array([0, 0]),
		},
		leaderBirthYear: {
			times: new Float64Array(0),
			values: new Float32Array(0),
			offsets: new Int32Array([0, 0]),
		},
		occupation: {
			times: new Float64Array(0),
			values: new Int32Array(0),
			offsets: new Int32Array([0, 0]),
		},
		relations: {
			aIdx: new Int32Array(0),
			bIdx: new Int32Array(0),
			offsets: new Int32Array([0]),
			times: new Float64Array(0),
			values: new Int32Array(0),
		},
		nationColorKeys: new Int32Array(0),
		nationColorValues: new Float32Array(0),
		wars: [] as Array<unknown>,
		P: 1,
		startTimeMs: 0,
		endTimeMs: 0,
	})),
}))

const mockFieldsApi = vi.hoisted(() => ({
	PROV: {
		development: {
			get: vi.fn(() => 5),
		},
		population: {
			urban: {
				get: vi.fn(() => 25),
			},
		},
	},
}))

const mockWorkerTypesApi = vi.hoisted(() => ({
	packRoutes: vi.fn(() => ({
		fromProvince: new Int32Array(0),
		toProvince: new Int32Array(0),
		kind: new Uint8Array(0),
		pathOffsets: new Int32Array([0]),
		pathRegions: new Int32Array(0),
	})),
	packNetwork: vi.fn(() => ({
		fromRegion: new Int32Array(0),
		toRegion: new Int32Array(0),
		kind: new Uint8Array(0),
		usage: new Float32Array(0),
		weight: new Float32Array(0),
	})),
}))

vi.mock("./history", () => ({
	...mockHistoryApi,
	YEAR_MS: 31_536_000_000,
}))

vi.mock("./history/snapshot", () => mockSnapshotApi)
vi.mock("./history/fields", () => mockFieldsApi)
vi.mock("./history/state", () => ({
	validateLiveHierarchy: vi.fn(),
}))
vi.mock("./transport/worker-types", () => mockWorkerTypesApi)
vi.mock("./pipelines/import-heightmap", () => ({
	importGenesisWorld: vi.fn(),
}))
vi.mock("./pipelines/generate-world", () => ({
	generateGenesisWorld: vi.fn((params: { seed: number }) =>
		makeGeneratedWorld(params.seed),
	),
}))

function makeGeneratedWorld(seed: number) {
	return {
		mesh: {
			numRegions: 1,
			numTriangles: 1,
			numSides: 1,
			r_xyz: new Float32Array([0, 0, 1]),
			t_xyz: new Float32Array([0, 1, 0]),
			triangles: new Int32Array([0, 0, 0]),
			halfedges: new Int32Array([0, 0, 0]),
			adjOffset: new Int32Array([0, 0]),
			adjList: new Int32Array(0),
			neighborDist: new Float32Array(0),
			s_begin_r: new Int32Array(0),
			s_end_r: new Int32Array(0),
			s_inner_t: new Int32Array(0),
			s_outer_t: new Int32Array(0),
		},
		plateAssignment: new Int32Array([0]),
		elevation: new Float32Array([0]),
		elevation_km: new Float32Array([0]),
		params: { seed, planetRadiusKm: 6371 },
		timings: [] as Array<{ Stage: string; ms: string }>,
		continentCount: 1,
		climate: {
			temperature_avg: new Float32Array([0]),
			temperature_min: new Float32Array([0]),
			temperature_max: new Float32Array([0]),
			temperature_monthly: new Float32Array(12),
			temperature_monthly_nolapse: new Float32Array(12),
			temperature_monthly_range: new Float32Array(12),
			insolation_monthly: new Float32Array(12),
			pet_monthly: new Float32Array(12),
			daylight_hours_monthly: new Float32Array(12),
			landFraction: [1],
		},
		oceanDist: new Float32Array([0]),
		rainfall: {
			monthly: new Float32Array(12),
			annual: new Float32Array([0]),
			east: new Float32Array([0]),
			west: new Float32Array([0]),
		},
		hazards: {
			earthquake: new Float32Array([0]),
			volcano: new Float32Array([0]),
			danger: new Float32Array([0]),
		},
		volcanism: {
			hotspot: new Float32Array([0]),
			mantleUpwelling: new Float32Array([0]),
		},
		climateZones: new Uint8Array([0]),
		pastaClimate: new Uint8Array([0]),
		iceThickness: new Float32Array([0]),
		iceMinMonthly: new Float32Array([0]),
		iceMaxMonthly: new Float32Array([0]),
		koppenClimate: new Uint8Array([0]),
		vegetation: new Uint8Array([0]),
		topography: new Uint8Array([0]),
		coastal: new Uint8Array([1]),
		waterAccess: new Uint8Array([1]),
		riverAccess: new Uint8Array([0]),
		lakeAccess: new Uint8Array([0]),
		slopeScore: new Float32Array([0]),
		isLand: new Uint8Array([1]),
		riverLand: new Uint8Array([0]),
		dtr_annual: new Float32Array([0]),
		dtr_monthly: new Float32Array(12),
		rivers: {
			lines: [] as Array<[number, number, number, number][]>,
			maxFlow: 0,
			minFlow: 0,
			flow: new Float32Array([0]),
			flow_monthly: new Float32Array(12),
			riverId: new Int32Array([0]),
			riverLengthKm: new Float32Array([0]),
			visible: new Uint8Array([1]),
			lakes: new Uint8Array([0]),
			basinId: new Int32Array([0]),
			waterLevel: new Float32Array([0]),
		},
		provinces: {
			regionProvince: new Int32Array([0]),
			seeds: new Int32Array([101]),
			count: 1,
			desolate: new Uint8Array([0]),
			landmassId: new Int32Array([0]),
			adjOffset: new Int32Array([0, 0]),
			adjList: new Int32Array(0),
			size: new Int32Array([1]),
			colors: new Float32Array([0.2, 0.3, 0.4]),
			waterAccess: new Uint8Array([1]),
			riverAccess: new Uint8Array([0]),
			lakeAccess: new Uint8Array([0]),
		},
		nations: {
			assignment: new Int32Array([0]),
			seeds: new Int32Array([202]),
			languageSeeds: new Int32Array([303]),
			nameSeeds: new Int32Array([404]),
			count: 1,
			adjOffset: new Int32Array([0, 0]),
			adjList: new Int32Array(0),
			size: new Int32Array([1]),
			colors: new Float32Array([0.5, 0.6, 0.7]),
			parent: new Int32Array([0]),
			depth: new Int32Array([0]),
			childOffset: new Int32Array([0, 0]),
			childList: new Int32Array(0),
			sovereign: new Int32Array([0]),
			gravity: new Float32Array([1]),
		},
		cultures: {
			assignment: new Int32Array([0]),
			seeds: new Int32Array([505]),
			count: 1,
			adjOffset: new Int32Array([0, 0]),
			adjList: new Int32Array(0),
			size: new Int32Array([1]),
			colors: new Float32Array([0.1, 0.2, 0.3]),
			genderSystems: new Uint8Array([0]),
		},
		population: {
			habitability: new Float32Array([1]),
			population: new Float32Array([100]),
			habitabilityScore: 1,
			totalPopulation: 100,
		},
	}
}

describe("genesis worker", () => {
	beforeEach(() => {
		vi.resetModules()
		vi.clearAllMocks()
		vi.stubGlobal("self", {
			postMessage: vi.fn(),
			onmessage: null,
		})
		vi.stubGlobal("performance", {
			now: vi.fn(() => 1),
		})
		vi.spyOn(console, "time").mockImplementation(() => undefined)
		vi.spyOn(console, "timeEnd").mockImplementation(() => undefined)
		vi.spyOn(console, "table").mockImplementation(() => undefined)
		vi.stubGlobal("setTimeout", vi.fn())
	})

	it("reuses generated history state on the first simulate request", async () => {
		await import("./genesis.worker")

		const worker = globalThis.self as unknown as {
			postMessage: ReturnType<typeof vi.fn>
			onmessage: ((event: MessageEvent) => void) | null
		}

		worker.onmessage?.({
			data: { type: "generate", params: { seed: 42 } },
		} as MessageEvent)

		expect(mockHistoryApi.createHistoryRng).toHaveBeenCalledTimes(1)
		expect(mockHistoryApi.createHistoryRng).toHaveBeenCalledWith(42 + 99999)
		expect(mockHistoryApi.initHistory).toHaveBeenCalledTimes(1)
		const initParams = (
			mockHistoryApi.initHistory as unknown as {
				mock: { calls: Array<[ReturnType<typeof makeGeneratedWorld>]> }
			}
		).mock.calls[0]?.[0]
		expect(initParams).toBeDefined()
		const generateWorldModule = await import("./pipelines/generate-world")
		const generatedWorld = vi
			.mocked(generateWorldModule.generateGenesisWorld)
			.mock.results.at(0)?.value as
			| ReturnType<typeof makeGeneratedWorld>
			| undefined
		expect(generatedWorld).toBeDefined()
		expect(initParams!.provinces).not.toBe(generatedWorld!.provinces)
		expect(initParams!.provinces!.colors).not.toBe(
			generatedWorld!.provinces!.colors,
		)

		worker.onmessage?.({
			data: { type: "simulate", tickMs: 1000 },
		} as MessageEvent)

		expect(mockHistoryApi.initHistory).toHaveBeenCalledTimes(1)
		expect(mockHistoryApi.createHistoryRng).toHaveBeenCalledTimes(1)
		expect(mockHistoryApi.simulateUntil).toHaveBeenCalledWith(
			historyState,
			historyState.time + 1000,
			{ rng: "history" },
		)
		expect(worker.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "done",
				frame: historyFrame,
			}),
			expect.any(Array),
		)
		expect(worker.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "sim-progress",
				timeMs: historyState.time + 1000,
				frame: historyFrame,
			}),
			expect.any(Array),
		)
	})
})
