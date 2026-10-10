import type { GenesisLandmarks } from "@/model/geography/terrain/landmarks/types"
import type { HistoryState } from "@/model/history/sim/engine/state/types"
import type { ReligionDoctrine } from "@/model/history/sim/religion/doctrine/types"
import type { StageTiming } from "@/model/pipelines/types"
import type { SharedRng } from "@/model/shared/random/rng"
import type { ProvincePopulation } from "@/model/society/population/types"
import type {
	GenesisNationHierarchy,
	GenesisPartition,
	GenesisProvinces,
	SocietyEra,
} from "@/model/society/types"

export interface SeedColonyRelationsParams {
	state: HistoryState
	nations: GenesisNationHierarchy | undefined
}

export interface ProcessEventsUntilParams {
	state: HistoryState
	targetTime: number
	rng: SharedRng
	validate: boolean
}

export interface TimedParams<T> {
	label: string
	timings: StageTiming[] | undefined
	fn: () => T
}

export interface SimulateUntilParams {
	state: HistoryState
	targetTimeMs: number
	rng: SharedRng
	validate: boolean
}

export interface InitHistoryParams {
	nations: GenesisNationHierarchy
	provinces: GenesisProvinces
	population: ProvincePopulation
	coastal: Uint8Array
	// [JUSTIFICATION] Worlds without a separate water-access mask use coastal access.
	waterAccess?: Uint8Array
	riverVisible: Uint8Array
	r_xyz: Float32Array
	cultures: GenesisPartition
	// [JUSTIFICATION] Some generated worlds have no heritage partition.
	heritages?: GenesisPartition
	// [JUSTIFICATION] Some generated eras do not create religious partitions.
	religions?: GenesisPartition
	// [JUSTIFICATION] Earth imports and worlds without religions have no doctrines.
	religionDoctrine?: ReligionDoctrine
	// [JUSTIFICATION] The default era is used when none is supplied.
	era?: SocietyEra
	seed: number
	// [JUSTIFICATION] The engine supplies the default history start year.
	startYear?: number
	// [JUSTIFICATION] Imported worlds can lack procedural landmark data.
	landmarks?: GenesisLandmarks
	// [JUSTIFICATION] Older import inputs can omit region-level society mapping.
	regionProvince?: Int32Array
	// [JUSTIFICATION] Worlds without routing inputs can omit mesh adjacency.
	regionAdjOffset?: Int32Array
	// [JUSTIFICATION] Worlds without routing inputs can omit mesh adjacency.
	regionAdjList?: Int32Array
	// [JUSTIFICATION] Worlds without routing inputs can omit the mesh land mask.
	regionIsLand?: Uint8Array
	// [JUSTIFICATION] Worlds without a custom planet size use Earth's radius.
	planetRadiusKm?: number
	topography: Uint8Array | null
	vegetation: Uint8Array | null
	// [JUSTIFICATION] Imported worlds omit procedural settlement anchors.
	settlementRegions?: Int32Array
	// [JUSTIFICATION] Worlds without ports omit their water-body mapping.
	settlementWaterLandmarks?: Int32Array
	// [JUSTIFICATION] Worlds without ports omit port anchors.
	settlementPortRegions?: Int32Array
	// [JUSTIFICATION] Diagnostic callers may request initialization timings.
	timings?: StageTiming[]
}
