import { describe, expect, it } from "vitest"
import type { OrogenClimate, OrogenHydrology, OrogenRainfall } from ".."
import { computeLakes, selectConnectedLakeCells } from "./lakes"
import { computeRivers } from "./rivers"
import { buildLineMesh, buildMesh } from "./terrain-test-utils"

describe("selectConnectedLakeCells", () => {
	it("returns an empty selection for empty basins or zero targets", () => {
		const mesh = buildLineMesh(4)
		const elevation = new Float32Array([0, 0.1, 0.2, 0.3])

		expect(
			selectConnectedLakeCells(
				mesh.numRegions,
				mesh.adjOffset,
				mesh.adjList,
				elevation,
				[],
				3,
			),
		).toEqual({ lakeCells: [], lakeSurface: 0 })
		expect(
			selectConnectedLakeCells(
				mesh.numRegions,
				mesh.adjOffset,
				mesh.adjList,
				elevation,
				[0, 1],
				0,
			),
		).toEqual({ lakeCells: [], lakeSurface: 0 })
	})

	it("trims narrow lake corridors from basin selections", () => {
		const numRegions = 7
		const adjOffset = new Int32Array([0, 3, 6, 9, 13, 15, 17, 18])
		const adjList = new Int32Array([
			1, 2, 3, 0, 2, 3, 0, 1, 3, 0, 1, 2, 4, 3, 5, 4, 6, 5,
		])
		const elevation = new Float32Array([0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3])

		const result = selectConnectedLakeCells(
			numRegions,
			adjOffset,
			adjList,
			elevation,
			[0, 1, 2, 3, 4, 5, 6],
			7,
		)

		expect(result.lakeCells.sort((a, b) => a - b)).toEqual([0, 1, 2, 3])
		expect(result.lakeSurface).toBeCloseTo(0.15, 5)
	})

	it("falls back to a compact subset when pruning removes the full corridor", () => {
		const mesh = buildLineMesh(4)
		const elevation = new Float32Array([0, 0.1, 0.2, 0.3])

		const result = selectConnectedLakeCells(
			mesh.numRegions,
			mesh.adjOffset,
			mesh.adjList,
			elevation,
			[0, 1, 2, 3],
			4,
		)

		expect(result.lakeCells).toEqual([0, 1])
		expect(result.lakeSurface).toBeCloseTo(0.1000001, 5)
	})

	it("reseeds fallback compaction from the lowest corridor cell", () => {
		const mesh = buildLineMesh(4)
		const elevation = new Float32Array([0.2, 0.01, 0.1, 0.3])

		const result = selectConnectedLakeCells(
			mesh.numRegions,
			mesh.adjOffset,
			mesh.adjList,
			elevation,
			[0, 1, 2, 3],
			4,
		)

		expect(result.lakeCells).toEqual([1, 2])
		expect(result.lakeSurface).toBeCloseTo(0.1000001, 5)
	})

	it("keeps compact short lakes intact when no pruning is needed", () => {
		const mesh = buildLineMesh(3)
		const elevation = new Float32Array([0, 0.05, 0.1])

		const result = selectConnectedLakeCells(
			mesh.numRegions,
			mesh.adjOffset,
			mesh.adjList,
			elevation,
			[0, 1, 2],
			3,
		)

		expect(result.lakeCells).toEqual([0, 1, 2])
		expect(result.lakeSurface).toBeCloseTo(0.1000001, 5)
	})

	it("keeps larger compact lakes intact when no pruning path applies", () => {
		const mesh = buildMesh([
			[1, 2, 3],
			[0, 2, 3],
			[0, 1, 3],
			[0, 1, 2],
		])
		const elevation = new Float32Array([0, 0.05, 0.1, 0.15])

		const result = selectConnectedLakeCells(
			mesh.numRegions,
			mesh.adjOffset,
			mesh.adjList,
			elevation,
			[0, 1, 2, 3],
			4,
		)

		expect(result.lakeCells.slice().sort((a, b) => a - b)).toEqual([0, 1, 2, 3])
		expect(result.lakeSurface).toBeCloseTo(0.1500001, 5)
	})

	it("prefers wider connected basin cells before narrow corridor leaves", () => {
		const mesh = buildMesh([[1, 2], [0, 3, 4], [0], [1], [1]])
		const elevation = new Float32Array([0, 0.1, 0.01, 0.2, 0.3])

		const result = selectConnectedLakeCells(
			mesh.numRegions,
			mesh.adjOffset,
			mesh.adjList,
			elevation,
			[0, 1, 2, 3, 4],
			2,
		)

		expect(result.lakeCells).toEqual([0, 1])
		expect(result.lakeCells).not.toContain(2)
	})

	it("prunes elongated lake fingers even when short corridor pruning does not apply", () => {
		const mesh = buildMesh([
			[1, 6],
			[0, 2, 6],
			[1, 3, 6],
			[2, 4, 7],
			[3, 5, 7],
			[4, 7],
			[0, 1, 2, 7],
			[3, 4, 5, 6],
		])
		const elevation = new Float32Array([
			0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35,
		])

		const result = selectConnectedLakeCells(
			mesh.numRegions,
			mesh.adjOffset,
			mesh.adjList,
			elevation,
			[0, 1, 2, 3, 4, 5, 6, 7],
			8,
		)

		expect(result.lakeCells.slice().sort((a, b) => a - b)).toEqual([6, 7])
		expect(result.lakeSurface).toBeCloseTo(0.3500001, 5)
	})

	it("keeps corridor cells when they attach to more than two wider lake lobes", () => {
		const mesh = buildMesh([
			[1, 3],
			[0, 2, 4],
			[1, 5],
			[0, 4, 5],
			[1, 3, 5],
			[2, 3, 4],
		])
		const elevation = new Float32Array([0, 0.05, 0.1, 0.15, 0.2, 0.25])

		const result = selectConnectedLakeCells(
			mesh.numRegions,
			mesh.adjOffset,
			mesh.adjList,
			elevation,
			[0, 1, 2, 3, 4, 5],
			6,
		)

		expect(result.lakeCells.slice().sort((a, b) => a - b)).toEqual([
			0, 1, 2, 3, 4, 5,
		])
		expect(result.lakeSurface).toBeCloseTo(0.2500001, 5)
	})

	it("keeps wide ring basins when elongated pruning thresholds are not met", () => {
		const mesh = buildMesh([
			[1, 4, 5],
			[0, 2, 5],
			[1, 3, 5],
			[2, 4, 5],
			[3, 0],
			[0, 1, 2, 3],
		])
		const elevation = new Float32Array([0, 0.05, 0.1, 0.15, 0.2, 0.25])

		const result = selectConnectedLakeCells(
			mesh.numRegions,
			mesh.adjOffset,
			mesh.adjList,
			elevation,
			[0, 1, 2, 3, 4, 5],
			6,
		)

		expect(result.lakeCells.slice().sort((a, b) => a - b)).toEqual([
			0, 1, 2, 3, 4, 5,
		])
		expect(result.lakeSurface).toBeCloseTo(0.2500001, 5)
	})
})

describe("computeLakes", () => {
	it("clears arid enclosed basins instead of leaving spurious lakes", () => {
		const mesh = buildLineMesh(4)
		const elevation = new Float32Array([-0.2, 0.4, 0.1, 0.8])
		const isLand = new Uint8Array([0, 1, 1, 1])
		const rainfall: OrogenRainfall = {
			monthly: new Float32Array(12 * 4),
			annual: new Float32Array([0, 0, 200, 0]),
			east: new Float32Array(4),
			west: new Float32Array(4),
		}
		const climate = {
			temperature_monthly: new Float32Array(12 * 4),
			pet_monthly: new Float32Array(12 * 4),
		} as OrogenClimate
		const hydrology = {
			aet_monthly: new Float32Array(12 * 4),
			aridity_monthly: new Float32Array(12 * 4),
			baseflow_monthly: new Float32Array(12 * 4),
		} as OrogenHydrology

		const rivers = computeRivers(
			mesh,
			elevation,
			rainfall,
			climate,
			hydrology,
			isLand,
		)
		computeLakes(
			mesh,
			elevation,
			rainfall,
			rivers.waterLevel,
			rivers.basinId,
			isLand,
		)

		expect(isLand[2]).toBe(1)
		expect(Array.from(rivers.basinId)).toEqual([-1, -1, 0, -1])
		expect(rivers.waterLevel[2]).toBeCloseTo(elevation[2], 5)
		expect(rivers.lines).toHaveLength(0)
	})

	it("retains wet enclosed basins as lakes instead of clearing them", () => {
		const mesh = buildLineMesh(4)
		const elevation = new Float32Array([-0.2, 0.4, 0.1, 0.8])
		const isLand = new Uint8Array([0, 1, 1, 1])
		const monthly = new Float32Array(12 * 4)
		const annual = new Float32Array(4)
		const temperature_monthly = new Float32Array(12 * 4)
		const pet_monthly = new Float32Array(12 * 4)
		const aet_monthly = new Float32Array(12 * 4)
		const aridity_monthly = new Float32Array(12 * 4).fill(1)
		const baseflow_monthly = new Float32Array(12 * 4)

		for (let month = 0; month < 12; month++) {
			for (let region = 1; region < 4; region++) {
				const index = month * 4 + region
				temperature_monthly[index] = 18
				if (region === 2) {
					monthly[index] = 300
					annual[region] += 300
				} else if (region === 3) {
					monthly[index] = 240
					annual[region] += 240
				}
			}
		}

		const rainfall: OrogenRainfall = {
			monthly,
			annual,
			east: new Float32Array(4),
			west: new Float32Array(4),
		}
		const climate = {
			temperature_monthly,
			pet_monthly,
		} as OrogenClimate
		const hydrology = {
			aet_monthly,
			aridity_monthly,
			baseflow_monthly,
		} as OrogenHydrology

		const rivers = computeRivers(
			mesh,
			elevation,
			rainfall,
			climate,
			hydrology,
			isLand,
		)
		computeLakes(
			mesh,
			elevation,
			rainfall,
			rivers.waterLevel,
			rivers.basinId,
			isLand,
		)

		expect(isLand[2]).toBe(0)
		expect(rivers.waterLevel[2]).toBeGreaterThan(elevation[2])
		expect(rivers.lines).toHaveLength(0)
	})

	it("drains lakes whose final lake cells average under 100 mm of annual precipitation", () => {
		const mesh = buildLineMesh(4)
		const elevation = new Float32Array([-0.2, 0.6, 0.05, 0.8])
		const isLand = new Uint8Array([0, 1, 1, 1])
		const rainfall: OrogenRainfall = {
			monthly: new Float32Array(12 * 4),
			annual: new Float32Array([0, 0, 0, 300]),
			east: new Float32Array(4),
			west: new Float32Array(4),
		}
		const climate = {
			temperature_monthly: new Float32Array(12 * 4),
			pet_monthly: new Float32Array(12 * 4),
		} as OrogenClimate
		const hydrology = {
			aet_monthly: new Float32Array(12 * 4),
			aridity_monthly: new Float32Array(12 * 4),
			baseflow_monthly: new Float32Array(12 * 4),
		} as OrogenHydrology

		const rivers = computeRivers(
			mesh,
			elevation,
			rainfall,
			climate,
			hydrology,
			isLand,
		)
		computeLakes(
			mesh,
			elevation,
			rainfall,
			rivers.waterLevel,
			rivers.basinId,
			isLand,
		)

		expect(isLand[2]).toBe(1)
		expect(Array.from(rivers.basinId)).toEqual([-1, -1, 0, -1])
		expect(rivers.waterLevel[2]).toBeCloseTo(elevation[2], 5)
		expect(rivers.lines).toHaveLength(0)
	})

	it("clears basin water when annual rainfall totals imply non-positive inflow", () => {
		const mesh = buildLineMesh(5)
		const elevation = new Float32Array([-0.2, 0.6, 0.1, 0.2, 0.9])
		const isLand = new Uint8Array([0, 1, 1, 1, 1])
		const rainfall: OrogenRainfall = {
			monthly: new Float32Array(12 * 5),
			annual: new Float32Array([0, 0, 300, -400, 0]),
			east: new Float32Array(5),
			west: new Float32Array(5),
		}
		const climate = {
			temperature_monthly: new Float32Array(12 * 5),
			pet_monthly: new Float32Array(12 * 5),
		} as OrogenClimate
		const hydrology = {
			aet_monthly: new Float32Array(12 * 5),
			aridity_monthly: new Float32Array(12 * 5),
			baseflow_monthly: new Float32Array(12 * 5),
		} as OrogenHydrology

		const rivers = computeRivers(
			mesh,
			elevation,
			rainfall,
			climate,
			hydrology,
			isLand,
		)
		computeLakes(
			mesh,
			elevation,
			rainfall,
			rivers.waterLevel,
			rivers.basinId,
			isLand,
		)

		expect(isLand[2]).toBe(1)
		expect(isLand[3]).toBe(1)
		expect(Array.from(rivers.basinId)).toEqual([-1, -1, 0, 0, -1])
		expect(rivers.waterLevel[2]).toBeCloseTo(elevation[2], 5)
		expect(rivers.waterLevel[3]).toBeCloseTo(elevation[3], 5)
	})

	it("clears basins when contradictory annual rainfall totals still average below the desert floor", () => {
		const mesh = buildLineMesh(5)
		const elevation = new Float32Array([-0.2, 0.6, 0.1, 0.2, 0.9])
		const isLand = new Uint8Array([0, 1, 1, 1, 1])
		const rainfall: OrogenRainfall = {
			monthly: new Float32Array(12 * 5),
			annual: new Float32Array([0, 0, 300, -100, 0]),
			east: new Float32Array(5),
			west: new Float32Array(5),
		}
		const climate = {
			temperature_monthly: new Float32Array(12 * 5),
			pet_monthly: new Float32Array(12 * 5),
		} as OrogenClimate
		const hydrology = {
			aet_monthly: new Float32Array(12 * 5),
			aridity_monthly: new Float32Array(12 * 5),
			baseflow_monthly: new Float32Array(12 * 5),
		} as OrogenHydrology

		const rivers = computeRivers(
			mesh,
			elevation,
			rainfall,
			climate,
			hydrology,
			isLand,
		)
		computeLakes(
			mesh,
			elevation,
			rainfall,
			rivers.waterLevel,
			rivers.basinId,
			isLand,
		)

		expect(isLand[2]).toBe(1)
		expect(isLand[3]).toBe(1)
		expect(Array.from(rivers.basinId)).toEqual([-1, -1, 0, 0, -1])
		expect(rivers.waterLevel[2]).toBeCloseTo(elevation[2], 5)
		expect(rivers.waterLevel[3]).toBeCloseTo(elevation[3], 5)
	})
})
