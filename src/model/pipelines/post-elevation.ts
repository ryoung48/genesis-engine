/**
 * Shared post-elevation pipeline: runs from climate computation through
 * population for both the tectonic generation path (generate-world.ts) and the
 * heightmap import path (import-heightmap.ts).
 */

import type {
	BoundaryInfo,
	DistanceFields,
	OrogenClimate,
	OrogenHazards,
	OrogenHydrology,
	OrogenLocations,
	OrogenOceanCurrents,
	OrogenParams,
	OrogenProvinces,
	OrogenRainfall,
	OrogenRivers,
	OrogenTerrainFeatures,
	SphereMesh,
	StageTiming,
} from ".."
import {
	applyDtrToClimateMinMax,
	computeLandFraction,
	computeTemperature,
} from "../climate/climate"
import { computeDiurnalRange } from "../climate/dtr"
import {
	computeHydrologyFields,
	fillPetMonthlyHargreaves,
	refreshClimatePetMonthly,
} from "../climate/hydrology"
import { computeIceAccumulation } from "../climate/ice"
import { assignKoppenClimate } from "../climate/koppen"
import {
	applyCurrentTemperatureEffect,
	computeOceanCurrents,
} from "../climate/ocean-currents"
import type { PastaDebug } from "../climate/pasta"
import { assignPastaClimate } from "../climate/pasta"
import {
	computeAdvection,
	computeMonthlyRain,
	computeThermalEquator,
} from "../climate/rain"
import { assignClimateZones, assignVegetation } from "../climate/vegetation"
import {
	computeTradeGoods,
	type LocationTradeGoods,
} from "../economy/trade-goods"
import { makeRng } from "../shared/rng"
import { getEraConfig, wavePercentileThreshold } from "../society/eras"
import type { ProvincePopulation } from "../society/population"
import {
	computeMigration,
	computePopulation,
	computeProvinceHabitability,
} from "../society/population"
import { computeProvinceWaterAccess } from "../society/water-access"
import { classifyTopography } from "../terrain/classification"
import { computeHazards } from "../terrain/hazards"
import type { OrogenLandmarks } from "../terrain/landmarks"
import { computeLandmarks, LANDMARK_TYPE_OCEAN } from "../terrain/landmarks"
import { computeLocations } from "../terrain/locations"
import { computeProvinces } from "../terrain/provinces"
import { computeRivers } from "../terrain/rivers"

interface PostPipelineInput {
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
	params: OrogenParams
	/** Cells that emerged above the baseline shoreline after sea-level lowering. */
	emergedLand?: Uint8Array
	tectonicMode: "active"
	boundary: BoundaryInfo
	distFields: DistanceFields
	r_hotspot: Float32Array
	r_mantleUpwelling?: Float32Array
	terrainFeatures?: OrogenTerrainFeatures
	enableOceanCurrents: boolean
	onProgress?: (label: string, pct?: number) => void
}

interface PostPipelineOutput {
	climate: OrogenClimate
	rainfall: OrogenRainfall
	monthlyTEQ: Float32Array[]
	hydrology: OrogenHydrology
	vegetation: Uint8Array
	rivers: OrogenRivers
	iceThickness: Float32Array
	iceMinMonthly: Float32Array
	iceMaxMonthly: Float32Array
	topography: Uint8Array
	coastal: Uint8Array
	slopeScore: Float32Array
	climateZones: Uint8Array
	koppenClimate: Uint8Array
	pastaClimate: Uint8Array | undefined
	pastaDebug: PastaDebug | undefined
	dtr_annual: Float32Array
	dtr_monthly: Float32Array
	waterAccess: Uint8Array
	provinces: OrogenProvinces | undefined
	locations: OrogenLocations | undefined
	population: ProvincePopulation | undefined
	tradeGoods: LocationTradeGoods | undefined
	hazards: OrogenHazards
	landmarks: OrogenLandmarks
	oceanCurrents: OrogenOceanCurrents | undefined
	timings: StageTiming[]
	eraSettledMask: Uint8Array | undefined
	eraStatehoodMask: Uint8Array | undefined
}

export function runPostElevationPipeline(
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
	const landFraction = computeLandFraction(mesh, isLand)
	const climate = computeTemperature(
		mesh,
		elevation,
		landFraction,
		params,
		oceanDist,
		isLand,
		elevation_km,
	)
	record("Post: climate", t0)
	onProgress?.("Post: climate", 42)

	t0 = performance.now()
	const currentLandmarks = enableOceanCurrents
		? computeLandmarks(mesh, isLand)
		: undefined
	if (enableOceanCurrents) record("Post: current landmarks", t0)

	const N = mesh.numRegions
	t0 = performance.now()
	const monthlyTEQ: Float32Array[] = new Array(12)
	for (let month = 0; month < 12; month++) {
		monthlyTEQ[month] = computeThermalEquator(
			mesh,
			climate.temperature_monthly.subarray(month * N, (month + 1) * N),
		)
	}
	record("Post: thermal equator", t0)
	onProgress?.("Post: thermal equator", 44)

	// ── Moisture advection ─────────────────────────────────────────────
	t0 = performance.now()
	const { east: eastAdv, west: westAdv } = computeAdvection(
		mesh,
		elevation,
		distCoast,
		climate,
		params,
		isLand,
		elevation_km,
	)
	record("Post: moisture advection", t0)
	onProgress?.("Post: moisture advection", 50)

	// ── Ocean currents ─────────────────────────────────────────────────
	t0 = performance.now()
	const oceanCurrents = enableOceanCurrents
		? computeOceanCurrents(
				mesh,
				isLand,
				distCoast,
				currentLandmarks!,
				params,
				monthlyTEQ,
			)
		: undefined
	if (enableOceanCurrents) record("Post: ocean currents", t0)
	if (oceanCurrents) {
		t0 = performance.now()
		applyCurrentTemperatureEffect(
			mesh,
			climate,
			isLand,
			oceanCurrents,
			monthlyTEQ,
		)
		refreshClimatePetMonthly(climate, params)
		record("Post: current temperature effect", t0)
	}

	// ── Rainfall ───────────────────────────────────────────────────────
	t0 = performance.now()
	const rain = computeMonthlyRain(
		mesh,
		climate,
		eastAdv,
		westAdv,
		isLand,
		params,
		monthlyTEQ,
		distCoast,
	)
	record("Post: rainfall", t0)
	onProgress?.("Post: rainfall", 54)
	const rainfall: OrogenRainfall = {
		monthly: rain.monthly,
		annual: rain.annual,
		east: eastAdv,
		west: westAdv,
	}

	// ── Diurnal temperature range + PET ───────────────────────────────
	t0 = performance.now()
	const { monthly: dtr_monthly, annual: dtr_annual } = computeDiurnalRange(
		rainfall,
		elevation_km,
		oceanDist,
		isLand,
		params,
		climate.daylight_hours_monthly,
	)
	fillPetMonthlyHargreaves(
		climate.temperature_monthly,
		dtr_monthly,
		climate.insolation_monthly,
		climate.pet_monthly,
		params.daysPerYear / 12,
	)
	applyDtrToClimateMinMax(climate, dtr_monthly, N)
	record("Post: dtr + pet", t0)
	onProgress?.("Post: dtr + pet", 56)

	t0 = performance.now()
	const hydrology = computeHydrologyFields(climate, rainfall, riverLand)
	record("Post: hydrology", t0)
	onProgress?.("Post: hydrology", 57)

	// ── Ice (needed for pasta climate) ─────────────────────────────────
	t0 = performance.now()
	const { iceThickness, iceMinMonthly, iceMaxMonthly } = computeIceAccumulation(
		mesh,
		climate,
		rainfall,
		isLand,
		distCoast,
	)
	record("Post: ice", t0)
	onProgress?.("Post: ice", 58)

	// ── Pasta climate (needed before vegetation) ───────────────────────
	t0 = performance.now()
	const pastaResult = assignPastaClimate(
		mesh,
		isLand,
		climate,
		rainfall,
		hydrology,
		params,
		iceThickness,
		iceMinMonthly,
		iceMaxMonthly,
	)
	record("Post: pasta climate", t0)
	const pastaClimate: Uint8Array = pastaResult.zones
	const pastaDebug: PastaDebug = pastaResult.debug
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
	const vegetation = assignVegetation(
		mesh,
		isLand,
		climate,
		rainfall,
		makeRng(params.seed),
		pastaClimate,
		pastaDebug.gdd,
		garField,
	)
	record("Post: vegetation", t0)
	onProgress?.("Post: vegetation", 60)

	// ── Rivers ─────────────────────────────────────────────────────────
	t0 = performance.now()
	const rivers = computeRivers(
		mesh,
		elevation,
		rainfall,
		climate,
		hydrology,
		riverLand,
		params,
	)
	record("Post: rivers", t0)
	onProgress?.("Post: rivers", 62)

	// Clear vegetation for lake cells; mutate isLand so downstream treats them as water
	t0 = performance.now()
	for (let r = 0; r < N; r++) {
		if (rivers.lakes[r] && emergedLand?.[r] && elevation_km[r] > 0) {
			rivers.lakes[r] = 0
			continue
		}
		if (rivers.lakes[r]) {
			vegetation[r] = 0
			isLand[r] = 0
		}
	}
	record("Post: apply lakes", t0)

	// Recompute landmarks with updated isLand (lakes now treated as water)
	t0 = performance.now()
	const landmarks = computeLandmarks(mesh, isLand)
	record("Post: landmarks", t0)
	onProgress?.("Post: landmarks", 62)

	// ── Topography ─────────────────────────────────────────────────────
	t0 = performance.now()
	const { topography, coastal, oceanCoastal, lakeCoastal, slopeScore } =
		classifyTopography({
			mesh,
			elevationKm: elevation_km,
			isLand,
			rivers,
			vegetation,
			planetRadiusKm: params.planetRadiusKm,
			seed: params.seed,
		})
	record("Post: topography", t0)
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
				landmarks.type[landmarks.regionLandmark[nb]] === LANDMARK_TYPE_OCEAN
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
	const climateZones = assignClimateZones(mesh, isLand, climate)
	record("Post: climate zones", t0)
	onProgress?.("Post: climate zones", 64)

	// ── Koppen climate ─────────────────────────────────────────────────
	t0 = performance.now()
	const koppenClimate = assignKoppenClimate(mesh, isLand, climate, rainfall)
	record("Post: koppen climate", t0)
	onProgress?.("Post: koppen climate", 69)

	// ── Hazards ────────────────────────────────────────────────────────
	t0 = performance.now()
	const hazards = computeHazards(
		mesh,
		boundary,
		distFields,
		elevation_km,
		isLand,
		r_hotspot,
	)
	record("Post: hazards", t0)
	onProgress?.("Post: hazards", 70)

	// ── Provinces ──────────────────────────────────────────────────────
	t0 = performance.now()
	const provinces: OrogenProvinces = computeProvinces(
		mesh,
		isLand,
		topography,
		params.seed,
		{
			climateZones,
			rainfall,
			planetRadiusKm: params.planetRadiusKm,
		},
	)
	record("Post: provinces", t0)
	onProgress?.("Post: provinces", 72)

	const waterAccess = computeProvinceWaterAccess(
		provinces,
		oceanCoastal,
		lakeCoastal,
		rivers.visible,
	)

	t0 = performance.now()
	const locations: OrogenLocations = computeLocations(
		provinces,
		mesh,
		params.seed,
		{ planetRadiusKm: params.planetRadiusKm },
	)
	record("Post: locations", t0)
	onProgress?.("Post: locations", 73)

	// ── Migration diffusion ─────────────────────────────────────────────
	// Migration runs before full population so that provinces unreachable
	// from any cradle can be marked desolate, which in turn zeroes their
	// population and habitability in the population pass below.
	t0 = performance.now()
	const rawHabitability = computeProvinceHabitability(
		provinces,
		landmarks,
		climateZones,
		vegetation,
		topography,
		oceanCoastal,
		lakeCoastal,
		rivers.visible,
		params.seed,
	)
	const migration = computeMigration(
		provinces,
		rawHabitability,
		mesh,
		params.planetRadiusKm,
		N,
	)
	// Mark provinces unreachable from any cradle as desolate so they are
	// excluded from the population pass.
	for (let p = 0; p < provinces.count; p++) {
		if (migration.migrationWave[p] < 0) provinces.desolate[p] = 1
	}
	record("Post: migration", t0)
	onProgress?.("Post: migration", 74)

	// ── Population ─────────────────────────────────────────────────────
	t0 = performance.now()
	const eraConfig = getEraConfig(params.era)

	// Percentile-based wave thresholds computed here where migrationWave is
	// guaranteed. Both are passed through to derive-province-society.
	const actualSettlementWave = wavePercentileThreshold(
		migration.migrationWave,
		provinces.desolate,
		eraConfig.settlementFraction,
	)
	const statehoodOverallFraction =
		eraConfig.settlementFraction * eraConfig.statehoodFraction
	const actualStatehoodWave = wavePercentileThreshold(
		migration.migrationWave,
		provinces.desolate,
		statehoodOverallFraction,
	)

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

	const population: ProvincePopulation = computePopulation(
		provinces,
		landmarks,
		climateZones,
		vegetation,
		topography,
		oceanCoastal,
		lakeCoastal,
		rivers.visible,
		params.seed,
		params.planetRadiusKm,
		N,
		eraConfig.targetPopulation,
		migration.migrationWave,
		actualSettlementWave,
		eraConfig.migrationFalloff,
	)
	population.migrationWave = migration.migrationWave
	population.cradleProvinces = migration.cradleProvinces
	record("Post: population", t0)
	onProgress?.("Post: population", 74)

	// ── Trade goods ─────────────────────────────────────────────────────
	t0 = performance.now()
	const tradeGoods = locations
		? computeTradeGoods({
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
		rainfall,
		monthlyTEQ,
		hydrology,
		vegetation,
		rivers,
		iceThickness,
		iceMinMonthly,
		iceMaxMonthly,
		topography,
		coastal,
		slopeScore,
		climateZones,
		koppenClimate,
		pastaClimate,
		pastaDebug,
		dtr_annual,
		dtr_monthly,
		waterAccess,
		provinces,
		locations,
		population,
		tradeGoods,
		hazards,
		landmarks,
		oceanCurrents,
		timings,
		eraSettledMask,
		eraStatehoodMask,
	}
}
