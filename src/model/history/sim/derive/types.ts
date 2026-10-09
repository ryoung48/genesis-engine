import type { GenesisLandmarks } from "@/model/geography/terrain/landmarks/types"
import type { NATIONS } from "@/model/history/sim/nations"
import type { ReligionDoctrine } from "@/model/history/sim/religion/doctrine/types"
import type { StageTiming } from "@/model/pipelines/types"
import type { ProvincePopulation } from "@/model/society/population/types"
import type {
	GenesisPartition,
	GenesisProvinces,
	SocietyEra,
} from "@/model/society/types"

export interface DeriveSocietyParams {
	isEarthImport: boolean
	provinces: GenesisProvinces | undefined
	population: ProvincePopulation | undefined
	landmarks: GenesisLandmarks
	coastal: Uint8Array
	waterAccess: Uint8Array
	riverVisible: Uint8Array
	r_xyz: Float32Array
	seed: number
	planetRadiusKm: number
	era: SocietyEra | undefined
	// [JUSTIFICATION] undefined outside era-gated pipelines -- means "all non-desolate provinces qualify".
	eraSettledMask: Uint8Array | undefined
	// [JUSTIFICATION] undefined outside era-gated pipelines -- means "all non-desolate provinces qualify".
	eraStatehoodMask: Uint8Array | undefined
	timings: StageTiming[]
}

export interface DerivedSociety {
	// [JUSTIFICATION] eras without statehood (e.g. paleolithic) produce no nations.
	nations: ReturnType<typeof NATIONS.computeNations> | undefined
	// [JUSTIFICATION] a world with no settled provinces produces no partitions.
	cultures: GenesisPartition | undefined
	// [JUSTIFICATION] follows cultures.
	heritages: GenesisPartition | undefined
	// [JUSTIFICATION] follows cultures.
	religions: GenesisPartition | undefined
	// [JUSTIFICATION] follows religions.
	religionFamilies: Int32Array | undefined
	// [JUSTIFICATION] follows religions.
	religionTypes: Uint8Array | undefined
	// [JUSTIFICATION] Earth imports and worlds without religions have no doctrines.
	religionDoctrine: ReligionDoctrine | undefined
}
