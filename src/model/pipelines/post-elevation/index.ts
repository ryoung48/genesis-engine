import { MOON } from "@/model/celestial/moons"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import { STAR } from "@/model/celestial/star"
import type { MainSequenceClass } from "@/model/celestial/star/types"
import { CLIMATE } from "@/model/climate/climate"
import { CYCLONES } from "@/model/climate/cyclones"
import { DTR } from "@/model/climate/dtr"
import { HYDROLOGY } from "@/model/climate/hydrology"
import { ICE } from "@/model/climate/ice"
import { KOPPEN } from "@/model/climate/koppen"
import { OBSERVED_EARTH } from "@/model/climate/observed-earth"
import { OCEAN_CURRENTS } from "@/model/climate/ocean-currents"
import { PASTA } from "@/model/climate/pasta"
import type { PastaDebug } from "@/model/climate/pasta/types"
import { RAIN } from "@/model/climate/rain"
import { TIDAL_MAP } from "@/model/climate/tidal-map"
import { TIDAL_SCHEDULE } from "@/model/climate/tidal-schedule"
import { TIDES } from "@/model/climate/tides"
import { TORNADOES } from "@/model/climate/tornadoes"
import type { GenesisRainfall } from "@/model/climate/types"
import { VEGETATION } from "@/model/climate/vegetation"
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
import type {
	PostPipelineInput,
	PostPipelineOutput,
} from "@/model/pipelines/post-elevation/types"
import type { GenesisWorld, StageTiming } from "@/model/pipelines/types"
import { STATS } from "@/model/shared/math/stats"
import { RNG } from "@/model/shared/random/rng"
import { ERAS } from "@/model/society/eras"
import { TRADE_GOODS } from "@/model/society/infrastructure/trade/trade-goods"
import { POPULATION } from "@/model/society/population"
import type { ProvincePopulation } from "@/model/society/population/types"
import type { GenesisProvinces } from "@/model/society/types"

const LAKE_RETENTION_THRESHOLD = 100

function reconcileClosedWaterBodies(params: {
	isLand: Uint8Array
	riverLand: Uint8Array
	landmarks: Pick<GenesisLandmarks, "regionLandmark" | "type" | "count">
	rainfall: Pick<GenesisRainfall, "annual">
	protectedRegions?: Uint8Array
}): boolean {
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

	let changed = false
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
			changed = true
		}
	}

	return changed
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
		enableOceanCurrents,
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
	function record(stage: string, startMs: number) {
		timings.push({
			Stage: stage,
			ms: (performance.now() - startMs).toFixed(1),
		})
	}

	// ── Climate ────────────────────────────────────────────────────────
	let t0 = performance.now()
	const landFraction = CLIMATE.computeLandFraction({ mesh, isLand })
	let climate = CLIMATE.computeTemperature({
		mesh,
		elevation,
		landFraction,
		params,
		oceanDist,
		isLand,
		elevation_km,
	})
	record("Post: climate", t0)
	onProgress?.("Post: climate", 42)

	t0 = performance.now()
	const currentLandmarks = LANDMARKS.computeLandmarks({ mesh, isLand })
	record("Post: current landmarks", t0)

	const N = mesh.numRegions
	t0 = performance.now()
	const monthlyTEQ: Float32Array[] = new Array(12)
	for (let month = 0; month < 12; month++) {
		monthlyTEQ[month] = RAIN.computeThermalEquator({
			mesh,
			temps: climate.temperature_monthly.subarray(month * N, (month + 1) * N),
		})
	}
	record("Post: thermal equator", t0)
	onProgress?.("Post: thermal equator", 44)

	// ── Moisture advection ─────────────────────────────────────────────
	t0 = performance.now()
	const { east: eastAdv, west: westAdv } = RAIN.computeAdvection({
		mesh,
		elevation,
		distCoast,
		climate,
		params,
		isLand,
		elevation_km,
	})
	record("Post: moisture advection", t0)
	onProgress?.("Post: moisture advection", 50)

	// ── Ocean currents ─────────────────────────────────────────────────
	t0 = performance.now()
	const oceanCurrents = enableOceanCurrents
		? OCEAN_CURRENTS.computeOceanCurrents({
				mesh,
				isLand,
				distCoast,
				landmarks: currentLandmarks!,
				params,
				monthlyTEQ,
			})
		: undefined
	if (enableOceanCurrents) record("Post: ocean currents", t0)
	if (oceanCurrents) {
		t0 = performance.now()
		OCEAN_CURRENTS.applyCurrentTemperatureEffect({
			mesh,
			climate,
			isLand,
			currents: oceanCurrents,
			monthlyTEQ,
			params,
		})
		HYDROLOGY.refreshClimatePetMonthly({ climate, params })
		record("Post: current temperature effect", t0)
	}

	// ── Rainfall ───────────────────────────────────────────────────────
	t0 = performance.now()
	const rain = RAIN.computeMonthlyRain({
		mesh,
		climate,
		eastAdv,
		westAdv,
		isLand,
		params,
		monthlyTEQ,
		distCoast,
		landmarks: currentLandmarks,
	})
	record("Post: rainfall", t0)
	onProgress?.("Post: rainfall", 54)
	const rainfall: GenesisRainfall = {
		monthly: rain.monthly,
		annual: rain.annual,
		east: eastAdv,
		west: westAdv,
	}

	const drainedClosedWater = reconcileClosedWaterBodies({
		isLand,
		riverLand,
		landmarks: currentLandmarks,
		rainfall,
		protectedRegions: realLakeRegions,
	})
	if (drainedClosedWater) {
		t0 = performance.now()
		const updatedLandFraction = CLIMATE.computeLandFraction({ mesh, isLand })
		climate = CLIMATE.computeTemperature({
			mesh,
			elevation,
			landFraction: updatedLandFraction,
			params,
			oceanDist,
			isLand,
			elevation_km,
		})
		for (let month = 0; month < 12; month++) {
			monthlyTEQ[month] = RAIN.computeThermalEquator({
				mesh,
				temps: climate.temperature_monthly.subarray(month * N, (month + 1) * N),
			})
		}
		if (oceanCurrents) {
			OCEAN_CURRENTS.applyCurrentTemperatureEffect({
				mesh,
				climate,
				isLand,
				currents: oceanCurrents,
				monthlyTEQ,
				params,
			})
			HYDROLOGY.refreshClimatePetMonthly({ climate, params })
		}
		record("Post: drain arid closed water", t0)
	}

	// ── Diurnal temperature range + PET ───────────────────────────────
	t0 = performance.now()
	let { monthly: dtr_monthly, annual: dtr_annual } = DTR.computeDiurnalRange({
		rainfall,
		elevationKm: elevation_km,
		oceanDist,
		isLand,
		params,
		daylight_hours_monthly: climate.daylight_hours_monthly,
	})
	HYDROLOGY.fillPetMonthlyHargreaves({
		temperatureMonthly: climate.temperature_monthly,
		rangeMonthly: dtr_monthly,
		insolationMonthly: climate.insolation_monthly,
		petMonthly: climate.pet_monthly,
		dpm: params.daysPerYear / 12,
	})
	CLIMATE.applyDtrToClimateMinMax({ climate, dtr_monthly, N })
	record("Post: dtr + pet", t0)
	onProgress?.("Post: dtr + pet", 56)

	t0 = performance.now()
	const hydrology = HYDROLOGY.computeHydrologyFields({
		climate,
		rainfall,
		isLand: riverLand,
	})
	record("Post: hydrology", t0)
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
		record("Post: rivers (real)", t0)
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
		record("Post: rivers", t0)

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
		record("Post: lakes", t0)
	}
	onProgress?.("Post: rivers", 62)

	// ── Landmarks + distances + temperature (post-lake) ────────────────
	// Lakes are now final — recompute landmarks so ocean vs lake cells are
	// correctly classified, then update coast/ocean distances and re-run
	// temperature so continentality reflects the finalized water geometry.
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
	climate = CLIMATE.computeTemperature({
		mesh,
		elevation,
		landFraction,
		params,
		oceanDist,
		isLand,
		elevation_km,
	})
	for (let month = 0; month < 12; month++) {
		monthlyTEQ[month] = RAIN.computeThermalEquator({
			mesh,
			temps: climate.temperature_monthly.subarray(month * N, (month + 1) * N),
		})
	}
	if (oceanCurrents) {
		OCEAN_CURRENTS.applyCurrentTemperatureEffect({
			mesh,
			climate,
			isLand,
			currents: oceanCurrents,
			monthlyTEQ,
			params,
		})
		HYDROLOGY.refreshClimatePetMonthly({ climate, params })
	}
	;({ monthly: dtr_monthly, annual: dtr_annual } = DTR.computeDiurnalRange({
		rainfall,
		elevationKm: elevation_km,
		oceanDist,
		isLand,
		params,
		daylight_hours_monthly: climate.daylight_hours_monthly,
	}))
	HYDROLOGY.fillPetMonthlyHargreaves({
		temperatureMonthly: climate.temperature_monthly,
		rangeMonthly: dtr_monthly,
		insolationMonthly: climate.insolation_monthly,
		petMonthly: climate.pet_monthly,
		dpm: params.daysPerYear / 12,
	})
	CLIMATE.applyDtrToClimateMinMax({ climate, dtr_monthly, N })
	record("Post: landmarks + distances + temperature (post-lake)", t0)
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
	record("Post: observed Earth climate", t0)
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
	record("Post: ice", t0)
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
	record("Post: pasta climate", t0)
	onProgress?.("Post: pasta climate", 59)

	// ── Vegetation ─────────────────────────────────────────────────────
	t0 = performance.now()
	// Compute GAr (growing-season aridity ratio) per cell for cold/extraseasonal forest transition
	const garField = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		let petGdd = 0
		let aetGdd = 0
		for (let m = 0; m < 12; m++) {
			const idx = m * N + r
			const temp = climate.temperature_monthly[idx]
			const g5 =
				temp > 5 ? Math.min(temp - 5, 20) * (params.daysPerYear / 12) : 0
			petGdd += climate.pet_monthly[idx] * g5
			aetGdd += hydrology.aet_monthly[idx] * g5
		}
		garField[r] = petGdd > 0 ? aetGdd / petGdd : 1
	}
	const vegetation = VEGETATION.assignVegetation({
		mesh,
		isLand,
		climate,
		rainfall,
		rng: RNG.makeRng(params.seed),
		pastaZones: pastaClimate,
		gdd: pastaDebug.gdd,
		gar: garField,
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
				gar: garField,
			})
		: undefined
	record("Post: vegetation", t0)
	onProgress?.("Post: vegetation", 60)

	// ── Tidal range ────────────────────────────────────────────────────
	// Computed before topography so the tidal bonus can nudge coastal marsh
	// formation in classifyTopography.
	t0 = performance.now()
	const coastalMask = TIDES.computeCoastalMask({ mesh, isLand })
	const cls = STAR.isValidSpectralClass(params.spectralClass)
		? (params.spectralClass as MainSequenceClass)
		: STAR.defaultSpectralClass
	const starMassKg =
		STAR.getStarMassSol({ cls, subtype: params.starSubtype ?? 5 }) *
		ORBIT_BODY.solarMassKg
	const tidalSchedule = TIDAL_SCHEDULE.computeTidalSchedule({
		moons: MOON.generateMoons({
			count: 1,
			seed: params.seed + 8831,
			planetRadiusKm: params.planetRadiusKm,
			orbitalDistanceAU: params.orbitalDistanceAU,
			starMassKg,
		}),
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
	record("Post: tidal range", t0)

	// ── Topography ─────────────────────────────────────────────────────
	t0 = performance.now()
	const { topography, coastal, oceanCoastal, lakeCoastal, slopeScore } =
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
		})
	record("Post: topography", t0)
	onProgress?.("Post: topography", 65)

	// Demote sea-adjacent regions from ocean to lake coastal tier.
	// A region only touching seas (not true oceans) gets the lake hab bonus (1.5Ã—)
	// instead of the ocean bonus (2.0Ã—).
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
	record("Post: climate zones", t0)
	onProgress?.("Post: climate zones", 64)

	// ── Koppen climate ─────────────────────────────────────────────────
	t0 = performance.now()
	const koppenClimate = KOPPEN.assignKoppenClimate({
		mesh,
		isLand,
		temperatureMonthly: climate.temperature_monthly,
		rainfallMonthly: rainfall.monthly,
	})
	record("Post: koppen climate", t0)
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
	record("Post: hazards", t0)
	onProgress?.("Post: hazards", 70)

	t0 = performance.now()
	const cycloneRisk = CYCLONES.computeCycloneRisk({
		mesh,
		climate,
		isLand,
		topography,
		params,
		oceanCurrents,
	})
	record("Post: cyclones", t0)

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
		params,
	})
	record("Post: tornadoes", t0)

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
	record("Post: provinces", t0)
	onProgress?.("Post: provinces", 72)

	const { waterAccess, riverAccess, lakeAccess } = provinces

	t0 = performance.now()
	const locations: GenesisLocations = LOCATIONS.computeLocations({
		provinces,
		mesh,
		seed: params.seed,
		options: { planetRadiusKm: params.planetRadiusKm },
	})
	record("Post: locations", t0)
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
	const migration = POPULATION.computeMigration({
		provinces,
		habitability: rawHabitability,
		mesh,
		planetRadiusKm: params.planetRadiusKm,
		numRegions: N,
	})
	// Mark provinces unreachable from any cradle as desolate so they are
	// excluded from the population pass.
	for (let p = 0; p < provinces.count; p++) {
		if (migration.migrationWave[p] < 0) provinces.desolate[p] = 1
	}
	record("Post: migration", t0)
	onProgress?.("Post: migration", 74)

	// ── Population ─────────────────────────────────────────────────────
	t0 = performance.now()
	const eraConfig = ERAS.getEraConfig(params.era)

	// Percentile-based wave thresholds computed here where migrationWave is
	// guaranteed. Both are passed through to derive-province-society.
	const actualSettlementWave = ERAS.wavePercentileThreshold({
		migrationWave: migration.migrationWave,
		desolate: provinces.desolate,
		fraction: eraConfig.settlementFraction,
	})
	const statehoodOverallFraction =
		eraConfig.settlementFraction * eraConfig.statehoodFraction
	const actualStatehoodWave = ERAS.wavePercentileThreshold({
		migrationWave: migration.migrationWave,
		desolate: provinces.desolate,
		fraction: statehoodOverallFraction,
	})

	// Build per-province era masks using migration.migrationWave directly.
	// settledMask: provinces within the settlement percentile (get cultures/pop)
	// statehoodMask: provinces within the statehood percentile (get nations)
	let eraSettledMask: Uint8Array | undefined
	let eraStatehoodMask: Uint8Array | undefined
	if (provinces.count > 0 && eraConfig.settlementFraction < 1.0) {
		eraSettledMask = new Uint8Array(provinces.count)
		for (let p = 0; p < provinces.count; p++) {
			const w = migration.migrationWave[p]
			if (!provinces.desolate[p] && w >= 0 && w <= actualSettlementWave) {
				eraSettledMask[p] = 1
			}
		}
	}
	if (
		provinces.count > 0 &&
		eraConfig.hasNations &&
		statehoodOverallFraction < 1.0
	) {
		eraStatehoodMask = new Uint8Array(provinces.count)
		for (let p = 0; p < provinces.count; p++) {
			const w = migration.migrationWave[p]
			if (!provinces.desolate[p] && w >= 0 && w <= actualStatehoodWave) {
				eraStatehoodMask[p] = 1
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
		planetRadiusKm: params.planetRadiusKm,
		numRegions: N,
		eraTargetPopulation: eraConfig.targetPopulation,
		migrationWave: migration.migrationWave,
		settlementWave: actualSettlementWave,
		migrationFalloff: eraConfig.migrationFalloff,
	})
	population.migrationWave = migration.migrationWave
	population.cradleProvinces = migration.cradleProvinces
	record("Post: population", t0)
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
	record("Post: trade goods", t0)
	onProgress?.("Post: trade goods", 75)

	return {
		climate,
		observedCloudCover,
		rainfall,
		monthlyTEQ,
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
		tradeGoods,
		hazards,
		cycloneRisk,
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
