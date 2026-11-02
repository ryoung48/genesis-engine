import { expect, it } from "vitest"
import { SIM_DERIVE } from "@/model/history/sim/derive"
import { MIGRATION } from "@/model/society/migration"
import { POPULATION } from "@/model/society/population"
import { DISTRIBUTION_FIXTURE as F } from "@/test/history-run/fixtures/distribution"

it("selects one reproducible origin and blocks desolate transit", () => {
	const w = F.world({ neighbors: [[1], [0, 2], [1]], desolate: [1], seed: 42 })
	if (w.historyMigration.pipeline !== "distribution") throw new Error("Fixture")
	const m = w.historyMigration.data
	expect(m.origin).toBeGreaterThanOrEqual(0)
	expect([...m.arrivalYear].filter((y) => y === -79999)).toHaveLength(1)
	expect(m.continuousArrival[1]).toBe(Infinity)
	expect(m.continuousArrival[m.origin === 0 ? 2 : 0]).toBe(Infinity)
})
it("allows successive 37.5 km water gaps without crossing an intermediate island", () => {
	const w = F.world({ neighbors: [[], [], []], desolate: [], seed: 42 })
	const provinces = w.provinces!
	provinces.seeds = Int32Array.of(0, 2, 4)
	provinces.regionProvince = Int32Array.of(0, -1, 1, -1, 2)
	provinces.landmassId = Int32Array.of(0, 1, 2)
	const count = 5,
		regionNeighbors = [[1], [0, 2], [1, 3], [2, 4], [3]]
	const mesh = {
		numRegions: count,
		r_xyz: Float32Array.from({ length: count * 3 }, (_, i) =>
			i % 3 === 0
				? Math.cos((Math.floor(i / 3) * 37.5) / 6371)
				: i % 3 === 1
					? Math.sin((Math.floor(i / 3) * 37.5) / 6371)
					: 0,
		),
		adjOffset: Int32Array.of(0, 1, 3, 5, 7, 8),
		adjList: Int32Array.from(regionNeighbors.flat()),
		regionArea: new Float32Array(count).fill(1),
	}
	const m = MIGRATION.compute({
		provinces,
		mesh,
		isLand: Uint8Array.of(1, 0, 1, 0, 1),
		elevationKm: new Float32Array(count).fill(-0.5),
		planetRadiusKm: 6371,
		habitability: Float32Array.of(3, 1, 1),
		seed: 42,
		horizonYear: 2025,
	})
	expect(m.origin).toBe(0)
	expect(m.diagnostics.seaEdges).toBe(2)
	expect([...m.predecessor]).toEqual([-1, 0, 1])
	expect([...m.edgeKind]).toEqual([0, 2, 2])
	expect(m.continuousArrival[1]).toBeCloseTo(-65000 + 103.75, 0)
	expect(m.continuousArrival[2]).toBeCloseTo(-65000 + 207.5, 0)
})
it("uses equal suitability for zero scores and scales physical distances with radius", () => {
	const w = F.world({ neighbors: [[1], [0]], desolate: [], seed: 42 })
	const mesh = {
		...w.mesh,
		numRegions: 2,
		adjOffset: Int32Array.of(0, 1, 2),
		adjList: Int32Array.of(1, 0),
		regionArea: new Float32Array(2).fill(1),
	}
	const params = {
		provinces: w.provinces!,
		mesh,
		isLand: new Uint8Array(2).fill(1),
		elevationKm: new Float32Array(2),
		planetRadiusKm: 6371,
		habitability: new Float32Array(2),
		seed: 42,
		horizonYear: 2025,
	}
	const a = MIGRATION.compute(params),
		b = MIGRATION.compute({ ...params, planetRadiusKm: 12742 })
	const destination = 1 - a.origin
	expect(b.origin).toBe(a.origin)
	expect(b.continuousArrival[destination] + 65000).toBeCloseTo(
		2 * (a.continuousArrival[destination] + 65000),
	)
	expect(a.continuousArrival[destination] + 65000).toBeCloseTo(182.0, 0)
})
it("finds no origin for empty and all-desolate worlds", () => {
	for (const neighbors of [[], [[]]] as number[][][]) {
		const w = F.world({
			neighbors,
			desolate: neighbors.length ? [0] : [],
			seed: 42,
		})
		if (w.historyMigration.pipeline !== "distribution")
			throw new Error("Fixture")
		expect(w.historyMigration.data.origin).toBe(-1)
	}
})

it("excludes after-horizon and unreachable provinces from population weights and culture/religion context", () => {
	const w = F.world({
			neighbors: [[1], [0, 2], [1, 3], [2]],
			desolate: [],
			seed: 42,
		}),
		provinces = w.provinces!
	const migrationWave = Float32Array.of(0, 0.5, -1, -1)
	const eraSettledMask = Uint8Array.of(1, 1, 0, 0)
	const landmarks = {
		count: 1,
		regionLandmark: new Int32Array(4),
		type: Uint8Array.of(0),
		size: Int32Array.of(4),
	}
	const climateZones = new Uint8Array(4).fill(5),
		vegetation = new Uint8Array(4).fill(3),
		topography = new Uint8Array(4)
	const population = POPULATION.computePopulation({
		provinces,
		landmarks,
		climateZones,
		vegetation,
		topography,
		oceanCoastal: new Uint8Array(4),
		lakeCoastal: new Uint8Array(4),
		riverVisible: new Uint8Array(4),
		seed: 42,
		mesh: w.mesh,
		planetRadiusKm: 6371,
		migrationWave,
		settlementWave: 1,
		migrationFalloff: 0,
	})
	population.migrationWave = migrationWave
	expect(population.population[2]).toBe(0)
	expect(population.population[3]).toBe(0)
	const society = SIM_DERIVE.deriveSociety({
		historyPipeline: "distribution",
		isEarthImport: false,
		provinces,
		population,
		landmarks,
		coastal: new Uint8Array(4),
		waterAccess: new Uint8Array(4),
		riverVisible: new Uint8Array(4),
		r_xyz: w.mesh.r_xyz,
		seed: 42,
		planetRadiusKm: 6371,
		era: "lateMedieval",
		eraSettledMask,
		eraStatehoodMask: new Uint8Array(4),
		timings: [],
	})
	expect(society.cultures?.assignment[2]).toBe(-1)
	expect(society.cultures?.assignment[3]).toBe(-1)
	let negativeContributions = 0
	for (let p = 0; p < 4; p++)
		if ((society.cultures?.assignment[p] ?? -1) >= 0 && migrationWave[p] < 0)
			negativeContributions++
	expect(negativeContributions).toBe(0)
})
