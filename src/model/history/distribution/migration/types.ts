import type { SphereMesh } from "@/model/mesh/types"
import type { GenesisProvinces } from "@/model/society/types"

export interface MigrationParams {
	provinces: GenesisProvinces
	habitability: Float32Array
	mesh: Pick<
		SphereMesh,
		"numRegions" | "r_xyz" | "adjOffset" | "adjList" | "regionArea"
	>
	ocean: Uint8Array
	planetRadiusKm: number
	seed: number
}
export interface TransitParams {
	sourceArrival: number
	distanceKm: number
	meanSuitability: number
	corridorBonus: number
	kind: "land" | "sea"
}
export interface SeaLink {
	a: number
	b: number
	distanceKm: number
}
export interface MigrationDiagnostics {
	initializationMs: number
	seaCorridorBuildRuns: number
	arrivalPathfindingRuns: number
	landEdges: number
	seaEdges: number
	seaLengthQuantiles: number[]
	oceanEdgeQuantiles: number[]
	nominalSpacingKm: number
	gateSensitivityCounts: number[]
}
export interface MigrationResult {
	origin: number
	arrivalYear: Int32Array
	continuousArrival: Float64Array
	predecessor: Int32Array
	edgeKind: Uint8Array
	arrivalTier: Uint8Array
	order: Int32Array
	contextMask: Uint8Array
	migrationWave: Float32Array
	componentId: Int32Array
	diagnostics: MigrationDiagnostics
}
export type HistoryMigration =
	| { pipeline: "distribution"; data: MigrationResult }
	| { pipeline: "simulation" | "earth" }
export interface HorizonParams {
	continuousArrival: Float64Array
	desolate: Uint8Array
}
export interface DistanceParams {
	distanceKm: number
}

export interface RegionPair {
	a: number
	b: number
}
export interface MigrationEdge {
	destination: number
	distanceKm: number
	kind: "land" | "sea"
}
