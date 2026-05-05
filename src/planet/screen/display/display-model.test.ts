import { describe, expect, it } from "vitest"
import type { SerializedOrogenWorld } from "@/model/transport/worker-types"
import type { HistoryView } from "../history/history-query"
import {
	buildDisplayNationModel,
	buildDisplayWorld,
	buildHistoryChildrenIndex,
	buildSovereignRulerFields,
} from "./display-model"

describe("display-model", () => {
	it("returns null child index when no history view is selected", () => {
		expect(buildHistoryChildrenIndex(null)).toBeNull()
	})

	it("builds a child index from parent links", () => {
		const historyView = {
			parent: new Int32Array([-1, 0, 0, 1]),
		} as HistoryView

		const result = buildHistoryChildrenIndex(historyView)

		expect(result).not.toBeNull()
		expect(Array.from(result!.childOffset)).toEqual([0, 2, 3, 3, 3])
		expect(Array.from(result!.childList)).toEqual([1, 2, 3])
	})

	it("reuses a precomputed child index from the history view", () => {
		const childOffset = new Int32Array([0, 2, 3, 3, 3])
		const childList = new Int32Array([1, 2, 3])
		const historyView = {
			parent: new Int32Array([-1, 0, 0, 1]),
			childOffset,
			childList,
		} as HistoryView

		const result = buildHistoryChildrenIndex(historyView)

		expect(result).not.toBeNull()
		expect(result!.childOffset).toBe(childOffset)
		expect(result!.childList).toBe(childList)
	})

	it("summarizes display nation assignment and colors directly from world data", () => {
		const world = {
			provinces: {
				count: 3,
			},
			nations: {
				assignment: new Int32Array([4, 4, 7]),
				colors: new Float32Array([1, 0, 0, 0.5, 0, 0, 0, 1, 0]),
				adjOffset: new Int32Array([0, 0, 0, 0]),
				adjList: new Int32Array(),
			},
		} as unknown as SerializedOrogenWorld

		const result = buildDisplayNationModel(world)

		expect(result).not.toBeNull()
		expect(result!.assignment).toBe(world.nations.assignment)
		expect(result!.counts.get(4)).toBe(2)
		expect(result!.counts.get(7)).toBe(1)
		expect(result!.colorById.get(4)).toEqual([1, 0, 0])
		expect(result!.colorById.get(7)).toEqual([0, 1, 0])
		expect(result!.toActualId(4)).toBe(4)
		expect(result!.toActualId(9)).toBeNull()
		expect(result!.toDisplayId(7)).toBe(7)
	})

	it("returns null when display nation data is incomplete", () => {
		expect(buildDisplayNationModel(null)).toBeNull()
		expect(
			buildDisplayNationModel({
				provinces: { count: 1 },
				nations: {
					assignment: new Int32Array([0]),
				},
			} as unknown as SerializedOrogenWorld),
		).toBeNull()
	})

	it("builds a default display world from sovereign ownership when no history is selected", () => {
		const world = {
			provinces: {
				count: 3,
				adjOffset: new Int32Array([0, 1, 3, 4]),
				adjList: new Int32Array([1, 0, 2, 1]),
			},
			leaderDynasty: new Int32Array([4, 5, 6]),
			leaderNameSeed: new Int32Array([40, 50, 60]),
			leaderClaim: new Int32Array([3, 2, 1]),
			leaderBirthYear: new Float32Array([10, 11, 12]),
			nations: {
				assignment: new Int32Array([9, 8, 7]),
				seeds: new Int32Array([0, 2]),
				sovereign: new Int32Array([0, 0, 2]),
				colors: new Float32Array([1, 0, 0, 0, 1, 0]),
				parent: new Int32Array([-1, 0, -1]),
				childOffset: new Int32Array([0, 1, 1, 1]),
				childList: new Int32Array([1]),
				size: new Int32Array([1, 1, 1]),
				adjOffset: new Int32Array([0, 0, 0, 0]),
				adjList: new Int32Array(0),
			},
		} as unknown as SerializedOrogenWorld

		const result = buildDisplayWorld({
			world,
			selectedHistoryView: null,
			selectedHistoryChildren: null,
		})

		expect(result?.nations?.assignment).toEqual(new Int32Array([0, 0, 2]))
		expect(result?.nations?.size).toEqual(new Int32Array([2, 0, 1]))
		expect(Array.from(result!.nations!.colors)).toEqual([
			1, 0, 0, 1, 0, 0, 0, 1, 0,
		])
		expect(Array.from(result!.leaderDynasty ?? [])).toEqual([4, -1, 6])
		expect(Array.from(result!.leaderNameSeed ?? [])).toEqual([40, -1, 60])
		expect(Array.from(result!.leaderClaim ?? [])).toEqual([3, 0, 1])
		expect(Array.from(result!.leaderBirthYear ?? [])).toEqual([10, -1, 12])
		expect(Array.from(result!.nations!.adjOffset)).toEqual([0, 1, 1, 2])
		expect(Array.from(result!.nations!.adjList)).toEqual([2, 0])
	})

	it("builds sovereign-only ruler fields from the current world", () => {
		const result = buildSovereignRulerFields({
			world: {
				provinces: { count: 3 },
				leaderDynasty: new Int32Array([7, 8, 9]),
				leaderNameSeed: new Int32Array([70, 80, 90]),
				leaderClaim: new Int32Array([3, 2, 1]),
				leaderBirthYear: new Float32Array([20, 21, 22]),
				nations: {
					assignment: new Int32Array([0, 0, 2]),
					sovereign: new Int32Array([0, 0, 2]),
					parent: new Int32Array([-1, 0, -1]),
				},
			} as unknown as SerializedOrogenWorld,
		})

		expect(Array.from(result.leaderDynasty)).toEqual([7, -1, 9])
		expect(Array.from(result.leaderNameSeed)).toEqual([70, -1, 90])
		expect(Array.from(result.leaderClaim)).toEqual([3, 0, 1])
		expect(Array.from(result.leaderBirthYear)).toEqual([20, -1, 22])
	})

	it("returns default ruler fields when no world is available", () => {
		const result = buildSovereignRulerFields({
			world: null,
			fallbackLength: 2,
		})

		expect(Array.from(result.leaderDynasty)).toEqual([-1, -1])
		expect(Array.from(result.leaderNameSeed)).toEqual([-1, -1])
		expect(Array.from(result.leaderClaim)).toEqual([0, 0])
		expect(Array.from(result.leaderBirthYear)).toEqual([-1, -1])
	})

	it("projects a selected history view over the base world", () => {
		const world = {
			provinces: { count: 2 },
			leaderNameSeed: new Int32Array([10, 20]),
			leaderClaim: new Int32Array([3, 2]),
			leaderBirthYear: new Float32Array([0, 1]),
			nations: {
				assignment: new Int32Array([0, 1]),
				seeds: new Int32Array([0, 1]),
				sovereign: new Int32Array([0, 1]),
				colors: new Float32Array([1, 0, 0, 0, 1, 0]),
				parent: new Int32Array([-1, -1]),
				childOffset: new Int32Array([0, 0, 0]),
				childList: new Int32Array(0),
				size: new Int32Array([1, 1]),
				adjOffset: new Int32Array([0, 0, 0]),
				adjList: new Int32Array(0),
			},
			population: {
				habitability: new Float32Array([1, 1]),
				population: new Float32Array([10, 20]),
				habitabilityScore: 0,
				totalPopulation: 30,
			},
		} as unknown as SerializedOrogenWorld
		const historyView = {
			assignment: new Int32Array([1, 1]),
			parent: new Int32Array([-1, 0]),
			sovereign: new Int32Array([1, 1]),
			leaderDynasty: new Int32Array([4, 4]),
			leaderNameSeed: new Int32Array([30, 40]),
			leaderClaim: new Int32Array([1, 2]),
			leaderBirthYear: new Float32Array([5, 6]),
			colors: new Float32Array([0.2, 0.3, 0.4, 0.5, 0.6, 0.7]),
			adjOffset: new Int32Array([0, 1, 1]),
			adjList: new Int32Array([1]),
			populationTotal: new Float32Array([99, 88]),
			populationUrban: new Float32Array([11, 22]),
			development: new Float32Array([3, 4]),
		} as unknown as HistoryView

		const result = buildDisplayWorld({
			world,
			selectedHistoryView: historyView,
			selectedHistoryChildren: {
				childOffset: new Int32Array([0, 1, 1]),
				childList: new Int32Array([1]),
			},
		})

		expect(result?.nations?.assignment).toBe(historyView.assignment)
		expect(result?.nations?.childList).toEqual(new Int32Array([1]))
		expect(result?.leaderNameSeed).toBe(historyView.leaderNameSeed)
		expect(result?.leaderClaim).toBe(historyView.leaderClaim)
		expect(result?.leaderBirthYear).toBe(historyView.leaderBirthYear)
		expect(result?.population?.population).toBe(historyView.populationTotal)
		expect(result?.urbanPopulation).toBe(historyView.populationUrban)
		expect(result?.development).toBe(historyView.development)
	})

	it("returns the base world when nation display data is unavailable", () => {
		const world = {
			mesh: { numRegions: 1 },
		} as unknown as SerializedOrogenWorld

		expect(
			buildDisplayWorld({
				world,
				selectedHistoryView: null,
				selectedHistoryChildren: null,
			}),
		).toBe(world)
	})

	it("returns null when there is no world to project", () => {
		expect(
			buildDisplayWorld({
				world: null,
				selectedHistoryView: null,
				selectedHistoryChildren: null,
			}),
		).toBeNull()
	})

	it("returns the base world when provinces are unavailable", () => {
		const world = {
			nations: {
				assignment: new Int32Array([0]),
			},
		} as unknown as SerializedOrogenWorld

		expect(
			buildDisplayWorld({
				world,
				selectedHistoryView: null,
				selectedHistoryChildren: null,
			}),
		).toBe(world)
	})

	it("falls back to base child links and keeps population undefined when absent", () => {
		const world = {
			provinces: { count: 2 },
			nations: {
				assignment: new Int32Array([0, 1]),
				seeds: new Int32Array([0, 1]),
				sovereign: new Int32Array([0, 1]),
				colors: new Float32Array([1, 0, 0, 0, 1, 0]),
				parent: new Int32Array([-1, -1]),
				childOffset: new Int32Array([0, 1, 1]),
				childList: new Int32Array([1]),
				size: new Int32Array([1, 1]),
				adjOffset: new Int32Array([0, 0, 0]),
				adjList: new Int32Array(0),
			},
		} as unknown as SerializedOrogenWorld
		const historyView = {
			assignment: new Int32Array([1, 1]),
			parent: new Int32Array([-1, 0]),
			sovereign: new Int32Array([1, 1]),
			colors: new Float32Array([0.2, 0.3, 0.4, 0.5, 0.6, 0.7]),
			adjOffset: new Int32Array([0, 1, 1]),
			adjList: new Int32Array([1]),
			populationTotal: new Float32Array([99, 88]),
			populationUrban: new Float32Array([11, 22]),
			development: new Float32Array([3, 4]),
		} as unknown as HistoryView

		const result = buildDisplayWorld({
			world,
			selectedHistoryView: historyView,
			selectedHistoryChildren: null,
		})

		expect(result?.nations?.childOffset).toBe(world.nations.childOffset)
		expect(result?.nations?.childList).toBe(world.nations.childList)
		expect(result?.population).toBeUndefined()
	})

	it("skips invalid sovereign seeds and duplicate or unassigned adjacencies", () => {
		const world = {
			provinces: {
				count: 4,
				adjOffset: new Int32Array([0, 2, 4, 6, 8]),
				adjList: new Int32Array([1, 2, 0, 2, 0, 3, 2, 1]),
			},
			nations: {
				assignment: new Int32Array([9, 9, -1, 7]),
				seeds: new Int32Array([-1, 3]),
				sovereign: new Int32Array([0, 0, -1, 3]),
				colors: new Float32Array([1, 0, 0, 0.2, 0.4, 0.6]),
				parent: new Int32Array([-1, -1, -1, -1]),
				childOffset: new Int32Array([0, 0, 0, 0, 0]),
				childList: new Int32Array(0),
				size: new Int32Array([0, 0, 0, 0]),
				adjOffset: new Int32Array([0, 0, 0, 0, 0]),
				adjList: new Int32Array(0),
			},
		} as unknown as SerializedOrogenWorld

		const result = buildDisplayWorld({
			world,
			selectedHistoryView: null,
			selectedHistoryChildren: null,
		})
		const colors = Array.from(result!.nations!.colors).map((value) =>
			Number(value.toFixed(3)),
		)

		expect(result?.nations?.assignment).toEqual(new Int32Array([0, 0, -1, 3]))
		expect(colors).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0.2, 0.4, 0.6])
		expect(Array.from(result!.nations!.adjOffset)).toEqual([0, 0, 0, 0, 1])
		expect(Array.from(result!.nations!.adjList)).toEqual([0])
	})

	it("counts display nations without fabricating colors for incomplete triples", () => {
		const world = {
			provinces: {
				count: 3,
			},
			nations: {
				assignment: new Int32Array([4, -1, 7]),
				colors: new Float32Array([1, 0, 0, 0.5, 0, 0]),
				adjOffset: new Int32Array([0, 0, 0, 0]),
				adjList: new Int32Array(),
			},
		} as unknown as SerializedOrogenWorld

		const result = buildDisplayNationModel(world)

		expect(result?.counts.get(4)).toBe(1)
		expect(result?.counts.get(7)).toBe(1)
		expect(result?.colorById.get(4)).toEqual([1, 0, 0])
		expect(result?.colorById.has(7)).toBe(false)
		expect(result?.toDisplayId(9)).toBeNull()
	})
})
