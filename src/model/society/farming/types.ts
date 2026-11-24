import type { SphereMesh } from "@/model/mesh/types"
import type { ProvinceGround } from "@/model/society/farming/ground/types"
import type { FarmingHearth } from "@/model/society/farming/hearths/types"
import type {
	Quantiles,
	SpreadParams,
} from "@/model/society/farming/spread/types"
import type { SeaLink } from "@/model/society/migration/sea-links/types"
import type { MigrationOutput } from "@/model/society/migration/types"
import type { GenesisProvinces } from "@/model/society/types"

export interface ProvinceGraph {
	count: number
	desolate: Uint8Array
	adjOffset: Int32Array
	adjList: Int32Array
}

export type WayOfLife = "uninhabited" | "forage" | "farm" | "herd"

export interface FarmingSummary {
	farmableKm2: number
	landEdgeSpeed: Quantiles
	pastoralYear: number
	livestockKnotYears: number[]
}

export interface FarmingResult {
	farmingYear: Int32Array
	adoptionYear: Int32Array
	herdYear: Int32Array
	herdAdoptionYear: Int32Array
	hearthOf: Int32Array
	farmingFrom: Int32Array
	settledYear: Int32Array
	postMode: Uint8Array
	forageDensity: Float32Array
	farmCapacity: Float32Array
	herdCapacity: Float32Array
	farmFit: Float32Array
	terraceFit: Float32Array
	ground: ProvinceGround
	herdFit: Float32Array
	herdColonial: Uint8Array
	farmModern: Uint8Array
	startClock: WayOfLifeAtParams["farming"]
	hearths: FarmingHearth[]
	summary: FarmingSummary
}

export interface FarmingParams {
	provinces: GenesisProvinces
	migration: MigrationOutput
	mesh: Pick<SphereMesh, "numRegions" | "r_xyz" | "regionArea">
	planetRadiusKm: number
	temperatureMonthly: Float32Array
	rainfallMonthly: Float32Array
	petMonthly: Float32Array
	elevationKm: Float32Array
	slopeScore: Float32Array
	soilFertility: Float32Array | null
	gdd: Float32Array
	topography: Uint8Array
	vegetation: Uint8Array
	riverVisible: Uint8Array
	horizonYear: number
}

export interface WayOfLifeAtParams {
	farming: Pick<
		FarmingResult,
		| "settledYear"
		| "adoptionYear"
		| "herdAdoptionYear"
		| "forageDensity"
		| "farmCapacity"
		| "herdCapacity"
		| "farmFit"
		| "terraceFit"
		| "herdFit"
		| "herdColonial"
		| "farmModern"
	>
	province: number
	year: number
	techLevel: number
}

export interface WayOfLifeShares {
	forage: number
	farm: number
	herd: number
}

export interface WayOfLifePeople {
	forage: number
	farm: number
	herd: number
}

export interface AdvantageParams {
	capacity: number
	forage: number
}

export interface WayOfLifeFieldParams {
	farming: WayOfLifeAtParams["farming"]
	graph: ProvinceGraph
	year: number
	techLevel: number
}

export interface WayOfLifeArrays {
	forage: Float32Array
	farm: Float32Array
	herd: Float32Array
}

export interface WayOfLifeField extends WayOfLifeArrays {
	density: Float32Array
}

export interface ModeOfParams {
	field: WayOfLifeArrays
	province: number
}

export interface HerdSearchParams {
	open: Uint8Array
	voyageYear: SpreadParams["voyageYear"]
	links: SeaLink[][]
	colonial: SpreadParams["colonial"]
}

export interface Herding {
	herdColonial: Uint8Array
	herdAdoptionYear: Int32Array
	herdFit: Float32Array
	adoption: Int32Array
}

export interface PastoralAdoptionParams {
	province: number
	year: number
}
