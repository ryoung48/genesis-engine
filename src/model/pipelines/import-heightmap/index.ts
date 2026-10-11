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
import type { GenesisParams, GenesisWorld } from "@/model/pipelines/types"
import { STATS } from "@/model/shared/math/stats"
import { RNG } from "@/model/shared/random/rng"
import { TIMING } from "@/model/shared/timing"
import type { StageTiming } from "@/model/shared/timing/types"
import { UNITS } from "@/model/shared/units"

function importGenesisWorld({
	params,
	onProgress,
}: ImportGenesisWorldParams): GenesisWorld {
	const timings: StageTiming[] = []
	const startedAt = performance.now()
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
	TIMING.record({
		stage: "Sphere mesh (Fibonacci + Delaunay + pole)",
		startedAt: t0,
		timings,
	})

	onProgress?.("import:heightmap", 10)
	t0 = performance.now()
	const elevation = SAMPLING.sampleHeightmap({
		mesh,
		grayscale: params.grayscale,
		imgW: params.imageWidth,
		imgH: params.imageHeight,
	})
	TIMING.record({ stage: "Heightmap sampling", startedAt: t0, timings })

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
		TIMING.record({
			stage: "Coastline mask reconciliation",
			startedAt: t0,
			timings,
		})
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
		TIMING.record({
			stage: `Terrain warp (strength=${params.terrainWarp.toFixed(2)})`,
			startedAt: t0,
			timings,
		})
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
		TIMING.record({
			stage: `Smoothing (${smoothIters} iters, str=${smoothStr.toFixed(2)})`,
			startedAt: t0,
			timings,
		})
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
		TIMING.record({
			stage: `Erosion composite (h=${hIters}, t=${tIters}, g=${gIters})`,
			startedAt: t0,
			timings,
		})
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
		TIMING.record({
			stage: `Ridge sharpening (${rsIters} iters)`,
			startedAt: t0,
			timings,
		})
	}

	t0 = performance.now()
	EROSION.applySoilCreep({
		mesh,
		elev: elevation,
		r_isOcean,
		iterations: 3,
		strength: 0.1125,
	})
	TIMING.record({ stage: "Soil creep (3 iters)", startedAt: t0, timings })
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
	TIMING.record({
		stage: "Synthetic plates + boundary",
		startedAt: t0,
		timings,
	})
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
	TIMING.record({ stage: "Ocean distance (BFS)", startedAt: t0, timings })
	onProgress?.("import:oceanDist", 28)

	// Build GenesisParams from ImportParams
	const genesisParams: GenesisParams = {
		seed: params.seed,
		tideLock: params.tideLock ?? null,
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
		TIMING.record({ stage: "Real river snapping", startedAt: t0, timings })
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
		TIMING.record({
			stage: "Real province seed resolution",
			startedAt: t0,
			timings,
		})
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
		TIMING.record({
			stage: "EU4 province raster sampling",
			startedAt: t0,
			timings,
		})
	}

	// Shared post-elevation pipeline (climate → population). Real climate
	// rasters are passed straight in so post-elevation can attach observed
	// Earth temperature/rainfall/DTR *before* it runs the Pasta climate
	// classification -- vegetation for Earth imports should key off observed
	// climate, not the procedural EBM output. See runPostElevationPipeline's
	// "Observed Earth climate" step.
	t0 = performance.now()
	const terrainMs = performance.now() - startedAt
	const terrainTiming = timings.splice(0)
	const environmentStart = performance.now()
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
	TIMING.record({ stage: "Post-elevation pipeline", startedAt: t0, timings })
	TIMING.attach({
		timings,
		stage: "Post-elevation pipeline",
		children: post.timings,
	})
	onProgress?.("import:post-pipeline", 70)

	if (post.climate.real_temperature_monthly) {
		t0 = performance.now()
		REAL_EARTH_DATA.attachObservedEarthHumidity({
			mesh,
			isLand,
			world: post,
		})
		TIMING.record({
			stage: "Observed Earth humidity sampling",
			startedAt: t0,
			timings,
		})

		t0 = performance.now()
		REAL_EARTH_DATA.attachCachedCloudCoverEstimate({ mesh, world: post })
		TIMING.record({
			stage: "Observed Earth cloud cover cache",
			startedAt: t0,
			timings,
		})
	}

	if (post.climate.real_temperature_monthly && post.rainfall.real_monthly) {
		t0 = performance.now()
		post.realKoppenClimate = KOPPEN.assignKoppenClimate({
			mesh,
			isLand,
			temperatureMonthly: post.climate.real_temperature_monthly,
			rainfallMonthly: post.rainfall.real_monthly,
		})
		TIMING.record({
			stage: "Observed Earth koppen classification",
			startedAt: t0,
			timings,
		})
	}

	const environmentMs = performance.now() - environmentStart
	const environmentTiming = timings.splice(0)
	t0 = performance.now()
	const societyStart = t0
	const provinceSociety = DERIVE_PROVINCE_SOCIETY.deriveProvinceSociety({
		isEarthImport: true,
		mesh,
		params: genesisParams,
		post,
		isLand,
	})
	TIMING.record({ stage: "Imported province society", startedAt: t0, timings })
	TIMING.attach({
		timings,
		stage: "Imported province society",
		children: provinceSociety.timings,
	})
	onProgress?.("import:society", 77)

	if (params.lakeNames?.length) {
		t0 = performance.now()
		provinceSociety.landmarks.realNames = REAL_EARTH_DATA.matchRealLakeNames({
			mesh,
			landmarks: provinceSociety.landmarks,
			lakeLandmarkType: LANDMARKS.landmarkTypeLake,
			lakePolygons: params.lakeNames,
		})
		TIMING.record({ stage: "Real lake name matching", startedAt: t0, timings })
	}

	const parts: StageTiming[] = []
	TIMING.append({
		stage: "Terrain",
		timings: parts,
		ms: terrainMs,
		children: terrainTiming,
	})
	TIMING.append({
		stage: "Environment",
		timings: parts,
		ms: environmentMs,
		children: environmentTiming,
	})
	TIMING.append({
		stage: "Society",
		timings: parts,
		ms: performance.now() - societyStart,
		children: timings.splice(0),
	})
	TIMING.append({
		stage: "Generation",
		timings,
		ms: performance.now() - startedAt,
		children: parts,
	})
	return {
		mesh,
		isEarthImport: true,
		routes: null,
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
		wind: post.wind,
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
		religionDoctrine: provinceSociety.religionDoctrine,
		landmarks: provinceSociety.landmarks,
		population: post.population,
		tradeGoods: post.tradeGoods,
		settlementRegions: provinceSociety.settlementRegions,
		settlementWaterLandmarks: provinceSociety.settlementWaterLandmarks,
		settlementPortRegions: provinceSociety.settlementPortRegions,
		oceanCurrents: post.oceanCurrents,
		continentCount: STATS.countContinents({ mesh, isLand }),
		timings,
	}
}

export const IMPORT_HEIGHTMAP = {
	importGenesisWorld,
}
