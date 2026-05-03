import { describe, expect, it } from "vitest"
import {
	DEFAULT_NEIGHBOR_SORT,
	formatNeighborThreat,
	type NationNeighbor,
	nextNeighborSortState,
	sortNationNeighbors,
} from "./nation-neighbors-table"

const neighbors: NationNeighbor[] = [
	{
		id: 3,
		name: "Cinder Reach",
		color: "#333333",
		relation: "Hostile",
		threat: 0.9,
	},
	{
		id: 1,
		name: "Amber Coast",
		color: "#111111",
		relation: "Neutral",
		threat: null,
	},
	{
		id: 2,
		name: "Beryl March",
		color: "#222222",
		relation: "Ally",
		threat: 0.2,
	},
]

describe("nation-neighbors-table", () => {
	it("formats neighbor threat percentages", () => {
		expect(formatNeighborThreat(0.42)).toBe("42%")
		expect(formatNeighborThreat(null)).toBe("N/A")
	})

	it("sorts neighbors by threat descending by default and keeps null threat last", () => {
		expect(
			sortNationNeighbors(neighbors, DEFAULT_NEIGHBOR_SORT).map(
				(item) => item.id,
			),
		).toEqual([3, 2, 1])
	})

	it("sorts string fields alphabetically and toggles sort direction", () => {
		const byName = sortNationNeighbors(neighbors, {
			key: "name",
			direction: "asc",
		})
		expect(byName.map((item) => item.id)).toEqual([1, 2, 3])

		expect(nextNeighborSortState(DEFAULT_NEIGHBOR_SORT, "name")).toEqual({
			key: "name",
			direction: "asc",
		})
		expect(
			nextNeighborSortState({ key: "name", direction: "asc" }, "name"),
		).toEqual({
			key: "name",
			direction: "desc",
		})
	})
})
