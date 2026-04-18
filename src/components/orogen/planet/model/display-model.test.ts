import { describe, expect, it } from "vitest"
import type { SerializedOrogenWorld } from "@/model/orogen/worker-types"
import {
	buildDisplayNationModel,
	buildHistoryChildrenIndex,
} from "./display-model"
import type { HistoryView } from "./history-query"

describe("display-model", () => {
	it("builds a child index from parent links", () => {
		const historyView = {
			parent: new Int32Array([-1, 0, 0, 1]),
		} as HistoryView

		const result = buildHistoryChildrenIndex(historyView)

		expect(result).not.toBeNull()
		expect(Array.from(result!.childOffset)).toEqual([0, 2, 3, 3, 3])
		expect(Array.from(result!.childList)).toEqual([1, 2, 3])
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
})
