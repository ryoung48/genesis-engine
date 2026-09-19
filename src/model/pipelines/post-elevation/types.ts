import type { PastaDebug } from "@/model/climate/classification/pasta/types"
import type { TidalSchedule } from "@/model/climate/ocean/tides/tidal-schedule/types"
import type {
	GenesisClimate,
	GenesisHydrology,
	GenesisOceanCurrents,
	GenesisRainfall,
} from "@/model/climate/types"
import type { WindVectors } from "@/model/climate/weather/wind/types"
import type {
	BoundaryInfo,
	DistanceFields,
	GenesisTerrainFeatures,
} from "@/model/geography/tectonics/types"
import type { GenesisHazards } from "@/model/geography/terrain/hazards/types"
import type { GenesisLandmarks } from "@/model/geography/terrain/landmarks/types"
import type { GenesisLocations } from "@/model/geography/terrain/locations/types"
import type { GenesisRivers } from "@/model/geography/terrain/rivers/types"
import type { SphereMesh } from "@/model/mesh/types"

export type ApplyOceanCurrentsToClimateParams = {
	mesh: SphereMesh
	climate: GenesisClimate
	isLand: Uint8Array
	oceanCurrents: GenesisOceanCurrents
	isLocked: boolean
}

import type {
	GenesisParams,
	GenesisWorld,
	StageTiming,
} from "@/model/pipelines/types"
import type { LocationTradeGoods } from "@/model/society/infrastructure/trade/trade-goods/types"
import type { ProvincePopulation } from "@/model/society/population/types"
import type { GenesisProvinces } from "@/model/society/types"

interface RealRiversInput {
	lines: [number, number, number, number][][]
	visible: Uint8Array
	riverId: Int32Array
	riverLengthKm: Float32Array
	riverNames?: (string | null)[]
	minFlow: number
	maxFlow: number
}

export interface PostPipelineInput {
	mesh: SphereMesh
	/** Raw [0,1] elevation */
	elevation: Float32Array
	/** Physical elevation in km */
	elevation_km: Float32Array
	/** Final land mask (will be mutated to clear lake cells) */
	isLand: Uint8Array
	/** Land mask used for river routing (may include small ocean patches) */
	riverLand: Uint8Array
	distCoast: Float32Array
	oceanDist: Float32Array
	params: GenesisParams
	/** Cells that emerged above the baseline shoreline after sea-level lowering. */
	emergedLand?: Uint8Array
	tectonicMode: "active"
	boundary: BoundaryInfo
	distFields: DistanceFields
	r_hotspot: Float32Array
	r_mantleUpwelling?: Float32Array
	terrainFeatures?: GenesisTerrainFeatures
	onProgress?: (label: string, pct?: number) => void
	/** Real lake cells (from a vector lake mask) that must survive the arid/rainfall-based lake-draining heuristic below — real lakes (e.g. the Aral Sea) can sit in regions too dry for computeLakes' own rainfall model to have created them procedurally. */
	realLakeRegions?: Uint8Array
	/** Real river network — see RealRiversInput. */
	realRivers?: RealRiversInput
	/** Real-world province seeds (already resolved to mesh regions by the
	 * caller), used to assign provinces via computeWeightedProvinces instead
	 * of computeProvinces' procedural BFS. */
	realProvinceSeeds?: {
		regions: Int32Array
		weights: Float32Array
		names: string[]
	}
	/** Per-region real-world province id sampled from a rasterized source
	 * (e.g. EU4 province polygons), -1 = no data. Takes priority over
	 * realProvinceSeeds -- assigns provinces via computeProvincesFromRaster
	 * instead of Voronoi-partitioning from seed points. */
	eu4ProvinceIds?: Int16Array
	/** Guaranteed-inside-polygon fallback point per eu4ProvinceIds source id,
	 * used to force-place ids the raster sampling missed entirely -- see
	 * computeProvincesFromRaster. */
	eu4ProvinceFallbackSeeds?: { id: number; lon: number; lat: number }[]
	/** Observed-Earth monthly temperature raster (°C * scale), attached before
	 * Pasta climate classification so Earth-import vegetation is derived from
	 * observed rather than procedural climate. See attachObservedEarthClimate. */
	realClimateMonthly?: Int16Array
	realClimateWidth?: number
	realClimateHeight?: number
	realClimateMonths?: number
	realClimateScale?: number
	realClimateNoData?: number
	/** Observed-Earth monthly precipitation raster (mm * scale). */
	realPrecipMonthly?: Int16Array
	realPrecipWidth?: number
	realPrecipHeight?: number
	realPrecipMonths?: number
	realPrecipScale?: number
	realPrecipNoData?: number
	/** Observed-Earth monthly total cloud-cover raster (fraction * scale). */
	realCloudCoverMonthly?: Int16Array
	realCloudCoverWidth?: number
	realCloudCoverHeight?: number
	realCloudCoverMonths?: number
	realCloudCoverScale?: number
	realCloudCoverNoData?: number
	/** Observed-Earth monthly diurnal temperature range raster (°C * scale). */
	realDtrMonthly?: Int16Array
	realDtrWidth?: number
	realDtrHeight?: number
	realDtrMonths?: number
	realDtrScale?: number
	realDtrNoData?: number
	/** Observed-Earth monthly 10m wind u/v rasters (m/s * scale, NCEP/NCAR reanalysis). */
	realWindUMonthly?: Int16Array
	realWindVMonthly?: Int16Array
	realWindWidth?: number
	realWindHeight?: number
	realWindMonths?: number
	realWindScale?: number
	realWindNoData?: number
	/** Observed-Earth monthly surface ocean current u/v rasters (m/s * scale, GODAS). */
	realCurrentUMonthly?: Int16Array
	realCurrentVMonthly?: Int16Array
	realCurrentWidth?: number
	realCurrentHeight?: number
	realCurrentMonths?: number
	realCurrentScale?: number
	realCurrentNoData?: number
	/** Observed-Earth monthly SST anomaly raster vs zonal mean (°C * scale, NOAA OISST). */
	realSstAnomalyMonthly?: Int16Array
	realSstAnomalyWidth?: number
	realSstAnomalyHeight?: number
	realSstAnomalyMonths?: number
	realSstAnomalyScale?: number
	realSstAnomalyNoData?: number
}

export interface PostPipelineOutput {
	climate: GenesisClimate
	wind: WindVectors
	/** [JUSTIFICATION] Present only for Earth imports with an observed cloud-cover raster. */
	observedCloudCover?: {
		real_monthly: Float32Array
		real_annual: Float32Array
	}
	/** [JUSTIFICATION] Derived only while importing Earth from observed temperature, rainfall, and DTR rasters. */
	observedHydrology?: GenesisWorld["observedHydrology"]
	rainfall: GenesisRainfall
	monthlyTEQ: Float32Array[]
	hydrology: GenesisHydrology
	vegetation: Uint8Array
	/** [JUSTIFICATION] Present only for Earth imports, where it is classified from observed climate data. */
	realVegetation?: Uint8Array
	rivers: GenesisRivers
	iceThickness: Float32Array
	iceMinMonthly: Float32Array
	iceMaxMonthly: Float32Array
	topography: Uint8Array
	coastal: Uint8Array
	slopeScore: Float32Array
	climateZones: Uint8Array
	/** [JUSTIFICATION] Present only for Earth imports, where zones are classified from observed temperatures. */
	realClimateZones?: Uint8Array
	koppenClimate: Uint8Array
	realKoppenClimate?: Uint8Array
	realPastaClimate?: Uint8Array
	pastaClimate: Uint8Array | undefined
	pastaDebug: PastaDebug | undefined
	realPastaDebug?: PastaDebug
	dtr_annual: Float32Array
	dtr_monthly: Float32Array
	observedDtr?: GenesisWorld["observedDtr"]
	observedHumidity?: GenesisWorld["observedHumidity"]
	observedWind?: GenesisWorld["observedWind"]
	observedCurrent?: GenesisWorld["observedCurrent"]
	waterAccess: Uint8Array
	riverAccess: Uint8Array
	lakeAccess: Uint8Array
	provinces: GenesisProvinces | undefined
	locations: GenesisLocations | undefined
	population: ProvincePopulation | undefined
	tradeGoods: LocationTradeGoods | undefined
	hazards: GenesisHazards
	cycloneRisk: Float32Array
	tornadoRisk: Float32Array
	tidalRange: Float32Array
	tidalSchedule: TidalSchedule
	landmarks: GenesisLandmarks
	oceanCurrents: GenesisOceanCurrents
	timings: StageTiming[]
	eraSettledMask: Uint8Array | undefined
	eraStatehoodMask: Uint8Array | undefined
}
