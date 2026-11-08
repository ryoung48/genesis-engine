import { CLIMATE } from "@/model/climate/classification/climate"
import { HYDROLOGY } from "@/model/climate/classification/hydrology"
import { ICE } from "@/model/climate/classification/ice"
import { KOPPEN } from "@/model/climate/classification/koppen"
import { PASTA } from "@/model/climate/classification/pasta"
import type { PastaDebug } from "@/model/climate/classification/pasta/types"
import { VEGETATION } from "@/model/climate/classification/vegetation"
import { OBSERVED_EARTH } from "@/model/climate/observed-earth"
import { COASTAL_MASK } from "@/model/climate/ocean/tides/coastal-mask"
import { TIDAL_MAP } from "@/model/climate/ocean/tides/tidal-map"
import { TIDAL_SCHEDULE } from "@/model/climate/ocean/tides/tidal-schedule"
import { CALENDAR } from "@/model/climate/shared/calendar"
import type { GenesisRainfall } from "@/model/climate/types"
import { CYCLONES } from "@/model/climate/weather/cyclones"
import { TORNADOES } from "@/model/climate/weather/tornadoes"
import { CLIMATE_V2 } from "@/model/climatev2"
import { CLASSIFICATION } from "@/model/geography/terrain/classification"
import { HAZARDS } from "@/model/geography/terrain/hazards"
import { LAKES } from "@/model/geography/terrain/lakes"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import type { GenesisLandmarks } from "@/model/geography/terrain/landmarks/types"
import { LOCATIONS } from "@/model/geography/terrain/locations"
import type { GenesisLocations } from "@/model/geography/terrain/locations/types"
import { PROVINCES } from "@/model/geography/terrain/provinces"
import { RIVERS } from "@/model/geography/terrain/rivers"
import type { GenesisRivers } from "@/model/geography/terrain/rivers/types"
import { STATE_CLOCK } from "@/model/history/sim/engine/state/clock"
import { PLACEMENT } from "@/model/history/sim/nations/placement"
import { TARGET_PROFILE } from "@/model/history/sim/targets"
import type {
	PostPipelineInput,
	PostPipelineOutput,
} from "@/model/pipelines/post-elevation/types"
import type { GenesisWorld } from "@/model/pipelines/types"
import { STATS } from "@/model/shared/math/stats"
import { RNG } from "@/model/shared/random/rng"
import { TIMING } from "@/model/shared/timing"
import type { StageTiming } from "@/model/shared/timing/types"
import { UNITS } from "@/model/shared/units"
import { ERAS } from "@/model/society/eras"
import { TRADE_GOODS } from "@/model/society/infrastructure/trade/trade-goods"
import { MIGRATION } from "@/model/society/migration"
import type { HistoryMigration } from "@/model/society/migration/types"
import { POPULATION } from "@/model/society/population"
import type { ProvincePopulation } from "@/model/society/population/types"
import type { GenesisProvinces } from "@/model/society/types"

const LAKE_RETENTION_THRESHOLD = 100

const MIGRATION_HORIZON_YEAR = 2025

function reconcileClosedWaterBodies(params: {
	isLand: Uint8Array
	riverLand: Uint8Array
	landmarks: Pick<GenesisLandmarks, "regionLandmark" | "type" | "count">
	rainfall: Pick<GenesisRainfall, "annual">
	protectedRegions?: Uint8Array
}): void {
	const { isLand, riverLand, landmarks, rainfall, protectedRegions } = params
	const rainfallSum = new Float32Array(landmarks.count)
	const rainfallCount = new Int32Array(landmarks.count)

	for (let r = 0; r < isLand.length; r++) {
		if (isLand[r]) continue
		const landmarkId = landmarks.regionLandmark[r]
		if (
			landmarkId < 0 ||
			landmarks.type[landmarkId] !== LANDMARKS.landmarkTypeLake
		)
			continue
		rainfallSum[landmarkId] += rainfall.annual[r]
		rainfallCount[landmarkId]++
	}

	for (let r = 0; r < isLand.length; r++) {
		if (isLand[r]) continue
		if (protectedRegions?.[r]) continue
		const landmarkId = landmarks.regionLandmark[r]
		if (
			landmarkId < 0 ||
			landmarks.type[landmarkId] !== LANDMARKS.landmarkTypeLake
		)
			continue

		const avgRain =
			rainfallCount[landmarkId] > 0
				? rainfallSum[landmarkId] / rainfallCount[landmarkId]
				: 0
		if (avgRain < LAKE_RETENTION_THRESHOLD) {
			isLand[r] = 1
			riverLand[r] = 1
		}
	}
}

function runPostElevationPipeline(
	input: PostPipelineInput,
): PostPipelineOutput {
	const {
		mesh,
		elevation,
		elevation_km,
		isLand,
		riverLand,
		distCoast,
		oceanDist,
		params,
		emergedLand,
		boundary,
		distFields,
		r_hotspot,
		onProgress,
		realLakeRegions,
		realRivers,
		realProvinceSeeds,
		eu4ProvinceIds,
		eu4ProvinceFallbackSeeds,
		realClimateMonthly,
		realClimateWidth,
		realClimateHeight,
		realClimateMonths,
		realClimateScale,
		realClimateNoData,
		realPrecipMonthly,
		realPrecipWidth,
		realPrecipHeight,
		realPrecipMonths,
		realPrecipScale,
		realPrecipNoData,
		realCloudCoverMonthly,
		realCloudCoverWidth,
		realCloudCoverHeight,
		realCloudCoverMonths,
		realCloudCoverScale,
		realCloudCoverNoData,
		realDtrMonthly,
		realDtrWidth,
		realDtrHeight,
		realDtrMonths,
		realDtrScale,
		realDtrNoData,
		realWindUMonthly,
		realWindVMonthly,
		realWindWidth,
		realWindHeight,
		realWindMonths,
		realWindScale,
		realWindNoData,
		realCurrentUMonthly,
		realCurrentVMonthly,
		realCurrentWidth,
		realCurrentHeight,
		realCurrentMonths,
		realCurrentScale,
		realCurrentNoData,
		realSstAnomalyMonthly,
		realSstAnomalyWidth,
		realSstAnomalyHeight,
		realSstAnomalyMonths,
		realSstAnomalyScale,
		realSstAnomalyNoData,
	} = input
	const timings: StageTiming[] = []
	// ── Climate ────────────────────────────────────────────────────────
	let t0 = performance.now()
	const isLocked = params.tideLock?.type === "solar"
	const climateV2 = isLocked
		? CLIMATE_V2.computeLocked({
				mesh,
				elevationKm: elevation_km,
				isLand,
				params,
			})
		: CLIMATE_V2.computeForWorld({
				mesh,
				elevationKm: elevation_km,
				isLand,
				params,
			})
	const climate = CLIMATE_V2.toClimate({ mesh, params, v2: climateV2 })
	TIMING.record({ stage: "Post: climate", startedAt: t0, timings })
	onProgress?.("Post: climate", 42)

	const wind = climateV2.wind
	onProgress?.("Post: wind", 43)

	t0 = performance.now()
	const currentLandmarks = LANDMARKS.computeLandmarks({ mesh, isLand })
	TIMING.record({ stage: "Post: current landmarks", startedAt: t0, timings })

	const N = mesh.numRegions
	t0 = performance.now()
	const circulation = "circulation" in climateV2 ? climateV2.circulation : null
	onProgress?.("Post: circulation", 44)

	const slopeScore = CLASSIFICATION.computeSlopeScore({
		mesh,
		elevationKm: elevation_km,
		planetRadiusKm: params.planetRadiusKm,
	})

	// ── Ocean SST ────────────────────────────────────────────────────────
	t0 = performance.now()
	let observedWind: GenesisWorld["observedWind"] | undefined
	if (
		realWindUMonthly &&
		realWindVMonthly &&
		realWindWidth &&
		realWindHeight &&
		realWindMonths &&
		realWindScale !== undefined &&
		realWindNoData !== undefined
	) {
		const windHolder: { observedWind?: GenesisWorld["observedWind"] } = {}
		OBSERVED_EARTH.attachObservedEarthWind({
			mesh,
			world: windHolder,
			realWindUMonthly,
			realWindVMonthly,
			realWindWidth,
			realWindHeight,
			realWindMonths,
			realWindScale,
			realWindNoData,
		})
		observedWind = windHolder.observedWind
	}
	const oceanCurrents = climateV2.oceanCurrents
	if ("petMonthly" in climateV2) climate.pet_monthly.set(climateV2.petMonthly)
	else HYDROLOGY.refreshClimatePetMonthly({ climate, params })
	TIMING.record({ stage: "Post: ocean SST", startedAt: t0, timings })

	// ── Rainfall ───────────────────────────────────────────────────────
	t0 = performance.now()
	onProgress?.("Post: rainfall", 54)
	const rainfall: GenesisRainfall = {
		monthly: climateV2.rainfallMonthly,
		annual: climateV2.rainfallAnnual,
	}

	reconcileClosedWaterBodies({
		isLand,
		riverLand,
		landmarks: currentLandmarks,
		rainfall,
		protectedRegions: realLakeRegions,
	})

	// ── Diurnal temperature range + PET ───────────────────────────────
	t0 = performance.now()
	const { monthly: dtr_monthly, annual: dtr_annual } = climateV2.diurnalRange
	if (!isLocked)
		HYDROLOGY.fillPetMonthlyHargreaves({
			temperatureMonthly: climate.temperature_monthly,
			rangeMonthly: dtr_monthly,
			insolationMonthly: climate.insolation_monthly,
			petMonthly: climate.pet_monthly,
			dpm: CALENDAR.earthDaysPerMonth(params),
		})
	CLIMATE.applyDtrToClimateMinMax({ climate, dtr_monthly, N })
	TIMING.record({ stage: "Post: dtr + pet", startedAt: t0, timings })
	onProgress?.("Post: dtr + pet", 56)

	t0 = performance.now()
	let hydrology = HYDROLOGY.computeHydrologyFields({
		climate,
		rainfall,
		isLand: riverLand,
	})
	TIMING.record({ stage: "Post: hydrology", startedAt: t0, timings })
	onProgress?.("Post: hydrology", 57)

	// ── Rivers ─────────────────────────────────────────────────────────
	// Real river/lake data (Earth import) replaces the whole procedural
	// flow-accumulation + lake-flooding simulation: real lake cells are
	// already reflected in `isLand` by import-heightmap.ts, and the
	// `rivers` object is built directly from real polylines rather than
	// simulated. Fields that only make sense for a simulated discharge
	// (flow, flow_monthly, basinId, terminal*) stay zero-filled.
	t0 = performance.now()
	let rivers: GenesisRivers
	if (realRivers) {
		rivers = {
			lines: realRivers.lines,
			maxFlow: realRivers.maxFlow,
			minFlow: realRivers.minFlow,
			flow: new Float32Array(N),
			flow_monthly: new Float32Array(12 * N),
			visible: realRivers.visible,
			riverId: realRivers.riverId,
			riverLengthKm: realRivers.riverLengthKm,
			riverNames: realRivers.riverNames,
			terminal: new Uint8Array(N),
			terminalCoastal: new Uint8Array(N),
			terminalInterior: new Uint8Array(N),
			basinId: new Int32Array(N).fill(-1),
			waterLevel: new Float32Array(N),
		}
		if (realLakeRegions) {
			for (let r = 0; r < N; r++) {
				if (realLakeRegions[r]) rivers.waterLevel[r] = elevation_km[r]
			}
		}
		TIMING.record({ stage: "Post: rivers (real)", startedAt: t0, timings })
	} else {
		rivers = RIVERS.computeRivers({
			mesh,
			elevation,
			rainfall,
			climate,
			hydrology,
			isLand: riverLand,
			params,
		})
		TIMING.record({ stage: "Post: rivers", startedAt: t0, timings })

		t0 = performance.now()
		LAKES.computeLakes({
			mesh,
			elevation,
			rainfall,
			waterLevel: rivers.waterLevel,
			basinId: rivers.basinId,
			isLand,
			emergedLand,
			elevationKm: elevation_km,
		})
		TIMING.record({ stage: "Post: lakes", startedAt: t0, timings })
	}
	onProgress?.("Post: rivers", 62)

	// ── Landmarks + distances + temperature (post-lake) ────────────────
	// Lakes are now final — recompute landmarks so ocean vs lake cells are
	// correctly classified, then update coast/ocean distances.
	// Temperature remains the v2 solution from the original terrain.
	// Ice, pasta climate, and vegetation run below on the corrected climate.
	t0 = performance.now()
	const landmarks = LANDMARKS.computeLandmarks({ mesh, isLand })
	distCoast.set(
		STATS.computeCoastDistances({
			mesh,
			isLand,
			planetRadiusKm: params.planetRadiusKm,
		}).distCoast,
	)
	oceanDist.set(
		STATS.computeOceanDistanceBFS({
			mesh,
			isLand,
			planetRadiusKm: params.planetRadiusKm,
		}),
	)
	if (!isLocked)
		HYDROLOGY.fillPetMonthlyHargreaves({
			temperatureMonthly: climate.temperature_monthly,
			rangeMonthly: dtr_monthly,
			insolationMonthly: climate.insolation_monthly,
			petMonthly: climate.pet_monthly,
			dpm: CALENDAR.earthDaysPerMonth(params),
		})
	CLIMATE.applyDtrToClimateMinMax({ climate, dtr_monthly, N })
	hydrology = HYDROLOGY.computeHydrologyFields({
		climate,
		rainfall,
		isLand: riverLand,
	})
	TIMING.record({
		stage: "Post: landmarks + distances + temperature (post-lake)",
		startedAt: t0,
		timings,
	})
	onProgress?.("Post: landmarks", 62)

	// ── Observed Earth climate (must run before pasta/vegetation so Earth
	// imports classify vegetation from observed rather than procedural
	// climate) ───────────────────────────────────────────────────────────
	t0 = performance.now()
	let observedDtr: GenesisWorld["observedDtr"] | undefined
	if (
		realClimateMonthly &&
		realClimateWidth &&
		realClimateHeight &&
		realClimateMonths &&
		realClimateScale !== undefined &&
		realClimateNoData !== undefined
	) {
		OBSERVED_EARTH.attachObservedEarthClimate({
			mesh,
			climate,
			realClimateMonthly,
			realClimateWidth,
			realClimateHeight,
			realClimateMonths,
			realClimateScale,
			realClimateNoData,
		})
	}
	if (
		realPrecipMonthly &&
		realPrecipWidth &&
		realPrecipHeight &&
		realPrecipMonths &&
		realPrecipScale !== undefined &&
		realPrecipNoData !== undefined
	) {
		OBSERVED_EARTH.attachObservedEarthRainfall({
			mesh,
			rainfall,
			realPrecipMonthly,
			realPrecipWidth,
			realPrecipHeight,
			realPrecipMonths,
			realPrecipScale,
			realPrecipNoData,
		})
	}
	let observedCloudCover: GenesisWorld["observedCloudCover"] | undefined
	if (
		realCloudCoverMonthly &&
		realCloudCoverWidth &&
		realCloudCoverHeight &&
		realCloudCoverMonths &&
		realCloudCoverScale !== undefined &&
		realCloudCoverNoData !== undefined
	) {
		const cloudCoverHolder: {
			observedCloudCover?: GenesisWorld["observedCloudCover"]
		} = {}
		OBSERVED_EARTH.attachObservedEarthCloudCover({
			mesh,
			world: cloudCoverHolder,
			realCloudCoverMonthly,
			realCloudCoverWidth,
			realCloudCoverHeight,
			realCloudCoverMonths,
			realCloudCoverScale,
			realCloudCoverNoData,
		})
		observedCloudCover = cloudCoverHolder.observedCloudCover
	}
	if (
		realDtrMonthly &&
		realDtrWidth &&
		realDtrHeight &&
		realDtrMonths &&
		realDtrScale !== undefined &&
		realDtrNoData !== undefined
	) {
		const dtrHolder = { dtr_monthly, observedDtr }
		OBSERVED_EARTH.attachObservedEarthDtr({
			mesh,
			world: dtrHolder,
			realDtrMonthly,
			realDtrWidth,
			realDtrHeight,
			realDtrMonths,
			realDtrScale,
			realDtrNoData,
		})
		observedDtr = dtrHolder.observedDtr
	}
	let observedCurrent: GenesisWorld["observedCurrent"] | undefined
	if (
		realCurrentUMonthly &&
		realCurrentVMonthly &&
		realCurrentWidth &&
		realCurrentHeight &&
		realCurrentMonths &&
		realCurrentScale !== undefined &&
		realCurrentNoData !== undefined &&
		realSstAnomalyMonthly &&
		realSstAnomalyWidth &&
		realSstAnomalyHeight &&
		realSstAnomalyMonths &&
		realSstAnomalyScale !== undefined &&
		realSstAnomalyNoData !== undefined
	) {
		const currentHolder: { observedCurrent?: GenesisWorld["observedCurrent"] } =
			{}
		OBSERVED_EARTH.attachObservedEarthCurrent({
			mesh,
			world: currentHolder,
			realCurrentUMonthly,
			realCurrentVMonthly,
			realCurrentWidth,
			realCurrentHeight,
			realCurrentMonths,
			realCurrentScale,
			realCurrentNoData,
			realSstAnomalyMonthly,
			realSstAnomalyWidth,
			realSstAnomalyHeight,
			realSstAnomalyMonths,
			realSstAnomalyScale,
			realSstAnomalyNoData,
		})
		observedCurrent = currentHolder.observedCurrent
	}
	TIMING.record({
		stage: "Post: observed Earth climate",
		startedAt: t0,
		timings,
	})
	onProgress?.("Post: observed Earth climate", 57)

	// ── Ice (needed for pasta climate) ─────────────────────────────────
	t0 = performance.now()
	const { iceThickness, iceMinMonthly, iceMaxMonthly } =
		ICE.computeIceAccumulation({
			mesh,
			climate,
			rainfall,
			isLand,
			distCoast,
			cycles: 15,
			planetRadiusKm: params.planetRadiusKm,
		})
	TIMING.record({ stage: "Post: ice", startedAt: t0, timings })
	onProgress?.("Post: ice", 58)

	// ── Pasta climate (needed before vegetation) ───────────────────────
	t0 = performance.now()
	const pastaResult = PASTA.assignPastaClimate({
		mesh,
		isLand,
		climate,
		rainfall,
		hydrology,
		params,
		iceThickness,
		iceMinMonthly,
		iceMaxMonthly,
	})
	const pastaClimate: Uint8Array = pastaResult.zones
	const pastaDebug: PastaDebug = pastaResult.debug

	// Earth imports classify vegetation from observed climate, not the
	// procedural EBM output, when real temperature/rainfall are attached.
	const earthPastaResult =
		climate.real_temperature_monthly && rainfall.real_monthly
			? PASTA.assignEarthPastaClimate({
					mesh,
					isLand,
					climate,
					rainfall,
					params,
					realDtrMonthly: observedDtr?.real_monthly,
					iceThickness,
					iceMinMonthly,
					iceMaxMonthly,
				})
			: undefined
	const realPastaClimate: Uint8Array | undefined = earthPastaResult?.zones
	const realPastaDebug: PastaDebug | undefined = earthPastaResult?.debug
	TIMING.record({ stage: "Post: pasta climate", startedAt: t0, timings })
	onProgress?.("Post: pasta climate", 59)

	// ── Vegetation ─────────────────────────────────────────────────────
	t0 = performance.now()
	const vegetation = VEGETATION.assignVegetation({
		mesh,
		isLand,
		climate,
		rainfall,
		rng: RNG.makeRng(params.seed),
		pastaZones: pastaClimate,
		gdd: pastaDebug.gdd,
		gar: pastaDebug.gar,
	})
	const realVegetation = earthPastaResult
		? VEGETATION.assignVegetation({
				mesh,
				isLand,
				climate,
				rainfall,
				rng: RNG.makeRng(params.seed),
				pastaZones: earthPastaResult.zones,
				gdd: earthPastaResult.debug.gdd,
				gar: earthPastaResult.debug.gar,
			})
		: undefined
	TIMING.record({ stage: "Post: vegetation", startedAt: t0, timings })
	onProgress?.("Post: vegetation", 60)

	// ── Tidal range ────────────────────────────────────────────────────
	// Computed before topography so the tidal bonus can nudge coastal marsh
	// formation in classifyTopography.
	t0 = performance.now()
	const coastalMask = COASTAL_MASK.computeCoastalMask({ mesh, isLand })
	const tidalSchedule = TIDAL_SCHEDULE.computeTidalSchedule({
		moons: params.moons,
		params,
	})
	const tidalRange = TIDAL_MAP.computeSpringTideMap({
		mesh,
		isLand,
		isCoastal: coastalMask,
		schedule: tidalSchedule,
		params,
		landmarks,
	})
	TIMING.record({ stage: "Post: tidal range", startedAt: t0, timings })

	// ── Topography ─────────────────────────────────────────────────────
	t0 = performance.now()
	const { topography, coastal, oceanCoastal, lakeCoastal } =
		CLASSIFICATION.classifyTopography({
			mesh,
			elevationKm: elevation_km,
			isLand,
			rivers,
			landmarks,
			vegetation,
			planetRadiusKm: params.planetRadiusKm,
			seed: params.seed,
			tidalRange,
			slopeScore,
		})
	TIMING.record({ stage: "Post: topography", startedAt: t0, timings })
	onProgress?.("Post: topography", 65)

	// Demote sea-adjacent regions from ocean to lake coastal tier.
	// A region only touching seas (not true oceans) gets the lake hab bonus (1.5×)
	// instead of the ocean bonus (2.0×).
	for (let r = 0; r < mesh.numRegions; r++) {
		if (!oceanCoastal[r]) continue
		let touchesOcean = false
		for (let j = mesh.adjOffset[r], end = mesh.adjOffset[r + 1]; j < end; j++) {
			const nb = mesh.adjList[j]
			if (isLand[nb]) continue
			if (
				landmarks.type[landmarks.regionLandmark[nb]] ===
				LANDMARKS.landmarkTypeOcean
			) {
				touchesOcean = true
				break
			}
		}
		if (!touchesOcean) {
			oceanCoastal[r] = 0
			lakeCoastal[r] = 1
		}
	}

	// ── Climate zones ──────────────────────────────────────────────────
	t0 = performance.now()
	const climateZones = VEGETATION.assignClimateZones({
		mesh,
		isLand,
		temperatureAvg: climate.temperature_avg,
		temperatureMin: climate.temperature_min,
		temperatureMax: climate.temperature_max,
	})
	const realClimateZones = VEGETATION.assignEarthClimateZones({
		mesh,
		isLand,
		climate,
	})
	TIMING.record({ stage: "Post: climate zones", startedAt: t0, timings })
	onProgress?.("Post: climate zones", 64)

	// ── Koppen climate ─────────────────────────────────────────────────
	t0 = performance.now()
	const koppenClimate = KOPPEN.assignKoppenClimate({
		mesh,
		isLand,
		temperatureMonthly: climate.temperature_monthly,
		rainfallMonthly: rainfall.monthly,
	})
	TIMING.record({ stage: "Post: koppen climate", startedAt: t0, timings })
	onProgress?.("Post: koppen climate", 69)

	// ── Hazards ────────────────────────────────────────────────────────
	t0 = performance.now()
	const hazards = HAZARDS.computeHazards({
		mesh,
		boundary,
		distFields,
		elevationKm: elevation_km,
		isLand,
		hotspot: r_hotspot,
	})
	TIMING.record({ stage: "Post: hazards", startedAt: t0, timings })
	onProgress?.("Post: hazards", 70)

	t0 = performance.now()
	const cycloneRisk = CYCLONES.computeCycloneRisk({
		mesh,
		climate,
		isLand,
		topography,
		circulation,
		rainfallAnnual: rainfall.annual,
		params,
	})
	TIMING.record({ stage: "Post: cyclones", startedAt: t0, timings })

	t0 = performance.now()
	const tornadoRisk = TORNADOES.computeTornadoRisk({
		mesh,
		temperatureAvg: climate.temperature_avg,
		temperatureMax: climate.temperature_max,
		temperatureMin: climate.temperature_min,
		isLand,
		topography,
		vegetation,
		oceanDist,
		circulation,
	})
	TIMING.record({ stage: "Post: tornadoes", startedAt: t0, timings })

	// ── Provinces ──────────────────────────────────────────────────────
	t0 = performance.now()
	const provinceOptions = {
		climateZones,
		rainfall,
		oceanCoastal,
		lakeCoastal,
		riverVisible: rivers.visible,
		planetRadiusKm: params.planetRadiusKm,
	}
	const provinces: GenesisProvinces = eu4ProvinceIds
		? PROVINCES.computeProvincesFromRaster({
				mesh,
				isLand,
				regionIds: eu4ProvinceIds,
				seed: params.seed,
				options: provinceOptions,
				fallbackSeeds: eu4ProvinceFallbackSeeds,
			})
		: realProvinceSeeds && realProvinceSeeds.regions.length > 0
			? PROVINCES.computeWeightedProvinces({
					mesh,
					isLand,
					_topography: topography,
					seedRegions: realProvinceSeeds.regions,
					seedNames: realProvinceSeeds.names,
					seed: params.seed,
					options: provinceOptions,
					seedWeights: realProvinceSeeds.weights,
				})
			: PROVINCES.computeProvinces({
					mesh,
					isLand,
					topography,
					seed: params.seed,
					options: provinceOptions,
				})
	TIMING.record({ stage: "Post: provinces", startedAt: t0, timings })
	onProgress?.("Post: provinces", 72)

	const { waterAccess, riverAccess, lakeAccess } = provinces

	t0 = performance.now()
	const locations: GenesisLocations = LOCATIONS.computeLocations({
		provinces,
		mesh,
		seed: params.seed,
		options: { planetRadiusKm: params.planetRadiusKm },
	})
	TIMING.record({ stage: "Post: locations", startedAt: t0, timings })
	onProgress?.("Post: locations", 73)

	// ── Migration diffusion ─────────────────────────────────────────────
	// Migration runs before full population so that provinces unreachable
	// from any cradle can be marked desolate, which in turn zeroes their
	// population and habitability in the population pass below.
	t0 = performance.now()
	const rawHabitability = POPULATION.computeProvinceHabitability({
		provinces,
		_landmarks: landmarks,
		climateZones,
		vegetation,
		topography,
		oceanCoastal,
		lakeCoastal,
		riverVisible: rivers.visible,
		seed: params.seed,
	})
	const planetRadiusKm = params.planetRadiusKm ?? UNITS.defaultPlanetRadiusKm
	const migration = MIGRATION.compute({
		provinces,
		habitability: rawHabitability,
		mesh,
		isLand,
		elevationKm: elevation_km,
		planetRadiusKm,
		seed: params.seed,
		horizonYear: MIGRATION_HORIZON_YEAR,
	})
	provinces.areaKm2 = migration.areaKm2
	const historyMigration: HistoryMigration =
		params.historyPipeline === "distribution"
			? { pipeline: "distribution", data: migration }
			: { pipeline: "simulation" }
	const siteScore = Float32Array.from(
		{ length: provinces.count },
		(_, province) =>
			PLACEMENT.nationPlacementScore({
				province,
				habitability: rawHabitability,
				waterAccess: provinces.waterAccess,
				provinceContinent: undefined,
				target: 1,
			}),
	)
	const cradles =
		historyMigration.pipeline === "distribution"
			? null
			: MIGRATION.cradles({
					provinces,
					arrivalYear: migration.arrivalYear,
					siteScore,
					r_xyz: mesh.r_xyz,
					planetRadiusKm,
				})
	const migrationWave = migration.migrationWave
	TIMING.record({ stage: "Post: migration", startedAt: t0, timings })
	onProgress?.("Post: migration", 74)

	// ── Population ─────────────────────────────────────────────────────
	t0 = performance.now()
	const eraConfig = ERAS.getEraConfig(params.era)
	const startYear = STATE_CLOCK.defaultStartYear
	const arrivalSteered = eraConfig.id === "lateMedieval"

	let actualSettlementWave = 1
	let eraSettledMask: Uint8Array = new Uint8Array(provinces.count)
	let eraStatehoodMask: Uint8Array | undefined
	if (historyMigration.pipeline === "distribution") {
		eraSettledMask = Uint8Array.from(migration.arrivalYear, (year) =>
			year === MIGRATION.sentinel ? 0 : 1,
		)
		eraStatehoodMask = new Uint8Array(provinces.count)
	} else if (cradles) {
		// Settled land has people (cultures, population); state-held land is the
		// part of it that gets nations. The late medieval start reads both from the
		// arrival field and the target profile; other eras keep their wave
		// percentiles.
		actualSettlementWave = arrivalSteered
			? Math.fround(
					MIGRATION.waveOf({
						year: startYear,
						horizonYear: MIGRATION_HORIZON_YEAR,
					}),
				)
			: ERAS.wavePercentileThreshold({
					migrationWave,
					desolate: provinces.desolate,
					fraction: eraConfig.settlementFraction,
				})
		const actualStatehoodWave = ERAS.wavePercentileThreshold({
			migrationWave,
			desolate: provinces.desolate,
			fraction: eraConfig.settlementFraction * eraConfig.statehoodFraction,
		})
		// Cultures and religions cover every habitable province, so land settled
		// after the start (or never) already has them and a name.
		const settledAtStart = new Uint8Array(provinces.count)
		let habitableCount = 0
		let settledCount = 0
		for (let p = 0; p < provinces.count; p++) {
			if (provinces.desolate[p]) continue
			habitableCount++
			if (arrivalSteered) {
				eraSettledMask[p] = 1
				settledAtStart[p] = migration.arrivalYear[p] <= startYear ? 1 : 0
				settledCount += settledAtStart[p]
			} else if (
				migrationWave[p] >= 0 &&
				migrationWave[p] <= actualSettlementWave
			) {
				eraSettledMask[p] = 1
				settledAtStart[p] = 1
			}
		}
		if (eraConfig.hasNations && provinces.count > 0) {
			if (arrivalSteered) {
				const profile = TARGET_PROFILE.at({
					year: startYear,
					habitableProvinces: habitableCount,
				})
				eraStatehoodMask = MIGRATION.heldCore({
					provinces,
					suitability: migration.suitability,
					settled: settledAtStart,
					siteScore,
					heldWeight: Float32Array.from(migration.contactYear, (year, p) =>
						settledAtStart[p]
							? TARGET_PROFILE.contactShare({ years: startYear - year })
							: 0,
					),
					activeCradles: MIGRATION.activeCradles({ cradles, year: startYear }),
					fallbackSource: migration.origin,
					count: Math.round(profile.stateHeld * settledCount),
					r_xyz: mesh.r_xyz,
					planetRadiusKm,
				})
			} else {
				eraStatehoodMask = Uint8Array.from(settledAtStart)
				if (eraConfig.settlementFraction * eraConfig.statehoodFraction < 1.0)
					for (let p = 0; p < provinces.count; p++)
						if (migrationWave[p] > actualStatehoodWave) eraStatehoodMask[p] = 0
			}
		}
	}

	const population: ProvincePopulation = POPULATION.computePopulation({
		provinces,
		landmarks,
		climateZones,
		vegetation,
		topography,
		oceanCoastal,
		lakeCoastal,
		riverVisible: rivers.visible,
		seed: params.seed,
		mesh,
		planetRadiusKm: params.planetRadiusKm,
		eraTargetPopulation: eraConfig.targetPopulation,
		migrationWave,
		settlementWave: actualSettlementWave,
		migrationFalloff: eraConfig.migrationFalloff,
		settlementAgeYears:
			cradles && arrivalSteered
				? Float32Array.from(migration.arrivalYear, (year) =>
						Math.max(0, startYear - year),
					)
				: undefined,
	})
	population.migrationWave = migrationWave
	if (historyMigration.pipeline !== "distribution") {
		population.arrivalYear = migration.arrivalYear
		population.contactYear = migration.contactYear
		population.predecessor = migration.predecessor
		population.settlementOrder = migration.order
		population.cradles = cradles ?? undefined
		population.migrationDiagnostics = migration.diagnostics
	}
	TIMING.record({ stage: "Post: population", startedAt: t0, timings })
	onProgress?.("Post: population", 74)

	// ── Trade goods ─────────────────────────────────────────────────────
	t0 = performance.now()
	const tradeGoods = locations
		? TRADE_GOODS.computeTradeGoods({
				seed: params.seed,
				locations,
				provinces,
				climateZones,
				vegetation,
				topography,
				coastal,
				numRegions: N,
				pastaClimate,
			})
		: undefined
	TIMING.record({ stage: "Post: trade goods", startedAt: t0, timings })
	onProgress?.("Post: trade goods", 75)

	return {
		climate,
		wind,
		windMonthly: { u: climateV2.windUMonthly, v: climateV2.windVMonthly },
		observedCloudCover,
		rainfall,
		hydrology,
		vegetation,
		realVegetation,
		rivers,
		iceThickness,
		iceMinMonthly,
		iceMaxMonthly,
		topography,
		coastal,
		slopeScore,
		climateZones,
		realClimateZones,
		koppenClimate,
		pastaClimate,
		pastaDebug,
		realPastaDebug,
		realPastaClimate,
		dtr_annual,
		dtr_monthly,
		observedDtr,
		observedWind,
		observedCurrent,
		waterAccess,
		riverAccess,
		lakeAccess,
		provinces,
		locations,
		population,
		historyMigration,
		tradeGoods,
		hazards,
		cycloneRisk,
		circulationBelts: circulation?.belts ?? null,
		tornadoRisk,
		tidalRange,
		tidalSchedule,
		landmarks,
		oceanCurrents,
		timings,
		eraSettledMask,
		eraStatehoodMask,
	}
}

export const POST_ELEVATION = {
	runPostElevationPipeline,
}
