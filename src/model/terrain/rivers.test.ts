import { describe, expect, it } from "vitest"
import type {
	OrogenClimate,
	OrogenHydrology,
	OrogenRainfall,
	SphereMesh,
} from ".."
import { computeRivers, selectConnectedLakeCells } from "./rivers"

function buildLineMesh(numRegions: number): SphereMesh {
	const adjOffset = new Int32Array(numRegions + 1)
	const adjEntries: number[] = []
	const coords: number[] = []
	for (let r = 0; r < numRegions; r++) {
		adjOffset[r] = adjEntries.length
		if (r > 0) adjEntries.push(r - 1)
		if (r < numRegions - 1) adjEntries.push(r + 1)
		const angle = (Math.PI * r) / Math.max(1, numRegions - 1)
		coords.push(Math.cos(angle), 0, Math.sin(angle))
	}
	adjOffset[numRegions] = adjEntries.length
	return {
		numRegions,
		adjOffset,
		adjList: Int32Array.from(adjEntries),
		r_xyz: new Float32Array(coords),
	} as unknown as SphereMesh
}

function buildMesh(adjacency: number[][]): SphereMesh {
	const numRegions = adjacency.length
	const adjOffset = new Int32Array(numRegions + 1)
	const adjEntries: number[] = []
	const coords: number[] = []
	for (let r = 0; r < numRegions; r++) {
		adjOffset[r] = adjEntries.length
		adjEntries.push(...adjacency[r])
		const angle = (2 * Math.PI * r) / Math.max(1, numRegions)
		coords.push(Math.cos(angle), 0, Math.sin(angle))
	}
	adjOffset[numRegions] = adjEntries.length
	return {
		numRegions,
		adjOffset,
		adjList: Int32Array.from(adjEntries),
		r_xyz: new Float32Array(coords),
	} as unknown as SphereMesh
}

function buildDrainageMesh(
	landCount: number,
	extraOceanCount: number,
): SphereMesh {
	const totalRegions = landCount + extraOceanCount + 1
	const adjacency = Array.from({ length: totalRegions }, (): number[] => [])
	for (let r = 0; r < landCount; r++) {
		adjacency[r]?.push(r + 1)
		adjacency[r + 1]?.push(r)
	}
	return buildMesh(adjacency)
}

function buildStarDrainageMesh(
	landCount: number,
	extraOceanCount: number,
): SphereMesh {
	const totalRegions = landCount + extraOceanCount + 1
	const adjacency = Array.from({ length: totalRegions }, (): number[] => [])
	if (landCount >= 1) {
		adjacency[0]?.push(1)
		adjacency[1]?.push(0)
	}
	for (let r = 2; r <= landCount; r++) {
		adjacency[1]?.push(r)
		adjacency[r]?.push(1)
	}
	return buildMesh(adjacency)
}

function buildUniformRiverInputs(
	numRegions: number,
	isLand: Uint8Array,
	{
		monthlyRain = 100,
		temperature = 20,
		pet = 0,
		aridity = 1,
		baseflow = 0,
	}: {
		monthlyRain?: number
		temperature?: number
		pet?: number
		aridity?: number
		baseflow?: number
	} = {},
): {
	rainfall: OrogenRainfall
	climate: OrogenClimate
	hydrology: OrogenHydrology
} {
	const monthly = new Float32Array(12 * numRegions)
	const annual = new Float32Array(numRegions)
	const temperature_monthly = new Float32Array(12 * numRegions).fill(
		temperature,
	)
	const pet_monthly = new Float32Array(12 * numRegions).fill(pet)
	const aet_monthly = new Float32Array(12 * numRegions)
	const aridity_monthly = new Float32Array(12 * numRegions).fill(aridity)
	const baseflow_monthly = new Float32Array(12 * numRegions).fill(baseflow)

	for (let month = 0; month < 12; month++) {
		for (let r = 0; r < numRegions; r++) {
			if (!isLand[r]) continue
			const idx = month * numRegions + r
			monthly[idx] = monthlyRain
			annual[r] += monthlyRain
		}
	}

	return {
		rainfall: {
			monthly,
			annual,
			east: new Float32Array(numRegions),
			west: new Float32Array(numRegions),
		},
		climate: {
			temperature_monthly,
			pet_monthly,
		} as OrogenClimate,
		hydrology: {
			aet_monthly,
			aridity_monthly,
			baseflow_monthly,
		} as OrogenHydrology,
	}
}

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

describe("computeRivers", () => {
	it("returns an empty river network when the world is entirely ocean", () => {
		const mesh = buildLineMesh(3)
		const rainfall: OrogenRainfall = {
			monthly: new Float32Array(36),
			annual: new Float32Array(3),
			east: new Float32Array(3),
			west: new Float32Array(3),
		}
		const climate = {
			temperature_monthly: new Float32Array(36),
			pet_monthly: new Float32Array(36),
		} as OrogenClimate
		const hydrology = {
			aet_monthly: new Float32Array(36),
			aridity_monthly: new Float32Array(36),
			baseflow_monthly: new Float32Array(36),
		} as OrogenHydrology

		const rivers = computeRivers(
			mesh,
			new Float32Array([-0.4, -0.2, -0.1]),
			rainfall,
			climate,
			hydrology,
			new Uint8Array([0, 0, 0]),
		)

		expect(rivers.lines).toEqual([])
		expect(rivers.maxFlow).toBe(0)
		expect(rivers.minFlow).toBe(1)
		expect(Array.from(rivers.visible)).toEqual([0, 0, 0])
		expect(Array.from(rivers.basinId)).toEqual([-1, -1, -1])
	})

	it("preserves routed flow into ocean sink cells", () => {
		const mesh = buildLineMesh(4)
		const elevation = new Float32Array([-0.2, 0.3, 0.5, 0.7])
		const isLand = new Uint8Array([0, 1, 1, 1])
		const monthly = new Float32Array(12 * 4)
		const annual = new Float32Array(4)
		const temperature_monthly = new Float32Array(12 * 4)
		const pet_monthly = new Float32Array(12 * 4)
		const aet_monthly = new Float32Array(12 * 4)
		const aridity_monthly = new Float32Array(12 * 4)
		const baseflow_monthly = new Float32Array(12 * 4)

		for (let month = 0; month < 12; month++) {
			for (let r = 0; r < 4; r++) {
				const idx = month * 4 + r
				temperature_monthly[idx] = 12
				aridity_monthly[idx] = 1
				if (isLand[r]) {
					monthly[idx] = 100
					annual[r] += 100
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

		expect(rivers.flow[0]).toBe(0)
		expect(rivers.flow[1]).toBeGreaterThan(rivers.flow[2])
		expect(rivers.flow[2]).toBeGreaterThan(rivers.flow[3])
		expect(rivers.lines).toHaveLength(1)
		expect(rivers.lines[0]?.map((point) => point[3])).toEqual([
			elevation[1],
			elevation[0],
		])
		expect(rivers.terminal[1]).toBe(1)
		expect(rivers.terminalCoastal[1]).toBe(1)
	})

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

		expect(Array.from(rivers.lakes)).toEqual([0, 0, 0, 0])
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

		expect(rivers.lakes[2]).toBe(1)
		expect(rivers.waterLevel[2]).toBeGreaterThan(elevation[2])
		expect(rivers.lines).toHaveLength(0)
	})

	it("reduces downstream carryover in freezing and ultra-hot routing months", () => {
		const mesh = buildLineMesh(4)
		const elevation = new Float32Array([-0.2, 0.3, 0.5, 0.7])
		const isLand = new Uint8Array([0, 1, 1, 1])
		const monthly = new Float32Array(48)
		const annual = new Float32Array(4)
		const pet_monthly = new Float32Array(48)
		const aet_monthly = new Float32Array(48)
		const aridity_monthly = new Float32Array(48).fill(1)
		const baseflow_monthly = new Float32Array(48)

		for (let month = 0; month < 12; month++) {
			for (let region = 1; region < 4; region++) {
				const index = month * 4 + region
				monthly[index] = 100
				annual[region] += 100
			}
		}

		const rainfall: OrogenRainfall = {
			monthly,
			annual,
			east: new Float32Array(4),
			west: new Float32Array(4),
		}
		const hydrology = {
			aet_monthly,
			aridity_monthly,
			baseflow_monthly,
		} as OrogenHydrology

		const buildClimate = (temperature: number) =>
			({
				temperature_monthly: new Float32Array(48).fill(temperature),
				pet_monthly,
			}) as OrogenClimate

		const temperate = computeRivers(
			mesh,
			elevation,
			rainfall,
			buildClimate(20),
			hydrology,
			isLand,
		)
		const frozen = computeRivers(
			mesh,
			elevation,
			rainfall,
			buildClimate(-10),
			hydrology,
			isLand,
		)
		const scorching = computeRivers(
			mesh,
			elevation,
			rainfall,
			buildClimate(100),
			hydrology,
			isLand,
		)

		expect(frozen.flow[1]).toBeLessThan(temperate.flow[1])
		expect(scorching.flow[1]).toBeLessThan(temperate.flow[1])
		expect(frozen.flow[3]).toBeCloseTo(temperate.flow[3], 6)
		expect(scorching.flow[3]).toBeCloseTo(temperate.flow[3], 6)
	})

	it("uses a looser river threshold on sparse worlds than on land-heavy ones", () => {
		const buildScenario = (extraOceanCount: number) => {
			const mesh = buildDrainageMesh(30, extraOceanCount)
			const elevation = new Float32Array(mesh.numRegions).fill(-1)
			const isLand = new Uint8Array(mesh.numRegions)
			elevation[0] = -0.2
			for (let r = 1; r <= 30; r++) {
				elevation[r] = r / 10
				isLand[r] = 1
			}
			const { rainfall, climate, hydrology } = buildUniformRiverInputs(
				mesh.numRegions,
				isLand,
			)
			return computeRivers(
				mesh,
				elevation,
				rainfall,
				climate,
				hydrology,
				isLand,
			)
		}

		const sparse = buildScenario(69)
		const dense = buildScenario(2)
		const visibleCount = (visible: Uint8Array) =>
			Array.from(visible).reduce((sum, value) => sum + value, 0)

		expect(visibleCount(sparse.visible)).toBe(2)
		expect(visibleCount(dense.visible)).toBe(1)
		expect(sparse.lines).toHaveLength(1)
		expect(dense.lines).toHaveLength(1)
		expect(sparse.lines[0]).toHaveLength(3)
		expect(dense.lines[0]).toHaveLength(2)
	})

	it("leaves isolated land cells without spurious rivers or lakes", () => {
		const mesh = buildMesh([[], []])
		const elevation = new Float32Array([-0.5, 0.6])
		const isLand = new Uint8Array([0, 1])
		const { rainfall, climate, hydrology } = buildUniformRiverInputs(
			mesh.numRegions,
			isLand,
		)

		const rivers = computeRivers(
			mesh,
			elevation,
			rainfall,
			climate,
			hydrology,
			isLand,
		)

		expect(rivers.lines).toEqual([])
		expect(rivers.flow[1]).toBeGreaterThan(0)
		expect(rivers.minFlow).toBe(1)
		expect(Array.from(rivers.visible)).toEqual([0, 0])
		expect(Array.from(rivers.lakes)).toEqual([0, 0])
		expect(Array.from(rivers.basinId)).toEqual([-1, -1])
		expect(Array.from(rivers.waterLevel)).toEqual([0, 0])
	})

	it("drops isolated visible sources that have no downstream drain target", () => {
		const mesh = buildMesh([[]])
		const elevation = new Float32Array([0.6])
		const isLand = new Uint8Array([1])
		const { rainfall, climate, hydrology } = buildUniformRiverInputs(
			mesh.numRegions,
			isLand,
			{ monthlyRain: 400 },
		)

		const rivers = computeRivers(
			mesh,
			elevation,
			rainfall,
			climate,
			hydrology,
			isLand,
		)

		expect(rivers.flow[0]).toBeGreaterThan(0)
		expect(rivers.lines).toEqual([])
		expect(Array.from(rivers.visible)).toEqual([0])
		expect(Array.from(rivers.terminal)).toEqual([0])
	})

	it("merges tributary traces into a shared river system at visible junctions", () => {
		const landCount = 41
		const mesh = buildStarDrainageMesh(landCount, 96)
		const elevation = new Float32Array(mesh.numRegions).fill(-1)
		const isLand = new Uint8Array(mesh.numRegions)
		elevation[0] = -0.2
		elevation[1] = 0.2
		isLand[1] = 1
		for (let r = 2; r <= landCount; r++) {
			elevation[r] = 0.1
			isLand[r] = 1
		}
		elevation[2] = 0.9
		elevation[3] = 1.1

		const { rainfall, climate, hydrology } = buildUniformRiverInputs(
			mesh.numRegions,
			isLand,
			{ monthlyRain: 0 },
		)
		for (let month = 0; month < 12; month++) {
			const offset = month * mesh.numRegions
			rainfall.monthly[offset + 2] = 200
			rainfall.monthly[offset + 3] = 200
			rainfall.annual[2] += 200
			rainfall.annual[3] += 200
			climate.temperature_monthly[offset + 1] = 20
			climate.temperature_monthly[offset + 2] = 20
			climate.temperature_monthly[offset + 3] = 20
			hydrology.aridity_monthly[offset + 1] = 1
			hydrology.aridity_monthly[offset + 2] = 1
			hydrology.aridity_monthly[offset + 3] = 1
		}

		const rivers = computeRivers(
			mesh,
			elevation,
			rainfall,
			climate,
			hydrology,
			isLand,
		)

		expect(rivers.lines).toHaveLength(2)
		expect(rivers.visible[1]).toBe(1)
		expect(rivers.visible[2]).toBe(1)
		expect(rivers.visible[3]).toBe(1)
		expect(rivers.riverId[1]).toBeGreaterThanOrEqual(0)
		expect(rivers.riverId[2]).toBe(rivers.riverId[1])
		expect(rivers.riverId[3]).toBe(rivers.riverId[1])
		expect(rivers.terminal[1]).toBe(1)
		expect(rivers.terminalCoastal[1]).toBe(1)
		expect(rivers.terminal[2]).toBe(0)
		expect(rivers.terminal[3]).toBe(0)
		expect(rivers.riverLengthKm[2]).toBeCloseTo(rivers.riverLengthKm[3], 5)
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

		expect(Array.from(rivers.lakes)).toEqual([0, 0, 0, 0, 0])
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

		expect(Array.from(rivers.lakes)).toEqual([0, 0, 0, 0, 0])
		expect(Array.from(rivers.basinId)).toEqual([-1, -1, 0, 0, -1])
		expect(rivers.waterLevel[2]).toBeCloseTo(elevation[2], 5)
		expect(rivers.waterLevel[3]).toBeCloseTo(elevation[3], 5)
	})

	it("keeps river outputs finite across sparse, dense, frozen, and custom-parameter sweeps", () => {
		for (const extraOceanCount of [2, 20, 60]) {
			for (const temperature of [-10, 20, 100]) {
				for (const aridity of [0.2, 0.6, 1]) {
					const mesh = buildDrainageMesh(12, extraOceanCount)
					const elevation = new Float32Array(mesh.numRegions).fill(-1)
					const isLand = new Uint8Array(mesh.numRegions)
					elevation[0] = -0.2
					for (let r = 1; r <= 12; r++) {
						elevation[r] = r / 10
						isLand[r] = 1
					}
					const { rainfall, climate, hydrology } = buildUniformRiverInputs(
						mesh.numRegions,
						isLand,
						{
							monthlyRain: 80,
							temperature,
							pet: 90,
							aridity,
							baseflow: 15,
						},
					)
					const rivers = computeRivers(
						mesh,
						elevation,
						rainfall,
						climate,
						hydrology,
						isLand,
						{
							planetRadiusKm: 4000,
							daysPerYear: 200,
							hoursPerDay: 30,
						},
					)

					expect(rivers.lines.length).toBeGreaterThanOrEqual(0)
					expect(Array.from(rivers.flow).every(Number.isFinite)).toBe(true)
					expect(Array.from(rivers.flow_monthly).every(Number.isFinite)).toBe(
						true,
					)
					expect(Array.from(rivers.riverLengthKm).every(Number.isFinite)).toBe(
						true,
					)
					expect(rivers.maxFlow).toBeGreaterThanOrEqual(0)
					expect(
						Array.from(rivers.visible).reduce((sum, value) => sum + value, 0),
					).toBeLessThanOrEqual(12)
				}
			}
		}
	})
})
