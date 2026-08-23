import { STAR } from "@/model/celestial/star"
import { KOPPEN } from "@/model/climate/classification/koppen"
import { SYNTHETIC_PLATES } from "@/model/geography/tectonics/synthetic-plates"
import { COAST_DENSITY } from "@/model/geography/terrain/coast-density"
import { EROSION } from "@/model/geography/terrain/erosion"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { SEA_LEVEL } from "@/model/geography/terrain/sea-level"
import { MESH } from "@/model/mesh"
import { DERIVE_PROVINCE_SOCIETY } from "@/model/pipelines/derive-province-society"
import { REAL_EARTH_DATA } from "@/model/pipelines/import-heightmap/real-earth-data"
import { SAMPLING } from "@/model/pipelines/import-heightmap/sampling"
import type { ImportGenesisWorldParams } from "@/model/pipelines/import-heightmap/types"
import { POST_ELEVATION } from "@/model/pipelines/post-elevation"
import type {
	GenesisParams,
	GenesisWorld,
	StageTiming,
} from "@/model/pipelines/types"
import { STATS } from "@/model/shared/math/stats"
import { RNG } from "@/model/shared/random/rng"
import { UNITS } from "@/model/shared/units"

function createTimingRecorder() {
	const timings: StageTiming[] = []
	return {
		timings,
		record(stage: string, startMs: number) {
			timings.push({
				Stage: stage,
				ms: (performance.now() - startMs).toFixed(1),
			})
		},
	}
}

function importGenesisWorld({
	params,
	onProgress,
}: ImportGenesisWorldParams): GenesisWorld {
	const { timings, record } = createTimingRecorder()
	const rng = RNG.createRng({ seed: params.seed })

	onProgress?.("import:mesh", 3)
	let t0 = performance.now()
	const densityCoastlineMask =
		params.coastlineMask &&
		params.maskWidth &&
		params.maskHeight &&
		params.eu4ProvincesRaster &&
		params.eu4ProvincesWidth === params.maskWidth &&
		params.eu4ProvincesHeight === params.maskHeight
			? REAL_EARTH_DATA.mergeEu4LandMask({
					mask: params.coastlineMask,
					eu4Raster: params.eu4ProvincesRaster,
					eu4Nodata: params.eu4ProvincesNoData ?? -32768,
				})
			: params.coastlineMask
	const densityWeight =
		densityCoastlineMask && params.maskWidth && params.maskHeight
			? COAST_DENSITY.buildCoastDensityWeight({
					mask: densityCoastlineMask,
					width: params.maskWidth,
					height: params.maskHeight,
					options: {
						boost: params.coastDensityBoost ?? 8,
						// Only usable when the lake mask matches the coastline
						// mask's resolution (both are rasterized at the same
						// size for this app) — mismatched sizes are silently
						// ignored by the caller, not mixed pixel-for-pixel.
						lakeMask:
							params.lakeMask &&
							params.lakeMaskWidth === params.maskWidth &&
							params.lakeMaskHeight === params.maskHeight
								? params.lakeMask
								: undefined,
						// Same-resolution province raster doubles as a source of
						// density-boosting boundaries (province borders), not
						// just land/ocean coastline.
						provinceRaster:
							params.eu4ProvincesRaster &&
							params.eu4ProvincesWidth === params.maskWidth &&
							params.eu4ProvincesHeight === params.maskHeight
								? params.eu4ProvincesRaster
								: undefined,
					},
				})
			: undefined
	const mesh = MESH.buildSphereMesh({
		n: params.numPoints,
		jitter: params.jitter,
		rng,
		densityWeight,
	})
	record("Sphere mesh (Fibonacci + Delaunay + pole)", t0)

	onProgress?.("import:heightmap", 10)
	t0 = performance.now()
	const elevation = SAMPLING.sampleHeightmap({
		mesh,
		grayscale: params.grayscale,
		imgW: params.imageWidth,
		imgH: params.imageHeight,
	})
	record("Heightmap sampling", t0)

	// Authoritative land/ocean mask from vector coastline data, if provided.
	// Reconciled against elevation now (before warp/erosion) and again after,
	// so post-processing can reshape terrain magnitude near the coast but can
	// never redraw which side of the coastline a cell is on.
	let maskIsLand: Uint8Array | undefined
	if (params.coastlineMask && params.maskWidth && params.maskHeight) {
		t0 = performance.now()
		maskIsLand = SAMPLING.sampleCoastlineMask({
			mesh,
			mask: params.coastlineMask,
			maskW: params.maskWidth,
			maskH: params.maskHeight,
		})
		REAL_EARTH_DATA.reconcileElevationWithMask({
			elevation,
			maskIsLand,
			epsilon: 0.02,
		})
		record("Coastline mask reconciliation", t0)
	}

	// Post-processing
	if (params.terrainWarp > 0) {
		t0 = performance.now()
		EROSION.warpTerrain({
			mesh,
			elev: elevation,
			seed: params.seed,
			strength: params.terrainWarp,
			r_hotspot: new Float32Array(mesh.numRegions),
		})
		record(`Terrain warp (strength=${params.terrainWarp.toFixed(2)})`, t0)
	}

	// Warp can shift elevation sign near the coast; re-clamp to the mask
	// before deriving r_isOcean so erosion/smoothing operate on the correct
	// boundary from the start.
	if (maskIsLand)
		REAL_EARTH_DATA.reconcileElevationWithMask({
			elevation,
			maskIsLand,
			epsilon: 0.02,
		})

	const r_isOcean = new Uint8Array(mesh.numRegions)
	if (maskIsLand) {
		for (let r = 0; r < mesh.numRegions; r++)
			r_isOcean[r] = maskIsLand[r] ? 0 : 1
	} else {
		for (let r = 0; r < mesh.numRegions; r++) {
			if (elevation[r] <= 0) r_isOcean[r] = 1
		}
	}

	if (params.smoothing > 0) {
		const smoothIters = Math.round(1 + params.smoothing * 4)
		const smoothStr = 0.2 + params.smoothing * 0.5
		t0 = performance.now()
		EROSION.smoothElevation({
			mesh,
			elev: elevation,
			r_isOcean,
			iterations: smoothIters,
			strength: smoothStr,
		})
		record(`Smoothing (${smoothIters} iters, str=${smoothStr.toFixed(2)})`, t0)
	}

	const gIters = Math.round(params.glacialErosion * 10)
	if (params.hydraulicErosion > 0 || params.thermalErosion > 0 || gIters > 0) {
		const hIters = Math.round(params.hydraulicErosion * 20)
		const hK = params.hydraulicErosion * 0.0006
		const tIters = Math.round(params.thermalErosion * 10)
		const talusSlope = 1.2 - params.thermalErosion * 0.4
		const kThermal = params.thermalErosion * 0.15
		t0 = performance.now()
		EROSION.erodeComposite({
			mesh,
			elev: elevation,
			r_isOcean,
			hIters,
			K: hK,
			m: 0.5,
			dt: 1.0,
			tIters,
			talusSlope,
			kThermal,
			gIters,
			glacialStrength: params.glacialErosion,
		})
		record(`Erosion composite (h=${hIters}, t=${tIters}, g=${gIters})`, t0)
	}

	if (params.ridgeSharpening > 0) {
		const rsIters = Math.round(1 + params.ridgeSharpening * 3)
		const rsStr = params.ridgeSharpening * 0.08
		t0 = performance.now()
		EROSION.sharpenRidges({
			mesh,
			elev: elevation,
			r_isOcean,
			iterations: rsIters,
			strength: rsStr,
		})
		record(`Ridge sharpening (${rsIters} iters)`, t0)
	}

	t0 = performance.now()
	EROSION.applySoilCreep({
		mesh,
		elev: elevation,
		r_isOcean,
		iterations: 3,
		strength: 0.1125,
	})
	record("Soil creep (3 iters)", t0)
	onProgress?.("import:post", 20)

	// Final clamp: erosion/soil-creep can nudge elevation across zero near
	// the coast even though r_isOcean itself was fixed going in — reconcile
	// once more so the coastline that reaches isLand/plates/climate below is
	// still exactly the vector mask, not wherever erosion left it.
	if (maskIsLand)
		REAL_EARTH_DATA.reconcileElevationWithMask({
			elevation,
			maskIsLand,
			epsilon: 0.02,
		})

	// Derive synthetic plates
	t0 = performance.now()
	const { plateAssignment, plateIds, plateIsOcean } =
		SYNTHETIC_PLATES.deriveSyntheticPlates({ mesh, elevation })
	const plates = SYNTHETIC_PLATES.buildSyntheticPlates({
		plateIds,
		plateIsOcean,
	})
	const boundary = SYNTHETIC_PLATES.buildDummyBoundary({ mesh, elevation })
	const distFields = SYNTHETIC_PLATES.computeSimpleDistanceFields({
		mesh,
		elevation,
		planetRadiusKm: params.planetRadiusKm ?? UNITS.defaultPlanetRadiusKm,
	})
	record("Synthetic plates + boundary", t0)
	onProgress?.("import:plates", 25)

	// Ocean distance
	t0 = performance.now()
	const isLand = new Uint8Array(mesh.numRegions)
	for (let r = 0; r < mesh.numRegions; r++) {
		if (elevation[r] > 0) isLand[r] = 1
	}

	// Real lake cells (vector lake polygons) carve water out of `isLand` the
	// same way the coastline mask does for ocean — before oceanDist/plates
	// are computed, so downstream stages see the final water geometry from
	// the start rather than only after a later reconciliation pass.
	let realLakeRegions: Uint8Array | undefined
	if (params.lakeMask && params.lakeMaskWidth && params.lakeMaskHeight) {
		realLakeRegions = SAMPLING.sampleCoastlineMask({
			mesh,
			mask: params.lakeMask,
			maskW: params.lakeMaskWidth,
			maskH: params.lakeMaskHeight,
		})
		for (let r = 0; r < mesh.numRegions; r++) {
			if (realLakeRegions[r]) isLand[r] = 0
		}
	}

	const oceanDist = STATS.computeOceanDistanceBFS({
		mesh,
		isLand,
		planetRadiusKm: params.planetRadiusKm ?? UNITS.defaultPlanetRadiusKm,
	})
	record("Ocean distance (BFS)", t0)
	onProgress?.("import:oceanDist", 28)

	// Build GenesisParams from ImportParams
	const genesisParams: GenesisParams = {
		seed: params.seed,
		tideLock: null,
		numPoints: params.numPoints,
		numPlates: plateIds.length,
		landDistribution: 0.25,
		continentSizeVariety: 0,
		landCoverage: 0.3,
		jitter: params.jitter,
		roughness: 0,
		terrainWarp: params.terrainWarp,
		smoothing: params.smoothing,
		hydraulicErosion: params.hydraulicErosion,
		thermalErosion: params.thermalErosion,
		ridgeSharpening: params.ridgeSharpening,
		glacialErosion: params.glacialErosion,
		seaLevel: params.seaLevel,
		volcanism: params.volcanism ?? 0.5,
		planetRadiusKm: params.planetRadiusKm ?? UNITS.defaultPlanetRadiusKm,
		obliquity: params.obliquity ?? UNITS.defaultObliquityDeg,
		eccentricity: params.eccentricity ?? UNITS.defaultEccentricity,
		spectralClass: params.spectralClass ?? STAR.defaultSpectralClass,
		starSubtype: params.starSubtype ?? STAR.defaultStarSubtype,
		orbitalDistanceAU:
			params.orbitalDistanceAU ?? STAR.defaultOrbitalDistanceAu,
		daysPerYear: params.daysPerYear ?? UNITS.defaultDaysPerYear,
		hoursPerDay: params.hoursPerDay ?? UNITS.defaultHoursPerDay,
		pastaGintThreshold: params.pastaGintThreshold ?? 1250,
		substellarLon: params.substellarLon ?? UNITS.defaultSubstellarLon,
		perihelion: params.perihelion ?? UNITS.defaultPerihelion,
		pressure: params.pressure ?? 1.0,
		albedo: params.albedo,
		greenhouseFactor: params.greenhouseFactor,
		seismologyTotalHeatingK: params.seismologyTotalHeatingK,
	}

	const maxElevKm = (genesisParams.maxElevation ?? 6000) / 1000
	const maxDepthKm = UNITS.getMaxOceanDepthKm(genesisParams.planetRadiusKm)
	const baseElevation = elevation.slice()
	const { elevation: finalElevation, elevation_km } =
		SEA_LEVEL.applySeaLevelToElevation({
			baseElevation,
			maxElevKm,
			maxDepthKm,
			seaLevel: genesisParams.seaLevel,
		})
	elevation.set(finalElevation)

	// Real-world elevation override: the 8-bit grayscale heightmap's
	// sqrt-curve reconstruction has its own systematic error independent of
	// terrain-warp/erosion, so substitute accurate sampled elevation wherever
	// the raster has coverage. This supports both land-only rasters and
	// merged land+bathymetry rasters. Does not touch the normalized
	// `elevation` array (rendering/mesh geometry), only elevation_km.
	if (
		params.realElevationRaster &&
		params.realElevationWidth &&
		params.realElevationHeight &&
		params.realElevationScale !== undefined &&
		params.realElevationNoData !== undefined
	) {
		const realElevationM = SAMPLING.sampleSingleBandFloatRaster({
			mesh,
			raster: params.realElevationRaster,
			rasterW: params.realElevationWidth,
			rasterH: params.realElevationHeight,
			scale: params.realElevationScale,
			nodata: params.realElevationNoData,
		})
		for (let r = 0; r < mesh.numRegions; r++) {
			const realKm = realElevationM[r] / 1000
			if (Number.isFinite(realKm)) elevation_km[r] = realKm
		}
	}

	const eu5Topography =
		params.eu5TopographyRaster &&
		params.eu5TopographyWidth &&
		params.eu5TopographyHeight &&
		params.eu5TopographyNoData !== undefined
			? SAMPLING.sampleCategoricalRaster({
					mesh,
					raster: params.eu5TopographyRaster,
					rasterW: params.eu5TopographyWidth,
					rasterH: params.eu5TopographyHeight,
					nodata: params.eu5TopographyNoData,
				})
			: undefined
	const eu5Vegetation =
		params.eu5VegetationRaster &&
		params.eu5VegetationWidth &&
		params.eu5VegetationHeight &&
		params.eu5VegetationNoData !== undefined
			? SAMPLING.sampleCategoricalRaster({
					mesh,
					raster: params.eu5VegetationRaster,
					rasterW: params.eu5VegetationWidth,
					rasterH: params.eu5VegetationHeight,
					nodata: params.eu5VegetationNoData,
				})
			: undefined
	const eu5Climate =
		params.eu5ClimateRaster &&
		params.eu5ClimateWidth &&
		params.eu5ClimateHeight &&
		params.eu5ClimateNoData !== undefined
			? SAMPLING.sampleCategoricalRaster({
					mesh,
					raster: params.eu5ClimateRaster,
					rasterW: params.eu5ClimateWidth,
					rasterH: params.eu5ClimateHeight,
					nodata: params.eu5ClimateNoData,
				})
			: undefined

	let realRivers:
		| ReturnType<typeof REAL_EARTH_DATA.buildRealRiversData>
		| undefined
	if (params.riverLines?.length) {
		t0 = performance.now()
		realRivers = REAL_EARTH_DATA.buildRealRiversData(
			mesh,
			params.riverLines,
			elevation_km,
			genesisParams.planetRadiusKm,
		)
		record("Real river snapping", t0)
	}

	let realProvinceSeeds:
		| ReturnType<typeof REAL_EARTH_DATA.resolveRealProvinceSeeds>
		| undefined
	if (params.realProvinces?.length) {
		t0 = performance.now()
		realProvinceSeeds = REAL_EARTH_DATA.resolveRealProvinceSeeds(
			mesh,
			isLand,
			params.realProvinces,
		)
		record("Real province seed resolution", t0)
	}

	let eu4ProvinceIds: Int16Array | undefined
	if (
		params.eu4ProvincesRaster &&
		params.eu4ProvincesWidth &&
		params.eu4ProvincesHeight &&
		params.eu4ProvincesNoData !== undefined
	) {
		t0 = performance.now()
		eu4ProvinceIds = SAMPLING.sampleCategoricalRaster({
			mesh,
			raster: params.eu4ProvincesRaster,
			rasterW: params.eu4ProvincesWidth,
			rasterH: params.eu4ProvincesHeight,
			nodata: params.eu4ProvincesNoData,
		})
		record("EU4 province raster sampling", t0)
	}

	// Shared post-elevation pipeline (climate → population). Real climate
	// rasters are passed straight in so post-elevation can attach observed
	// Earth temperature/rainfall/DTR *before* it runs the Pasta climate
	// classification -- vegetation for Earth imports should key off observed
	// climate, not the procedural EBM output. See runPostElevationPipeline's
	// "Observed Earth climate" step.
	t0 = performance.now()
	const post = POST_ELEVATION.runPostElevationPipeline({
		mesh,
		elevation,
		elevation_km,
		isLand,
		riverLand: isLand,
		distCoast: distFields.distCoast,
		oceanDist,
		params: genesisParams,
		tectonicMode: "active",
		boundary,
		distFields,
		realLakeRegions,
		realRivers,
		realProvinceSeeds,
		eu4ProvinceIds,
		eu4ProvinceFallbackSeeds: params.eu4ProvinceFallbackSeeds,
		r_hotspot: new Float32Array(mesh.numRegions),
		r_mantleUpwelling: new Float32Array(mesh.numRegions),
		terrainFeatures: undefined,
		realClimateMonthly: params.realClimateMonthly,
		realClimateWidth: params.realClimateWidth,
		realClimateHeight: params.realClimateHeight,
		realClimateMonths: params.realClimateMonths,
		realClimateScale: params.realClimateScale,
		realClimateNoData: params.realClimateNoData,
		realPrecipMonthly: params.realPrecipMonthly,
		realPrecipWidth: params.realPrecipWidth,
		realPrecipHeight: params.realPrecipHeight,
		realPrecipMonths: params.realPrecipMonths,
		realPrecipScale: params.realPrecipScale,
		realPrecipNoData: params.realPrecipNoData,
		realCloudCoverMonthly: params.realCloudCoverMonthly,
		realCloudCoverWidth: params.realCloudCoverWidth,
		realCloudCoverHeight: params.realCloudCoverHeight,
		realCloudCoverMonths: params.realCloudCoverMonths,
		realCloudCoverScale: params.realCloudCoverScale,
		realCloudCoverNoData: params.realCloudCoverNoData,
		realDtrMonthly: params.realDtrMonthly,
		realDtrWidth: params.realDtrWidth,
		realDtrHeight: params.realDtrHeight,
		realDtrMonths: params.realDtrMonths,
		realDtrScale: params.realDtrScale,
		realDtrNoData: params.realDtrNoData,
		realWindUMonthly: params.realWindUMonthly,
		realWindVMonthly: params.realWindVMonthly,
		realWindWidth: params.realWindWidth,
		realWindHeight: params.realWindHeight,
		realWindMonths: params.realWindMonths,
		realWindScale: params.realWindScale,
		realWindNoData: params.realWindNoData,
		realCurrentUMonthly: params.realCurrentUMonthly,
		realCurrentVMonthly: params.realCurrentVMonthly,
		realCurrentWidth: params.realCurrentWidth,
		realCurrentHeight: params.realCurrentHeight,
		realCurrentMonths: params.realCurrentMonths,
		realCurrentScale: params.realCurrentScale,
		realCurrentNoData: params.realCurrentNoData,
		realSstAnomalyMonthly: params.realSstAnomalyMonthly,
		realSstAnomalyWidth: params.realSstAnomalyWidth,
		realSstAnomalyHeight: params.realSstAnomalyHeight,
		realSstAnomalyMonths: params.realSstAnomalyMonths,
		realSstAnomalyScale: params.realSstAnomalyScale,
		realSstAnomalyNoData: params.realSstAnomalyNoData,
		onProgress,
	})
	record("Post-elevation pipeline", t0)
	onProgress?.("import:post-pipeline", 70)

	if (post.climate.real_temperature_monthly) {
		t0 = performance.now()
		REAL_EARTH_DATA.attachObservedEarthHumidity({
			mesh,
			isLand,
			world: post,
		})
		record("Observed Earth humidity sampling", t0)

		t0 = performance.now()
		REAL_EARTH_DATA.attachCachedCloudCoverEstimate({ mesh, world: post })
		record("Observed Earth cloud cover cache", t0)
	}

	if (post.climate.real_temperature_monthly && post.rainfall.real_monthly) {
		t0 = performance.now()
		post.realKoppenClimate = KOPPEN.assignKoppenClimate({
			mesh,
			isLand,
			temperatureMonthly: post.climate.real_temperature_monthly,
			rainfallMonthly: post.rainfall.real_monthly,
		})
		record("Observed Earth koppen classification", t0)
	}

	t0 = performance.now()
	const provinceSociety = DERIVE_PROVINCE_SOCIETY.deriveProvinceSociety({
		mesh,
		params: genesisParams,
		post,
		isLand,
	})
	record("Imported province society", t0)
	onProgress?.("import:society", 77)

	if (params.lakeNames?.length) {
		t0 = performance.now()
		provinceSociety.landmarks.realNames = REAL_EARTH_DATA.matchRealLakeNames({
			mesh,
			landmarks: provinceSociety.landmarks,
			lakeLandmarkType: LANDMARKS.landmarkTypeLake,
			lakePolygons: params.lakeNames,
		})
		record("Real lake name matching", t0)
	}

	return {
		mesh,
		isEarthImport: true,
		plates,
		plateAssignment,
		boundary,
		distFields,
		elevation,
		elevation_km,
		eu5Topography,
		eu5Vegetation,
		eu5Climate,
		params: genesisParams,
		climate: post.climate,
		oceanDist,
		rainfall: post.rainfall,
		hazards: post.hazards,
		volcanism: {
			hotspot: new Float32Array(mesh.numRegions),
			mantleUpwelling: new Float32Array(mesh.numRegions),
		},
		climateZones: post.climateZones,
		realClimateZones: post.realClimateZones,
		pastaClimate: post.pastaClimate,
		pastaDebug: post.pastaDebug,
		koppenClimate: post.koppenClimate,
		realKoppenClimate: post.realKoppenClimate,
		realPastaClimate: post.realPastaClimate,
		realPastaDebug: post.realPastaDebug,
		vegetation: post.vegetation,
		realVegetation: post.realVegetation,
		topography: post.topography,
		coastal: post.coastal,
		waterAccess: post.waterAccess,
		riverAccess: post.riverAccess,
		lakeAccess: post.lakeAccess,
		slopeScore: post.slopeScore,
		dtr_annual: post.dtr_annual,
		dtr_monthly: post.dtr_monthly,
		observedCloudCover: post.observedCloudCover,
		observedHydrology: post.observedHydrology,
		observedDtr: post.observedDtr,
		observedHumidity: post.observedHumidity,
		observedWind: post.observedWind,
		observedCurrent: post.observedCurrent,
		iceThickness: post.iceThickness,
		iceMinMonthly: post.iceMinMonthly,
		iceMaxMonthly: post.iceMaxMonthly,
		hydrology: post.hydrology,
		rivers: post.rivers,
		isLand,
		riverLand: isLand,
		provinces: post.provinces,
		locations: post.locations,
		nations: provinceSociety.nations,
		cultures: provinceSociety.cultures,
		heritages: provinceSociety.heritages,
		religions: provinceSociety.religions,
		religionFamilies: provinceSociety.religionFamilies,
		religionTypes: provinceSociety.religionTypes,
		landmarks: provinceSociety.landmarks,
		population: post.population,
		tradeGoods: post.tradeGoods,
		settlementRegions: provinceSociety.settlementRegions,
		settlementWaterLandmarks: provinceSociety.settlementWaterLandmarks,
		settlementPortRegions: provinceSociety.settlementPortRegions,
		oceanCurrents: post.oceanCurrents,
		continentCount: STATS.countContinents({ mesh, isLand }),
		timings: [...timings, ...post.timings, ...provinceSociety.timings],
	}
}

export const IMPORT_HEIGHTMAP = {
	importGenesisWorld,
}
