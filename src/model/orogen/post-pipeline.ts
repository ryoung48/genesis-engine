/**
 * Shared post-elevation pipeline: runs from climate computation through
 * population for both the tectonic generation path (pipeline.ts) and the
 * heightmap import path (import.ts).
 */
import {
	applyDtrToClimateMinMax,
	computeLandFraction,
	computeTemperature,
} from "./climate/climate"
import { computeDiurnalRange } from "./climate/dtr"
import {
	computeHydrologyFields,
	fillPetMonthlyHargreaves,
	refreshClimatePetMonthly,
} from "./climate/hydrology"
import { computeIceAccumulation } from "./climate/ice"
import { assignKoppenClimate } from "./climate/koppen"
import {
	applyCurrentTemperatureEffect,
	computeOceanCurrents,
} from "./climate/ocean-currents"
import type { PastaDebug } from "./climate/pasta"
import { assignPastaClimate } from "./climate/pasta"
import {
	computeAdvection,
	computeMonthlyRain,
	computeThermalEquator,
} from "./climate/rain"
import { assignClimateZones, assignVegetation } from "./climate/vegetation"
import type { ProvincePopulation } from "./partitions/population"
import { computePopulation } from "./partitions/population"
import { classifyTopography } from "./terrain/classification"
import { computeHazards } from "./terrain/hazards"
import type { OrogenLandmarks } from "./terrain/landmarks"
import { computeLandmarks } from "./terrain/landmarks"
import { computeProvinces } from "./terrain/provinces"
import { computeRivers } from "./terrain/rivers"
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
	SphereMesh,
} from "./types"

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
	params: OrogenParams
	tectonicMode: "active" | "stagnant"
	boundary: BoundaryInfo
	distFields: DistanceFields
	r_hotspot: Float32Array
	enableOceanCurrents: boolean
	onProgress?: (label: string, pct?: number) => void
}

export interface PostPipelineOutput {
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
		enableOceanCurrents,
		onProgress,
	} = input

	// ── Climate ────────────────────────────────────────────────────────
	onProgress?.("Computing climate...", 65)
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

	const currentLandmarks = enableOceanCurrents
		? computeLandmarks(mesh, isLand)
		: undefined

	const N = mesh.numRegions
	const monthlyTEQ: Float32Array[] = new Array(12)
	for (let month = 0; month < 12; month++) {
		monthlyTEQ[month] = computeThermalEquator(
			mesh,
			climate.temperature_monthly.subarray(month * N, (month + 1) * N),
		)
	}

	// ── Moisture advection ─────────────────────────────────────────────
	onProgress?.("Computing moisture advection...", 80)
	const { east: eastAdv, west: westAdv } = computeAdvection(
		mesh,
		elevation,
		distCoast,
		climate,
		params,
		isLand,
		elevation_km,
	)

	// ── Ocean currents ─────────────────────────────────────────────────
	onProgress?.("Computing ocean currents...", 82)
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
	if (oceanCurrents) {
		applyCurrentTemperatureEffect(
			mesh,
			climate,
			isLand,
			oceanCurrents,
			monthlyTEQ,
		)
		refreshClimatePetMonthly(climate, params)
	}

	// ── Rainfall ───────────────────────────────────────────────────────
	onProgress?.("Computing rainfall...", 85)
	const rain = computeMonthlyRain(
		mesh,
		climate,
		eastAdv,
		westAdv,
		isLand,
		params,
		monthlyTEQ,
	)
	const rainfall: OrogenRainfall = {
		monthly: rain.monthly,
		annual: rain.annual,
		east: eastAdv,
		west: westAdv,
	}

	// ── Diurnal temperature range + PET ───────────────────────────────
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

	const hydrology = computeHydrologyFields(climate, rainfall, riverLand)

	// ── Vegetation ─────────────────────────────────────────────────────
	onProgress?.("Assigning vegetation...", 88)
	const vegetation = assignVegetation(mesh, isLand, climate, rainfall)

	// ── Rivers ─────────────────────────────────────────────────────────
	onProgress?.("Computing rivers...", 90)
	const rivers = computeRivers(
		mesh,
		elevation,
		rainfall,
		climate,
		hydrology,
		riverLand,
		params,
	)

	// Clear vegetation for lake cells; mutate isLand so downstream treats them as water
	for (let r = 0; r < N; r++) {
		if (rivers.lakes[r]) {
			vegetation[r] = 0
			isLand[r] = 0
		}
	}

	// Recompute landmarks with updated isLand (lakes now treated as water)
	const landmarks = computeLandmarks(mesh, isLand)

	// ── Ice ────────────────────────────────────────────────────────────
	onProgress?.("Computing ice...", 92)
	const { iceThickness, iceMinMonthly, iceMaxMonthly } = computeIceAccumulation(
		mesh,
		climate,
		rainfall,
		isLand,
		distCoast,
	)

	// ── Topography ─────────────────────────────────────────────────────
	const { topography, coastal, slopeScore } = classifyTopography({
		mesh,
		elevationKm: elevation_km,
		isLand,
		rivers,
		vegetation,
		planetRadiusKm: params.planetRadiusKm,
		seed: params.seed,
	})

	// ── Climate zones ──────────────────────────────────────────────────
	onProgress?.("Classifying climate zones...", 93)
	const climateZones = assignClimateZones(mesh, isLand, climate)

	// ── Pasta climate ──────────────────────────────────────────────────
	onProgress?.("Classifying pasta climate...", 95)
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
	const pastaClimate: Uint8Array = pastaResult.zones
	const pastaDebug: PastaDebug = pastaResult.debug

	// ── Koppen climate ─────────────────────────────────────────────────
	onProgress?.("Classifying Koppen climate...", 96)
	const koppenClimate = assignKoppenClimate(mesh, isLand, climate, rainfall)

	// ── Hazards ────────────────────────────────────────────────────────
	const hazards = computeHazards(
		mesh,
		boundary,
		distFields,
		elevation_km,
		isLand,
		tectonicMode,
		r_hotspot,
	)

	// ── Provinces ──────────────────────────────────────────────────────
	onProgress?.("Partitioning provinces...", 97)
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

	// ── Population ─────────────────────────────────────────────────────
	onProgress?.("Computing population...", 98)
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
	}
}
