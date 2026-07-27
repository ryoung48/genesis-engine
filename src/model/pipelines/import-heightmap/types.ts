import type { SphereMesh } from "@/model/types/mesh"

export interface ImportParams {
	seed: number
	numPoints: number
	jitter: number
	grayscale: Uint8Array
	imageWidth: number
	imageHeight: number
	coastlineMask?: Uint8Array
	maskWidth?: number
	maskHeight?: number
	coastDensityBoost?: number
	lakeMask?: Uint8Array
	lakeMaskWidth?: number
	lakeMaskHeight?: number
	riverLines?: { points: number[]; strokeweig: number; name?: string | null }[]
	/** Real-world named lake polygons (Natural Earth ne_50m_lakes), used to
	 * label lake landmarks with their real name instead of a generated one. */
	lakeNames?: { name: string; ring: [number, number][] }[]
	/** Real-world province centers + land-area weights (e.g. from
	 * classified_provinces_weighted.json), used to assign provinces from
	 * real data instead of the procedural BFS partition -- see
	 * computeWeightedProvinces. */
	realProvinces?: { name: string; lon: number; lat: number; weight: number }[]
	realClimateMonthly?: Int16Array
	realClimateWidth?: number
	realClimateHeight?: number
	realClimateMonths?: number
	realClimateScale?: number
	realClimateNoData?: number
	realPrecipMonthly?: Int16Array
	realPrecipWidth?: number
	realPrecipHeight?: number
	realPrecipMonths?: number
	realPrecipScale?: number
	realPrecipNoData?: number
	realDtrMonthly?: Int16Array
	realDtrWidth?: number
	realDtrHeight?: number
	realDtrMonths?: number
	realDtrScale?: number
	realDtrNoData?: number
	realVaporPressureMonthly?: Int16Array
	realVaporPressureWidth?: number
	realVaporPressureHeight?: number
	realVaporPressureMonths?: number
	realVaporPressureScale?: number
	realVaporPressureNoData?: number
	/**
	 * Real-world elevation (meters, single band), sampled onto each region
	 * and substituted for elevation_km after applySeaLevelToElevation. This
	 * can cover land only (WorldClim-style) or include ocean bathymetry; any
	 * region the raster has no coverage for keeps the heightmap-derived
	 * value. The 8-bit grayscale heightmap's sqrt-curve reconstruction has
	 * its own systematic error independent of terrain-warp/erosion
	 * (overestimates mid-range elevation, underestimates the highest peaks --
	 * see earth-real-temperature-compare.smoke.test.ts's elevation-bin
	 * diagnostic), so this replaces it outright wherever real data exists.
	 */
	realElevationRaster?: Int16Array
	realElevationWidth?: number
	realElevationHeight?: number
	realElevationScale?: number
	realElevationNoData?: number
	/** EU5 (Project Caesar) location topography/vegetation/climate category
	 * codes, sampled nearest-neighbor onto each region. Index into the
	 * matching EU5_*_CATEGORIES array in src/ui/planet/colors.ts. */
	eu5TopographyRaster?: Int16Array
	eu5TopographyWidth?: number
	eu5TopographyHeight?: number
	eu5TopographyNoData?: number
	eu5VegetationRaster?: Int16Array
	eu5VegetationWidth?: number
	eu5VegetationHeight?: number
	eu5VegetationNoData?: number
	eu5ClimateRaster?: Int16Array
	eu5ClimateWidth?: number
	eu5ClimateHeight?: number
	eu5ClimateNoData?: number
	/** Rasterized EU4 province-id map (see scripts/build-eu4-provinces.py),
	 * sampled nearest-neighbor onto each land region and used to assign
	 * provinces directly from real polygon boundaries -- see
	 * computeProvincesFromRaster. Takes priority over `realProvinces` when
	 * both are present. */
	eu4ProvincesRaster?: Int16Array
	eu4ProvincesWidth?: number
	eu4ProvincesHeight?: number
	eu4ProvincesNoData?: number
	/** Guaranteed-inside-polygon fallback point per eu4ProvincesRaster source
	 * id (see scripts/build-eu4-provinces.py), used to force-place ids the
	 * raster sampling missed entirely -- see computeProvincesFromRaster. */
	eu4ProvinceFallbackSeeds?: { id: number; lon: number; lat: number }[]
	terrainWarp: number
	smoothing: number
	hydraulicErosion: number
	thermalErosion: number
	ridgeSharpening: number
	glacialErosion: number
	seaLevel: number
	volcanism?: number
	craters?: number
	maxElevation?: number
	planetRadiusKm?: number
	obliquity?: number
	eccentricity?: number
	spectralClass?: string
	starSubtype?: number
	orbitalDistanceAU?: number
	daysPerYear?: number
	hoursPerDay?: number
	tidallyLocked?: boolean
	substellarLon?: number
	perihelion?: number
	pressure?: number
	/** Real per-body EBM overrides -- see GenesisParams.albedo/greenhouseFactor
	 * doc. Pass both for a known real body (e.g. importing the real Earth
	 * heightmap); leave unset for a generic imported heightmap. */
	albedo?: number
	greenhouseFactor?: number
	seismologyTotalHeatingK?: number
}

export interface RealRiverLineInput {
	points: number[] // flat [lon0, lat0, lon1, lat1, ...] degrees
	strokeweig: number
	name?: string | null
}

export interface RealProvinceInput {
	name: string
	lon: number
	lat: number
	weight: number
}

export type ProgressFn = (label: string, pct?: number) => void

export interface SampleBilinearParams {
	pixels: Uint8Array
	imgW: number
	imgH: number
	px: number
	py: number
}

export interface SampleSingleBandFloatRasterParams {
	mesh: SphereMesh
	raster: Int16Array
	rasterW: number
	rasterH: number
	scale: number
	nodata: number
}

export interface SampleCategoricalRasterParams {
	mesh: SphereMesh
	raster: Int16Array
	rasterW: number
	rasterH: number
	nodata: number
}

export interface SampleHeightmapParams {
	mesh: SphereMesh
	grayscale: Uint8Array
	imgW: number
	imgH: number
}

export interface SampleCoastlineMaskParams {
	mesh: SphereMesh
	mask: Uint8Array
	maskW: number
	maskH: number
}

export interface ReconcileElevationWithMaskParams {
	elevation: Float32Array
	maskIsLand: Uint8Array
	epsilon: number
}

export interface PointInRingParams {
	lonDeg: number
	latDeg: number
	ring: [number, number][]
}

export interface MatchRealLakeNamesParams {
	mesh: SphereMesh
	landmarks: { regionLandmark: Int32Array; type: Uint8Array; count: number }
	lakeLandmarkType: number
	lakePolygons: { name: string; ring: [number, number][] }[]
}

export interface MergeEu4LandMaskParams {
	mask: Uint8Array
	eu4Raster: Int16Array
	eu4Nodata: number
}

export interface ImportGenesisWorldParams {
	params: ImportParams
	onProgress?: ProgressFn
}
