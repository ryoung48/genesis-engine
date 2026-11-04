import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import {
	loadEarthElevationRaster,
	loadEarthGrayscale,
	loadEarthMonthlyRaster,
	loadEarthRiverLines,
} from "@/test/earth/assets"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"

function importWorld() {
	const earth = loadEarthGrayscale("earth.png")
	const coastline = loadEarthGrayscale("coastline-mask.png")
	const lake = loadEarthGrayscale("lake-mask.png")
	const realClimate = loadEarthMonthlyRaster("earth-real-temperature")
	const realPrecip = loadEarthMonthlyRaster("earth-real-precipitation")
	const realElevation = loadEarthElevationRaster()
	const realWindU = loadEarthMonthlyRaster("earth-real-wind-u")
	const realWindV = loadEarthMonthlyRaster("earth-real-wind-v")
	const realCloudCover = loadEarthMonthlyRaster("earth-real-cloud-cover")
	const currentU = loadEarthMonthlyRaster("earth-real-current-u")
	const currentV = loadEarthMonthlyRaster("earth-real-current-v")
	const sstAnomaly = loadEarthMonthlyRaster("earth-real-sst-anomaly")
	return IMPORT_HEIGHTMAP.importGenesisWorld({
		params: {
			seed: 14963991,
			numPoints: DEFAULT_WORLD_PARAMS.numPoints,
			jitter: DEFAULT_WORLD_PARAMS.jitter,
			moons: DEFAULT_WORLD_PARAMS.moons,
			grayscale: earth.grayscale,
			imageWidth: earth.width,
			imageHeight: earth.height,
			coastlineMask: coastline.grayscale,
			maskWidth: coastline.width,
			maskHeight: coastline.height,
			lakeMask: lake.grayscale,
			lakeMaskWidth: lake.width,
			lakeMaskHeight: lake.height,
			riverLines: loadEarthRiverLines(),
			realClimateMonthly: realClimate.monthly,
			realClimateWidth: realClimate.width,
			realClimateHeight: realClimate.height,
			realClimateMonths: realClimate.months,
			realClimateScale: realClimate.scale,
			realClimateNoData: realClimate.nodata,
			realPrecipMonthly: realPrecip.monthly,
			realPrecipWidth: realPrecip.width,
			realPrecipHeight: realPrecip.height,
			realPrecipMonths: realPrecip.months,
			realPrecipScale: realPrecip.scale,
			realPrecipNoData: realPrecip.nodata,
			realElevationRaster: realElevation.raster,
			realElevationWidth: realElevation.width,
			realElevationHeight: realElevation.height,
			realElevationScale: realElevation.scale,
			realElevationNoData: realElevation.nodata,
			realWindUMonthly: realWindU.monthly,
			realWindVMonthly: realWindV.monthly,
			realWindWidth: realWindU.width,
			realWindHeight: realWindU.height,
			realWindMonths: realWindU.months,
			realWindScale: realWindU.scale,
			realWindNoData: realWindU.nodata,
			realCloudCoverMonthly: realCloudCover.monthly,
			realCloudCoverWidth: realCloudCover.width,
			realCloudCoverHeight: realCloudCover.height,
			realCloudCoverMonths: realCloudCover.months,
			realCloudCoverScale: realCloudCover.scale,
			realCloudCoverNoData: realCloudCover.nodata,
			realCurrentUMonthly: currentU.monthly,
			realCurrentVMonthly: currentV.monthly,
			realCurrentWidth: currentU.width,
			realCurrentHeight: currentU.height,
			realCurrentMonths: currentU.months,
			realCurrentScale: currentU.scale,
			realCurrentNoData: currentU.nodata,
			realSstAnomalyMonthly: sstAnomaly.monthly,
			realSstAnomalyWidth: sstAnomaly.width,
			realSstAnomalyHeight: sstAnomaly.height,
			realSstAnomalyMonths: sstAnomaly.months,
			realSstAnomalyScale: sstAnomaly.scale,
			realSstAnomalyNoData: sstAnomaly.nodata,
			terrainWarp: 0,
			smoothing: 0,
			hydraulicErosion: 0,
			thermalErosion: 0,
			ridgeSharpening: 0,
			glacialErosion: 0,
			seaLevel: DEFAULT_WORLD_PARAMS.seaLevel,
			volcanism: 1,
			craters: 0,
			maxElevation: DEFAULT_WORLD_PARAMS.maxElevation,
			planetRadiusKm: DEFAULT_WORLD_PARAMS.planetRadiusKm,
			obliquity: DEFAULT_WORLD_PARAMS.obliquity,
			eccentricity: DEFAULT_WORLD_PARAMS.eccentricity,
			spectralClass: DEFAULT_WORLD_PARAMS.spectralClass,
			starSubtype: DEFAULT_WORLD_PARAMS.starSubtype,
			orbitalDistanceAU: DEFAULT_WORLD_PARAMS.orbitalDistanceAU,
			daysPerYear: DEFAULT_WORLD_PARAMS.daysPerYear,
			hoursPerDay: DEFAULT_WORLD_PARAMS.hoursPerDay,
			substellarLon: DEFAULT_WORLD_PARAMS.substellarLon,
			perihelion: DEFAULT_WORLD_PARAMS.perihelion,
			pressure: DEFAULT_WORLD_PARAMS.pressure,
		},
	})
}

export const CLIMATE_EARTH = {
	importWorld,
}
