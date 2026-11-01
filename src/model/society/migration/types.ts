import type { SphereMesh } from "@/model/mesh/types"
import type { SeaLink } from "@/model/society/migration/sea-links/types"
import type { GenesisProvinces } from "@/model/society/types"

export type MigrationEdgeKind = "land" | "sea" | "shelf"

export interface MigrationParams {
	provinces: GenesisProvinces
	habitability: Float32Array
	mesh: Pick<
		SphereMesh,
		"numRegions" | "r_xyz" | "adjOffset" | "adjList" | "regionArea"
	>
	isLand: Uint8Array
	elevationKm: Float32Array
	planetRadiusKm: number
	seed: number
	horizonYear: number
}

export interface TransitParams {
	sourceArrival: number
	distanceKm: number
	meanSuitability: number
	corridorBonus: number
	kind: MigrationEdgeKind
}

export interface MigrationEdge {
	destination: number
	distanceKm: number
	kind: MigrationEdgeKind
}

export interface MigrationDiagnostics {
	seaEdges: number
	shelfEdges: number
	landEdges: number
	seaLengthQuantiles: number[]
	waterEdgeQuantiles: number[]
	nominalSpacingKm: number
	gateSensitivityCounts: number[]
	suitabilityScale: number
}

export interface CradleChoice {
	province: number
	selectionYear: number
	arrivalYear: number
	residenceYears: number
	nearestDistanceKm: number
}

export interface MigrationResult {
	origin: number
	arrivalYear: Int32Array
	continuousArrival: Float64Array
	areaKm2: Float32Array
	predecessor: Int32Array
	edgeKind: Uint8Array
	arrivalTier: Uint8Array
	order: Int32Array
	migrationWave: Float32Array
	suitability: Float64Array
	componentId: Int32Array
	diagnostics: MigrationDiagnostics
}

export type HistoryMigration =
	| { pipeline: "distribution"; data: MigrationResult }
	| { pipeline: "simulation" | "earth" }

export interface HorizonParams {
	continuousArrival: Float64Array
	desolate: Uint8Array
	horizonYear: number
}

export interface WaveParams {
	year: number
	horizonYear: number
}

export interface CapabilityParams {
	distanceKm: number
}

export interface CradleSpacingParams {
	planetRadiusKm: number
}

export interface CradlesParams {
	provinces: GenesisProvinces
	arrivalYear: Int32Array
	siteScore: Float32Array
	r_xyz: Float32Array
	planetRadiusKm: number
}

export interface MatureScoreParams {
	siteScore: number
	arrivalYear: number
	year: number
}

export interface ActiveCradlesParams {
	cradles: CradleChoice[]
	year: number
}

export interface HeldCoreParams {
	provinces: GenesisProvinces
	suitability: Float64Array
	settled: Uint8Array
	sources: number[]
	count: number
	r_xyz: Float32Array
	planetRadiusKm: number
}

export interface IndexLinksParams {
	count: number
	links: SeaLink[]
}
