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
import type { ProvincePopulation } from "../society/population"
import { computePopulation } from "../society/population"
import { classifyTopography } from "../terrain/classification"
import { computeHazards } from "../terrain/hazards"
import type { OrogenLandmarks } from "../terrain/landmarks"
import { computeLandmarks } from "../terrain/landmarks"
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
	tectonicMode: "active" | "stagnant"
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
	provinces: OrogenProvinces | undefined
	population: ProvincePopulation | undefined
	hazards: OrogenHazards
	landmarks: OrogenLandmarks
	oceanCurrents: OrogenOceanCurrents | undefined
	timings: StageTiming[]
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
		tectonicMode,
		boundary,
		distFields,
		r_hotspot,
		r_mantleUpwelling,
		terrainFeatures,
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
	onProgress?.("Computing climate...", 65)
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
		r_hotspot,
		r_mantleUpwelling,
		terrainFeatures,
	)
	record("Post: climate", t0)

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

	// ── Moisture advection ─────────────────────────────────────────────
	onProgress?.("Computing moisture advection...", 80)
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

	// ── Ocean currents ─────────────────────────────────────────────────
	onProgress?.("Computing ocean currents...", 82)
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
	onProgress?.("Computing rainfall...", 85)
	t0 = performance.now()
	const rain = computeMonthlyRain(
		mesh,
		climate,
		eastAdv,
		westAdv,
		isLand,
		params,
		monthlyTEQ,
	)
	record("Post: rainfall", t0)
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

	t0 = performance.now()
	const hydrology = computeHydrologyFields(climate, rainfall, riverLand)
	record("Post: hydrology", t0)

	// ── Vegetation ─────────────────────────────────────────────────────
	onProgress?.("Assigning vegetation...", 88)
	t0 = performance.now()
	const vegetation = assignVegetation(mesh, isLand, climate, rainfall)
	record("Post: vegetation", t0)

	// ── Rivers ─────────────────────────────────────────────────────────
	onProgress?.("Computing rivers...", 90)
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

	// Clear vegetation for lake cells; mutate isLand so downstream treats them as water
	t0 = performance.now()
	for (let r = 0; r < N; r++) {
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

	// ── Ice ────────────────────────────────────────────────────────────
	onProgress?.("Computing ice...", 92)
	t0 = performance.now()
	const { iceThickness, iceMinMonthly, iceMaxMonthly } = computeIceAccumulation(
		mesh,
		climate,
		rainfall,
		isLand,
		distCoast,
	)
	record("Post: ice", t0)

	// ── Topography ─────────────────────────────────────────────────────
	t0 = performance.now()
	const { topography, coastal, slopeScore } = classifyTopography({
		mesh,
		elevationKm: elevation_km,
		isLand,
		rivers,
		vegetation,
		planetRadiusKm: params.planetRadiusKm,
		seed: params.seed,
	})
	record("Post: topography", t0)

	// ── Climate zones ──────────────────────────────────────────────────
	onProgress?.("Classifying climate zones...", 93)
	t0 = performance.now()
	const climateZones = assignClimateZones(mesh, isLand, climate)
	record("Post: climate zones", t0)

	// ── Pasta climate ──────────────────────────────────────────────────
	onProgress?.("Classifying pasta climate...", 95)
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

	// ── Koppen climate ─────────────────────────────────────────────────
	onProgress?.("Classifying Koppen climate...", 96)
	t0 = performance.now()
	const koppenClimate = assignKoppenClimate(mesh, isLand, climate, rainfall)
	record("Post: koppen climate", t0)

	// ── Hazards ────────────────────────────────────────────────────────
	t0 = performance.now()
	const hazards = computeHazards(
		mesh,
		boundary,
		distFields,
		elevation_km,
		isLand,
		tectonicMode,
		r_hotspot,
	)
	record("Post: hazards", t0)

	// ── Provinces ──────────────────────────────────────────────────────
	onProgress?.("Partitioning provinces...", 97)
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

	// ── Population ─────────────────────────────────────────────────────
	onProgress?.("Computing population...", 98)
	t0 = performance.now()
	const population: ProvincePopulation = computePopulation(
		provinces,
		landmarks,
		climateZones,
		vegetation,
		topography,
		coastal,
		rivers.visible,
		params.seed,
		params.planetRadiusKm,
		N,
	)
	record("Post: population", t0)

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
		provinces,
		population,
		hazards,
		landmarks,
		oceanCurrents,
		timings,
	}
}
