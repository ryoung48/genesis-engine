import { SIM_DERIVE } from "@/model/history/sim/derive"
import { POPULATION } from "@/model/society/population"
import { expect, it } from "vitest"
import { DISTRIBUTION_MIGRATION as M } from "@/model/history/distribution/migration"
import { DISTRIBUTION_FIXTURE as F } from "@/test/history-run/fixtures/distribution"

it("uses normalized endpoint means, integrates the transport boundary, and waits for sea capability", () => {
	expect(
		M.transit({
			sourceArrival: 0,
			distanceKm: 100,
			meanSuitability: 0.5,
			corridorBonus: 1.25,
			kind: "land",
		}),
	).toBe(160)
	expect(
		M.transit({
			sourceArrival: 1490,
			distanceKm: 100,
			meanSuitability: 1,
			corridorBonus: 1,
			kind: "land",
		}),
	).toBeCloseTo(1501.8)
	expect(
		M.transit({
			sourceArrival: -5000,
			distanceKm: 500,
			meanSuitability: 1,
			corridorBonus: 1,
			kind: "sea",
		}),
	).toBe(-2849)
	expect(
		M.transit({
			sourceArrival: 2000,
			distanceKm: 0,
			meanSuitability: 0,
			corridorBonus: 1,
			kind: "land",
		}),
	).toBe(2000.2)
})
it("classifies each maritime threshold exactly", () => {
	expect(
		[150, 150.01, 500, 500.01, 2000, 2000.01].map((distanceKm) =>
			M.capabilityYear({ distanceKm }),
		),
	).toEqual([-79999, -2999, -2999, -999, -999, 1500])
})
it("keeps the exact rounded cutoff and continuous after-horizon dates", () => {
	const continuousArrival = Float64Array.of(-79999, 2025, 2025.3, Infinity)
	const result = M.horizon({ continuousArrival, desolate: new Uint8Array(4) })
	expect([...result.arrivalYear]).toEqual([
		-79999,
		2025,
		M.sentinel,
		M.sentinel,
	])
	expect([...result.contextMask]).toEqual([1, 1, 0, 0])
	expect([...result.order]).toEqual([0, 1])
	expect(result.migrationWave[3]).toBe(-1)
})
it("selects one reproducible origin and blocks desolate transit", () => {
	const w = F.world({ neighbors: [[1], [0, 2], [1]], desolate: [1], seed: 42 })
	if (w.historyMigration.pipeline !== "distribution") throw new Error("Fixture")
	const m = w.historyMigration.data
	expect(m.origin).toBeGreaterThanOrEqual(0)
	expect([...m.arrivalYear].filter((y) => y === -79999)).toHaveLength(1)
	expect(m.continuousArrival[1]).toBe(Infinity)
	expect(m.continuousArrival[m.origin === 0 ? 2 : 0]).toBe(Infinity)
	expect(m.diagnostics.arrivalPathfindingRuns).toBe(1)
})
it("allows successive 75 km ocean crossings without crossing an intermediate island", () => {
	const w = F.world({ neighbors: [[], [], []], desolate: [], seed: 42 })
	const provinces = w.provinces!
	provinces.seeds = Int32Array.of(0, 2, 4)
	provinces.regionProvince = Int32Array.of(0, -1, 1, -1, 2)
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
	const m = M.compute({
		provinces,
		mesh,
		ocean: Uint8Array.of(0, 1, 0, 1, 0),
		planetRadiusKm: 6371,
		habitability: Float32Array.of(3, 1, 1),
		seed: 42,
	})
	expect(m.origin).toBe(0)
	expect(m.diagnostics.seaEdges).toBe(2)
	expect([...m.predecessor]).toEqual([-1, 0, 1])
	expect([...m.edgeKind]).toEqual([0, 2, 2])
	expect(m.continuousArrival[1]).toBeCloseTo(-79999 + 107.5, 0)
	expect(m.continuousArrival[2]).toBeCloseTo(-79999 + 215, 0)
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
		ocean: new Uint8Array(2),
		planetRadiusKm: 6371,
		habitability: new Float32Array(2),
		seed: 42,
	}
	const a = M.compute(params),
		b = M.compute({ ...params, planetRadiusKm: 12742 })
	const destination = 1 - a.origin
	expect(b.origin).toBe(a.origin)
	expect(b.continuousArrival[destination] + 79999).toBeCloseTo(
		2 * (a.continuousArrival[destination] + 79999),
	)
	expect(a.continuousArrival[destination] + 79999).toBeCloseTo(127.42, 0)
})
it("performs no searches for empty and all-desolate worlds", () => {
	for (const neighbors of [[], [[]]] as number[][][]) {
		const w = F.world({
			neighbors,
			desolate: neighbors.length ? [0] : [],
			seed: 42,
		})
		if (w.historyMigration.pipeline !== "distribution")
			throw new Error("Fixture")
		expect(w.historyMigration.data.origin).toBe(-1)
		expect(w.historyMigration.data.diagnostics.arrivalPathfindingRuns).toBe(0)
		expect(w.historyMigration.data.diagnostics.seaCorridorBuildRuns).toBe(0)
	}
})

it("excludes after-horizon and unreachable provinces from population weights and culture/religion context",()=>{
 const w=F.world({neighbors:[[1],[0,2],[1,3],[2]],desolate:[],seed:42}),provinces=w.provinces!
 const m=M.horizon({continuousArrival:Float64Array.of(-79999,-1000,2025.3,Infinity),desolate:provinces.desolate})
 const landmarks={count:1,regionLandmark:new Int32Array(4),type:Uint8Array.of(0),size:Int32Array.of(4)}
 const climateZones=new Uint8Array(4).fill(5),vegetation=new Uint8Array(4).fill(3),topography=new Uint8Array(4)
 const population=POPULATION.computePopulation({provinces,landmarks,climateZones,vegetation,topography,oceanCoastal:new Uint8Array(4),lakeCoastal:new Uint8Array(4),riverVisible:new Uint8Array(4),seed:42,mesh:w.mesh,planetRadiusKm:6371,migrationWave:Float32Array.from(m.migrationWave,(wave,p)=>m.contextMask[p]?wave:-1),settlementWave:1,migrationFalloff:0})
 population.migrationWave=m.migrationWave
 expect(population.population[2]).toBe(0);expect(population.population[3]).toBe(0)
 const society=SIM_DERIVE.deriveSociety({historyPipeline:"distribution",isEarthImport:false,provinces,population,landmarks,coastal:new Uint8Array(4),waterAccess:new Uint8Array(4),riverVisible:new Uint8Array(4),r_xyz:w.mesh.r_xyz,seed:42,planetRadiusKm:6371,era:"lateMedieval",eraSettledMask:m.contextMask,eraStatehoodMask:new Uint8Array(4),timings:[]})
 expect(society.cultures?.assignment[2]).toBe(-1);expect(society.cultures?.assignment[3]).toBe(-1)
 let negativeContributions=0
 for(let p=0;p<4;p++)if((society.cultures?.assignment[p]??-1)>=0 && m.migrationWave[p]<0)negativeContributions++
 expect(negativeContributions).toBe(0)
})
