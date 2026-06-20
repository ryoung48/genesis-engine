import { describe, expect, it } from "vitest"
import type { GenesisNationHierarchy, GenesisProvinces } from "../.."
import type { SocietyEra } from "../../society/eras"
import type { ProvincePopulation } from "../../society/population"
import {
	ROUTE_LAND_MAJOR,
	ROUTE_LAND_MINOR,
	ROUTE_SEA,
} from "../../transport/worker-types"
import { PROV } from "../fields"
import { createHistoryRng } from "../history-rng"
import { createHistoryState } from "../state"
import { computeRoutes } from "./trade-routes"

function buildAdjacency(neighbors: number[][]) {
	const adjOffset = new Int32Array(neighbors.length + 1)
	let total = 0
	for (let i = 0; i < neighbors.length; i++) {
		total += neighbors[i].length
		adjOffset[i + 1] = total
	}
	const adjList = new Int32Array(total)
	let cursor = 0
	for (const list of neighbors) {
		for (const neighbor of list) adjList[cursor++] = neighbor
	}
	return { adjOffset, adjList }
}

function createInfrastructureState(options: {
	provinceNeighbors: number[][]
	regionNeighbors: number[][]
	regionProvince: number[]
	provinceSeeds: number[]
	r_xyz: number[]
	regionIsLand: number[]
	regionLandmark?: number[]
	landmarkTypes?: number[]
	landmarkSizes?: number[]
	population?: number[]
	desolate?: number[]
	era?: SocietyEra
}) {
	const provinceCount = options.provinceNeighbors.length
	const { adjOffset: provinceAdjOffset, adjList: provinceAdjList } =
		buildAdjacency(options.provinceNeighbors)
	const { adjOffset: regionAdjOffset, adjList: regionAdjList } = buildAdjacency(
		options.regionNeighbors,
	)
	const colors = new Float32Array(provinceCount * 3).fill(0.5)
	const provinces = {
		regionProvince: Int32Array.from(options.regionProvince),
		seeds: Int32Array.from(options.provinceSeeds),
		count: provinceCount,
		desolate: Uint8Array.from(
			options.desolate ?? new Array(provinceCount).fill(0),
		),
		landmassId: new Int32Array(provinceCount),
		adjOffset: provinceAdjOffset,
		adjList: provinceAdjList,
		size: new Int32Array(provinceCount).fill(1),
		colors,
	} as GenesisProvinces
	const nations = {
		assignment: Int32Array.from({ length: provinceCount }, (_, index) => index),
		seeds: Int32Array.from({ length: provinceCount }, (_, index) => index),
		count: provinceCount,
		adjOffset: new Int32Array(provinceCount + 1),
		adjList: new Int32Array(0),
		size: new Int32Array(provinceCount).fill(1),
		colors: colors.slice(),
		parent: new Int32Array(provinceCount).fill(-1),
		depth: new Int32Array(provinceCount),
		childOffset: new Int32Array(provinceCount + 1),
		childList: new Int32Array(0),
		sovereign: Int32Array.from({ length: provinceCount }, (_, index) => index),
		gravity: new Float32Array(provinceCount).fill(1),
	} as GenesisNationHierarchy
	const populationValues =
		options.population ?? new Array(provinceCount).fill(300_000)
	const population: ProvincePopulation = {
		habitability: new Float32Array(provinceCount).fill(1),
		population: Float32Array.from(populationValues),
		habitabilityScore: provinceCount,
		totalPopulation: populationValues.reduce((sum, value) => sum + value, 0),
	}

	return createHistoryState(
		nations,
		provinces,
		population,
		new Uint8Array(options.regionProvince.length),
		new Uint8Array(options.regionProvince.length),
		Float32Array.from(options.r_xyz),
		{ assignment: new Int32Array(provinceCount), count: 1 },
		800,
		createHistoryRng(42),
		undefined,
		{
			regionLandmark: Int32Array.from(
				options.regionLandmark ??
					new Array(options.regionProvince.length).fill(0),
			),
			type: Uint8Array.from(options.landmarkTypes ?? [0]),
			size: Int32Array.from(
				options.landmarkSizes ?? [options.regionProvince.length],
			),
			count: (options.landmarkTypes ?? [0]).length,
		},
		Int32Array.from(options.regionProvince),
		regionAdjOffset,
		regionAdjList,
		Uint8Array.from(options.regionIsLand),
		options.era ?? "lateMedieval",
	)
}

describe("computeRoutes", () => {
	it("builds only major land routes from settlement clusters", () => {
		const state = createInfrastructureState({
			provinceNeighbors: [[1], [0, 2], [1]],
			regionNeighbors: [[1], [0, 2], [1]],
			regionProvince: [0, 1, 2],
			provinceSeeds: [0, 1, 2],
			r_xyz: [0, 0, 1, 0.4, 0.2, 1, 0.8, 0, 1],
			regionIsLand: [1, 1, 1],
		})
		PROV.population.urban.set(state, 0, state.time, 50_000)
		PROV.population.urban.set(state, 1, state.time, 500)
		PROV.population.urban.set(state, 2, state.time, 60_000)

		const result = computeRoutes(state, {
			settlementRegions: new Int32Array([0, 1, 2]),
		})

		expect(result.routes).toHaveLength(1)
		expect(result.network).toHaveLength(2)
		expect(
			result.routes.find((route) => route.kind === ROUTE_LAND_MAJOR)
				?.pathRegions,
		).toEqual([0, 1, 2])
	})

	it("splits land clusters at desolate provinces", () => {
		const state = createInfrastructureState({
			provinceNeighbors: [[1], [0, 2], [1]],
			regionNeighbors: [[1], [0, 2], [1]],
			regionProvince: [0, 1, 2],
			provinceSeeds: [0, 1, 2],
			r_xyz: [0, 0, 1, 0.4, 0, 1, 0.8, 0, 1],
			regionIsLand: [1, 1, 1],
			desolate: [0, 1, 0],
		})
		PROV.population.urban.set(state, 0, state.time, 60_000)
		PROV.population.urban.set(state, 2, state.time, 60_000)

		const result = computeRoutes(state, {
			settlementRegions: new Int32Array([0, -1, 2]),
		})

		expect(result.routes).toHaveLength(0)
	})

	it("prefers existing major corridors for later major routes", () => {
		const state = createInfrastructureState({
			provinceNeighbors: [
				[1, 7],
				[0, 2],
				[1, 3],
				[2, 6],
				[5],
				[4, 6],
				[3, 5, 8],
				[0, 8],
				[6, 7],
			],
			regionNeighbors: [
				[1, 7],
				[0, 2],
				[1, 3],
				[2, 6],
				[5],
				[4, 6],
				[3, 5, 8],
				[0, 8],
				[6, 7],
			],
			regionProvince: [0, 1, 2, 3, 4, 5, 6, 7, 8],
			provinceSeeds: [0, 1, 2, 3, 4, 5, 6, 7, 8],
			r_xyz: [
				0, 0, 1, 0.4, 0, 1, 0.8, 0, 1, 1.2, 0, 1, 1.2, 0.5, 1, 0.8, 0.5, 1, 0,
				0.8, 1, 0, 0.3, 1, 0.3, 0.55, 1,
			],
			regionIsLand: [1, 1, 1, 1, 1, 1, 1, 1, 1],
			population: [1, 1, 1, 1, 1, 1, 1, 1, 1],
		})
		PROV.population.urban.set(state, 0, state.time, 80_000)
		PROV.population.urban.set(state, 3, state.time, 70_000)
		PROV.population.urban.set(state, 6, state.time, 60_000)

		const result = computeRoutes(state, {
			settlementRegions: new Int32Array([0, -1, -1, 3, -1, -1, 6, -1, -1]),
		})

		expect(result.routes).toHaveLength(2)
		expect(result.routes[0]?.pathRegions).toEqual([0, 1, 2, 3])
		expect(result.routes[1]?.pathRegions).toEqual([0, 1, 2, 3, 6])
	})

	it("builds minor roads for towns over one thousand and reuses major edges", () => {
		const state = createInfrastructureState({
			provinceNeighbors: [[1], [0, 2], [1]],
			regionNeighbors: [[1], [0, 2], [1]],
			regionProvince: [0, 1, 2],
			provinceSeeds: [0, 1, 2],
			r_xyz: [0, 0, 1, 0.4, 0.2, 1, 0.8, 0, 1],
			regionIsLand: [1, 1, 1],
		})
		PROV.population.urban.set(state, 0, state.time, 50_000)
		PROV.population.urban.set(state, 1, state.time, 2_000)
		PROV.population.urban.set(state, 2, state.time, 60_000)

		const result = computeRoutes(state, {
			settlementRegions: new Int32Array([0, 1, 2]),
		})

		expect(result.routes).toHaveLength(3)
		expect(result.routes[0]).toMatchObject({
			kind: ROUTE_LAND_MAJOR,
			pathRegions: [0, 1, 2],
		})
		expect(result.routes[1]).toMatchObject({
			kind: ROUTE_LAND_MINOR,
			fromProvince: 0,
			toProvince: 1,
			pathRegions: [0, 1],
		})
		expect(result.routes[2]).toMatchObject({
			kind: ROUTE_LAND_MINOR,
			fromProvince: 1,
			toProvince: 2,
			pathRegions: [1, 2],
		})
		expect(
			result.network.filter((edge) => edge.kind === ROUTE_LAND_MAJOR),
		).toHaveLength(2)
	})

	it("keeps towns below the city threshold on minor routes only", () => {
		const state = createInfrastructureState({
			provinceNeighbors: [[1], [0, 2], [1]],
			regionNeighbors: [[1], [0, 2], [1]],
			regionProvince: [0, 1, 2],
			provinceSeeds: [0, 1, 2],
			r_xyz: [0, 0, 1, 0.4, 0.2, 1, 0.8, 0, 1],
			regionIsLand: [1, 1, 1],
		})
		PROV.population.urban.set(state, 0, state.time, 50_000)
		PROV.population.urban.set(state, 1, state.time, 7_999)
		PROV.population.urban.set(state, 2, state.time, 60_000)

		const result = computeRoutes(state, {
			settlementRegions: new Int32Array([0, 1, 2]),
		})

		expect(
			result.routes.filter((route) => route.kind === ROUTE_LAND_MAJOR),
		).toEqual([
			expect.objectContaining({
				fromProvince: 0,
				toProvince: 2,
				pathRegions: [0, 1, 2],
			}),
		])
		expect(
			result.routes.filter((route) => route.kind === ROUTE_LAND_MINOR),
		).toEqual([
			expect.objectContaining({
				fromProvince: 0,
				toProvince: 1,
				pathRegions: [0, 1],
			}),
			expect.objectContaining({
				fromProvince: 1,
				toProvince: 2,
				pathRegions: [1, 2],
			}),
		])
	})

	it("uses information-era town thresholds for minor land routes", () => {
		const state = createInfrastructureState({
			provinceNeighbors: [[1], [0, 2], [1]],
			regionNeighbors: [[1], [0, 2], [1]],
			regionProvince: [0, 1, 2],
			provinceSeeds: [0, 1, 2],
			r_xyz: [0, 0, 1, 0.4, 0.2, 1, 0.8, 0, 1],
			regionIsLand: [1, 1, 1],
			era: "information",
		})
		PROV.population.urban.set(state, 0, state.time, 80_000)
		PROV.population.urban.set(state, 1, state.time, 9_999)
		PROV.population.urban.set(state, 2, state.time, 90_000)

		const result = computeRoutes(state, {
			settlementRegions: new Int32Array([0, 1, 2]),
		})

		expect(
			result.routes.filter((route) => route.kind === ROUTE_LAND_MINOR),
		).toHaveLength(0)
	})

	it("dedupes shared land edges into a single major network corridor", () => {
		const state = createInfrastructureState({
			provinceNeighbors: [[1], [0, 2], [1]],
			regionNeighbors: [[1], [0, 2], [1]],
			regionProvince: [0, 1, 2],
			provinceSeeds: [0, 1, 2],
			r_xyz: [0, 0, 1, 0.4, 0.2, 1, 0.8, 0, 1],
			regionIsLand: [1, 1, 1],
		})
		PROV.population.urban.set(state, 0, state.time, 50_000)
		PROV.population.urban.set(state, 1, state.time, 2_000)
		PROV.population.urban.set(state, 2, state.time, 60_000)

		const result = computeRoutes(state, {
			settlementRegions: new Int32Array([0, 1, 2]),
		})

		expect(
			result.network
				.map((edge) => ({
					fromRegion: edge.fromRegion,
					toRegion: edge.toRegion,
					kind: edge.kind,
				}))
				.sort(
					(a, b) =>
						a.fromRegion - b.fromRegion ||
						a.toRegion - b.toRegion ||
						a.kind - b.kind,
				),
		).toEqual([
			{ fromRegion: 0, toRegion: 1, kind: ROUTE_LAND_MAJOR },
			{ fromRegion: 1, toRegion: 2, kind: ROUTE_LAND_MAJOR },
		])
	})

	it("keeps land routes on the same landmark when an alternate landmark shortcut exists", () => {
		const state = createInfrastructureState({
			provinceNeighbors: [[1], [0, 2], [1]],
			regionNeighbors: [
				[1, 3],
				[0, 2],
				[1, 4],
				[0, 4],
				[2, 3],
			],
			regionProvince: [0, 1, 2, 1, 1],
			provinceSeeds: [0, 1, 2],
			r_xyz: [0, 0, 1, 0.3, 0, 1, 0.6, 0, 1, 0.2, 0.2, 1, 0.5, 0.2, 1],
			regionIsLand: [1, 1, 1, 1, 1],
			regionLandmark: [9, 9, 9, 8, 8],
			landmarkTypes: [0, 3, 4, 4, 4, 4, 4, 3, 0, 0],
			landmarkSizes: [3, 1, 1, 1, 1, 1, 1, 3, 2, 3],
		})
		PROV.population.urban.set(state, 0, state.time, 60_000)
		PROV.population.urban.set(state, 1, state.time, 500)
		PROV.population.urban.set(state, 2, state.time, 55_000)

		const result = computeRoutes(state, {
			settlementRegions: new Int32Array([0, 1, 2]),
		})

		expect(result.routes).toHaveLength(1)
		expect(result.routes[0]?.pathRegions).toEqual([0, 1, 2])
	})

	it("skips major roads longer than three thousand kilometers", () => {
		const state = createInfrastructureState({
			provinceNeighbors: [[1], [0, 2], [1]],
			regionNeighbors: [[1], [0, 2], [1]],
			regionProvince: [0, 1, 2],
			provinceSeeds: [0, 1, 2],
			r_xyz: [1, 0, 0, 0, 1, 0, -1, 0, 0],
			regionIsLand: [1, 1, 1],
		})
		PROV.population.urban.set(state, 0, state.time, 50_000)
		PROV.population.urban.set(state, 2, state.time, 60_000)

		const result = computeRoutes(state, {
			planetRadiusKm: 1_000,
			settlementRegions: new Int32Array([0, -1, 2]),
		})

		expect(result.routes).toHaveLength(0)
		expect(result.network).toHaveLength(0)
	})

	it("builds sea routes for ports over ten thousand and prefers offshore water", () => {
		const state = createInfrastructureState({
			provinceNeighbors: [[], [], []],
			regionNeighbors: [
				[2],
				[4],
				[0, 3, 5],
				[2, 4, 8],
				[1, 3, 6],
				[2, 7],
				[4, 7],
				[5, 6],
				[3],
			],
			regionProvince: [0, 1, -1, -1, -1, -1, -1, -1, 2],
			provinceSeeds: [0, 1, 8],
			r_xyz: [
				0, 0, 1, 1, 0, 1, 0.2, 0.1, 1, 0.5, 0.2, 1, 0.8, 0.1, 1, 0.2, 0.5, 1,
				0.8, 0.5, 1, 0.5, 0.75, 1, 0.5, -0.1, 1,
			],
			regionIsLand: [1, 1, 0, 0, 0, 0, 0, 0, 1],
			regionLandmark: [0, 0, 7, 7, 7, 7, 7, 7, 0],
			landmarkTypes: [0, 3, 4, 4, 4, 4, 4, 3],
			landmarkSizes: [2, 1, 1, 1, 1, 1, 1, 6],
		})
		PROV.population.urban.set(state, 0, state.time, 12_000)
		PROV.population.urban.set(state, 1, state.time, 13_000)

		const result = computeRoutes(state, {
			settlementRegions: new Int32Array([0, 1]),
			settlementWaterLandmarks: new Int32Array([7, 7]),
			settlementPortRegions: new Int32Array([2, 4]),
		})

		expect(result.routes).toHaveLength(1)
		expect(result.routes[0]?.kind).toBe(ROUTE_SEA)
		expect(result.routes[0]?.pathRegions).toEqual([0, 2, 5, 7, 6, 4, 1])
		expect(
			result.routes[0]?.pathRegions
				.slice(1, -1)
				.every((region) => !state.regionIsLand[region]),
		).toBe(true)
	})

	it("does not build sea routes for ports below the minimum population", () => {
		const state = createInfrastructureState({
			provinceNeighbors: [[], []],
			regionNeighbors: [[2], [4], [0, 3], [2, 4], [1, 3]],
			regionProvince: [0, 1, -1, -1, -1],
			provinceSeeds: [0, 1],
			r_xyz: [0, 0, 1, 1, 0, 1, 0.2, 0.1, 1, 0.5, 0.2, 1, 0.8, 0.1, 1],
			regionIsLand: [1, 1, 0, 0, 0],
			regionLandmark: [0, 0, 7, 7, 7],
			landmarkTypes: [0, 3, 4, 4, 4, 4, 4, 3],
			landmarkSizes: [2, 1, 1, 1, 1, 1, 1, 3],
		})
		PROV.population.urban.set(state, 0, state.time, 999)
		PROV.population.urban.set(state, 1, state.time, 12_000)

		const result = computeRoutes(state, {
			settlementRegions: new Int32Array([0, 1]),
			settlementWaterLandmarks: new Int32Array([7, 7]),
			settlementPortRegions: new Int32Array([2, 4]),
		})

		expect(result.routes).toHaveLength(0)
		expect(result.network).toHaveLength(0)
	})

	it("builds sea routes even when the same pair already has a land route", () => {
		const state = createInfrastructureState({
			provinceNeighbors: [[1], [0]],
			regionNeighbors: [
				[1, 2],
				[0, 4],
				[0, 3],
				[2, 4],
				[1, 3],
			],
			regionProvince: [0, 1, -1, -1, -1],
			provinceSeeds: [0, 1],
			r_xyz: [0, 0, 1, 1, 0, 1, 0.2, 0.1, 1, 0.5, 0.2, 1, 0.8, 0.1, 1],
			regionIsLand: [1, 1, 0, 0, 0],
			regionLandmark: [9, 9, 7, 7, 7],
			landmarkTypes: [0, 3, 4, 4, 4, 4, 4, 3, 0, 0],
			landmarkSizes: [2, 1, 1, 1, 1, 1, 1, 3, 1, 2],
		})
		PROV.population.urban.set(state, 0, state.time, 12_000)
		PROV.population.urban.set(state, 1, state.time, 13_000)

		const result = computeRoutes(state, {
			settlementRegions: new Int32Array([0, 1]),
			settlementWaterLandmarks: new Int32Array([7, 7]),
			settlementPortRegions: new Int32Array([2, 4]),
		})

		expect(result.routes).toHaveLength(2)
		expect(result.routes.find((r) => r.kind === ROUTE_LAND_MAJOR)).toBeDefined()
		expect(result.routes.find((r) => r.kind === ROUTE_SEA)).toBeDefined()
	})

	it("allows sea routes on the same land landmark when no land route exists", () => {
		const state = createInfrastructureState({
			provinceNeighbors: [[], []],
			regionNeighbors: [[2], [4], [0, 3], [2, 4], [1, 3]],
			regionProvince: [0, 1, -1, -1, -1],
			provinceSeeds: [0, 1],
			r_xyz: [0, 0, 1, 1, 0, 1, 0.2, 0.1, 1, 0.5, 0.2, 1, 0.8, 0.1, 1],
			regionIsLand: [1, 1, 0, 0, 0],
			regionLandmark: [9, 9, 7, 7, 7],
			landmarkTypes: [0, 3, 4, 4, 4, 4, 4, 3, 0, 0],
			landmarkSizes: [2, 1, 1, 1, 1, 1, 1, 3, 1, 2],
		})
		PROV.population.urban.set(state, 0, state.time, 12_000)
		PROV.population.urban.set(state, 1, state.time, 13_000)

		const result = computeRoutes(state, {
			settlementRegions: new Int32Array([0, 1]),
			settlementWaterLandmarks: new Int32Array([7, 7]),
			settlementPortRegions: new Int32Array([2, 4]),
		})

		expect(result.routes).toHaveLength(1)
		expect(result.routes[0]?.kind).toBe(ROUTE_SEA)
		expect(result.routes[0]?.pathRegions).toEqual([0, 2, 3, 4, 1])
	})

	it("connects all neighboring ports discovered by the sea flood fill", () => {
		const state = createInfrastructureState({
			provinceNeighbors: [[], [], []],
			regionNeighbors: [[2], [3], [0, 3, 4], [1, 2, 4], [2, 3, 5], [4]],
			regionProvince: [0, 1, -1, -1, -1, 2],
			provinceSeeds: [0, 1, 5],
			r_xyz: [
				0, 0, 1, 0.9, 0, 1, 0.2, 0.2, 1, 0.5, 0.6, 1, 0.8, 0.2, 1, 1.1, 0, 1,
			],
			regionIsLand: [1, 1, 0, 0, 0, 1],
			regionLandmark: [9, 9, 7, 7, 7, 9],
			landmarkTypes: [0, 3, 4, 4, 4, 4, 4, 3, 0, 0],
			landmarkSizes: [3, 1, 1, 1, 1, 1, 1, 3, 1, 3],
		})
		PROV.population.urban.set(state, 0, state.time, 12_000)
		PROV.population.urban.set(state, 1, state.time, 13_000)
		PROV.population.urban.set(state, 2, state.time, 14_000)

		const result = computeRoutes(state, {
			settlementRegions: new Int32Array([0, 1, 5]),
			settlementWaterLandmarks: new Int32Array([7, 7, 7]),
			settlementPortRegions: new Int32Array([2, 3, 4]),
		})

		expect(result.routes).toHaveLength(3)
		expect(result.routes.every((route) => route.kind === ROUTE_SEA)).toBe(true)
		expect(
			result.routes.map((route) => [
				route.fromProvince,
				route.toProvince,
				route.pathRegions,
			]),
		).toEqual([
			[0, 1, [0, 2, 3, 1]],
			[0, 2, [0, 2, 4, 5]],
			[1, 2, [1, 3, 4, 5]],
		])
	})

	it("keeps sea pair discovery deterministic when frontiers meet out of order", () => {
		const state = createInfrastructureState({
			provinceNeighbors: [[], [], []],
			regionNeighbors: [
				[3],
				[4],
				[5],
				[0, 6],
				[1, 6, 7],
				[2, 7],
				[3, 4, 7],
				[4, 5, 6],
			],
			regionProvince: [0, 1, 2, -1, -1, -1, -1, -1],
			provinceSeeds: [0, 1, 2],
			r_xyz: [
				0, 0, 1, 0.6, 0, 1, 1.2, 0, 1, 0.1, 0.2, 1, 0.6, 0.3, 1, 1.1, 0.2, 1,
				0.4, 0.6, 1, 0.8, 0.6, 1,
			],
			regionIsLand: [1, 1, 1, 0, 0, 0, 0, 0],
			regionLandmark: [9, 9, 9, 7, 7, 7, 7, 7],
			landmarkTypes: [0, 3, 4, 4, 4, 4, 4, 3, 0, 0],
			landmarkSizes: [3, 1, 1, 1, 1, 1, 1, 5, 1, 3],
		})
		PROV.population.urban.set(state, 0, state.time, 15_000)
		PROV.population.urban.set(state, 1, state.time, 14_000)
		PROV.population.urban.set(state, 2, state.time, 13_000)

		const result = computeRoutes(state, {
			settlementRegions: new Int32Array([0, 1, 2]),
			settlementWaterLandmarks: new Int32Array([7, 7, 7]),
			settlementPortRegions: new Int32Array([3, 4, 5]),
		})

		expect(
			result.routes.map((route) => [
				route.fromProvince,
				route.toProvince,
				route.pathRegions,
			]),
		).toEqual([
			[0, 1, [0, 3, 6, 4, 1]],
			[0, 2, [0, 3, 6, 7, 5, 2]],
			[1, 2, [1, 4, 7, 5, 2]],
		])
	})

	it("prefers existing sea corridors for later sea routes", () => {
		const state = createInfrastructureState({
			provinceNeighbors: [[], [], []],
			regionNeighbors: [
				[],
				[2],
				[1, 4, 5],
				[],
				[2, 7],
				[2, 8],
				[],
				[4, 8],
				[5, 7],
			],
			regionProvince: [0, -1, -1, 1, -1, -1, 2, -1, -1],
			provinceSeeds: [0, 3, 6],
			r_xyz: [
				0, 0, 1, 0.1, 0.2, 1, 0.3, 0.2, 1, 0.6, 0.2, 1, 0.3, 0.45, 1, 0.55, 0.2,
				1, 0.95, 0.2, 1, 0.45, 0.5, 1, 0.7, 0.5, 1,
			],
			regionIsLand: [1, 0, 0, 1, 0, 0, 1, 0, 0],
			regionLandmark: [9, 7, 7, 9, 7, 7, 9, 7, 7],
			landmarkTypes: [0, 3, 4, 4, 4, 4, 4, 3, 0, 0],
			landmarkSizes: [3, 1, 1, 1, 1, 1, 1, 6, 1, 3],
		})
		PROV.population.urban.set(state, 0, state.time, 12_000)
		PROV.population.urban.set(state, 1, state.time, 13_000)
		PROV.population.urban.set(state, 2, state.time, 14_000)

		const result = computeRoutes(state, {
			settlementRegions: new Int32Array([0, 3, 6]),
			settlementWaterLandmarks: new Int32Array([7, 7, 7]),
			settlementPortRegions: new Int32Array([2, 5, 8]),
		})

		expect(result.routes).toHaveLength(3)
		expect(result.routes[0]?.pathRegions).toEqual([0, 2, 5, 3])
		expect(result.routes[1]?.pathRegions).toEqual([0, 2, 5, 8, 6])
		expect(result.routes[2]?.pathRegions).toEqual([3, 5, 8, 6])
	})

	it("reconstructs multiple sea routes from one shared source search", () => {
		const state = createInfrastructureState({
			provinceNeighbors: [[], [], []],
			regionNeighbors: [[2], [4], [0, 3], [2, 4, 5], [1, 3], [3, 6], [5]],
			regionProvince: [0, 1, -1, -1, -1, -1, 2],
			provinceSeeds: [0, 1, 6],
			r_xyz: [
				0, 0, 1, 0.8, 0, 1, 0.15, 0.1, 1, 0.35, 0.1, 1, 0.55, 0.1, 1, 0.55,
				0.35, 1, 0.8, 0.35, 1,
			],
			regionIsLand: [1, 1, 0, 0, 0, 0, 1],
			regionLandmark: [9, 9, 7, 7, 7, 7, 9],
			landmarkTypes: [0, 3, 4, 4, 4, 4, 4, 3, 0, 0],
			landmarkSizes: [3, 1, 1, 1, 1, 1, 1, 4, 1, 3],
		})
		PROV.population.urban.set(state, 0, state.time, 15_000)
		PROV.population.urban.set(state, 1, state.time, 14_000)
		PROV.population.urban.set(state, 2, state.time, 13_000)

		const result = computeRoutes(state, {
			settlementRegions: new Int32Array([0, 1, 6]),
			settlementWaterLandmarks: new Int32Array([7, 7, 7]),
			settlementPortRegions: new Int32Array([2, 4, 5]),
		})

		expect(
			result.routes.map((route) => [
				route.fromProvince,
				route.toProvince,
				route.pathRegions,
			]),
		).toEqual([
			[0, 1, [0, 2, 3, 4, 1]],
			[0, 2, [0, 2, 3, 5, 6]],
		])
	})

	it("ignores water bodies smaller than one tenth of a percent", () => {
		const regionCount = 2_001
		const regionNeighbors = Array.from(
			{ length: regionCount },
			() => [] as number[],
		)
		regionNeighbors[0] = [2]
		regionNeighbors[1] = [3]
		regionNeighbors[2] = [0, 3]
		regionNeighbors[3] = [1, 2]

		const regionProvince = new Array(regionCount).fill(-1)
		regionProvince[0] = 0
		regionProvince[1] = 1

		const regionIsLand = new Array(regionCount).fill(1)
		regionIsLand[2] = 0
		regionIsLand[3] = 0

		const regionLandmark = new Array(regionCount).fill(0)
		regionLandmark[2] = 7
		regionLandmark[3] = 7

		const r_xyz = Array.from({ length: regionCount * 3 }, (_, index) =>
			index % 3 === 2 ? 1 : (index % 9) / 10,
		)

		const state = createInfrastructureState({
			provinceNeighbors: [[], []],
			regionNeighbors,
			regionProvince,
			provinceSeeds: [0, 1],
			r_xyz,
			regionIsLand,
			regionLandmark,
			landmarkTypes: [0, 0, 0, 0, 0, 0, 0, 3],
			landmarkSizes: [regionCount - 2, 0, 0, 0, 0, 0, 0, 2],
		})
		PROV.population.urban.set(state, 0, state.time, 12_000)
		PROV.population.urban.set(state, 1, state.time, 13_000)

		const result = computeRoutes(state, {
			settlementRegions: new Int32Array([0, 1]),
			settlementWaterLandmarks: new Int32Array([7, 7]),
			settlementPortRegions: new Int32Array([2, 3]),
		})

		expect(result.routes).toHaveLength(0)
		expect(result.network).toHaveLength(0)
	})

	it("skips sea routes longer than ten thousand kilometers", () => {
		const state = createInfrastructureState({
			provinceNeighbors: [[], [], []],
			regionNeighbors: [
				[2],
				[4],
				[0, 3, 5],
				[2, 4, 8],
				[1, 3, 6],
				[2, 7],
				[4, 7],
				[5, 6],
				[3],
			],
			regionProvince: [0, 1, -1, -1, -1, -1, -1, -1, 2],
			provinceSeeds: [0, 1, 8],
			r_xyz: [
				1, 0, 0, 0.62161, -0.783327, 0, 0.62161, 0.783327, 0, 0.955336, 0.29552,
				0, -0.227202, -0.973848, 0, -0.227202, 0.973848, 0, -0.904072, -0.42738,
				0, -0.904072, 0.42738, 0, 0.955336, -0.29552, 0,
			],
			regionIsLand: [1, 1, 0, 0, 0, 0, 0, 0, 1],
			regionLandmark: [0, 0, 7, 7, 7, 7, 7, 7, 0],
			landmarkTypes: [0, 3, 4, 4, 4, 4, 4, 3],
			landmarkSizes: [2, 1, 1, 1, 1, 1, 1, 6],
		})
		PROV.population.urban.set(state, 0, state.time, 12_000)
		PROV.population.urban.set(state, 1, state.time, 13_000)

		const result = computeRoutes(state, {
			planetRadiusKm: 2_000,
			settlementRegions: new Int32Array([0, 1]),
			settlementWaterLandmarks: new Int32Array([7, 7]),
			settlementPortRegions: new Int32Array([2, 4]),
		})

		expect(result.routes).toHaveLength(0)
		expect(result.network).toHaveLength(0)
	})

	it("records core route timing stages", () => {
		const state = createInfrastructureState({
			provinceNeighbors: [[], []],
			regionNeighbors: [[2], [3], [0, 3], [1, 2]],
			regionProvince: [0, 1, -1, -1],
			provinceSeeds: [0, 1],
			r_xyz: [0, 0, 1, 1, 0, 1, 0.2, 0.1, 1, 0.8, 0.1, 1],
			regionIsLand: [1, 1, 0, 0],
			regionLandmark: [9, 9, 7, 7],
			landmarkTypes: [0, 3, 4, 4, 4, 4, 4, 3, 0, 0],
			landmarkSizes: [2, 1, 1, 1, 1, 1, 1, 2, 1, 2],
		})
		PROV.population.urban.set(state, 0, state.time, 12_000)
		PROV.population.urban.set(state, 1, state.time, 13_000)
		const timings: Array<{ Stage: string; ms: string }> = []

		computeRoutes(state, {
			settlementRegions: new Int32Array([0, 1]),
			settlementWaterLandmarks: new Int32Array([7, 7]),
			settlementPortRegions: new Int32Array([2, 3]),
			timings,
		})

		expect(
			timings.some(
				(entry) => entry.Stage === "computeRoutes:computeLandPassableMask",
			),
		).toBe(true)
		expect(
			timings.some(
				(entry) => entry.Stage === "computeRoutes:computeProvinceLandClusters",
			),
		).toBe(true)
	})
})
