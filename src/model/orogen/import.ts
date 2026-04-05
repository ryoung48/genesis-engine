/**
 * Heightmap import pipeline: samples a B&W equirectangular heightmap
 * onto a sphere mesh, derives synthetic plates, runs post-processing
 * and climate simulation.
 */

import {
	computeLandFraction,
	computeTemperature,
	elevToHeightKm,
} from "./climate/climate"
import {
	computeHydrologyFields,
	refreshClimatePetMonthly,
} from "./climate/hydrology"
import { assignKoppenClimate } from "./climate/koppen"
import {
	applyCurrentTemperatureEffect,
	computeOceanCurrents,
} from "./climate/ocean-currents"
import { assignPastaClimate } from "./climate/pasta"
import {
	computeAdvection,
	computeMonthlyRain,
	computeThermalEquator,
} from "./climate/rain"
import { assignClimateZones, assignVegetation } from "./climate/vegetation"
import { ENABLE_PASTA_CLASSIFICATION } from "./features"
import { buildSphereMesh } from "./mesh"
import { computePopulation } from "./partitions/population"
import {
	buildDummyBoundary,
	buildSyntheticPlates,
	computeSimpleDistanceFields,
	deriveSyntheticPlates,
} from "./tectonics/synthetic-plates"
import { classifyTopography } from "./terrain/classification"
import {
	applySoilCreep,
	erodeComposite,
	sharpenRidges,
	smoothElevation,
	warpTerrain,
} from "./terrain/erosion"
import { computeHazards } from "./terrain/hazards"
import { computeLandmarks } from "./terrain/landmarks"
import { computeProvinces } from "./terrain/provinces"
import { computeRivers } from "./terrain/rivers"
import type {
	OrogenParams,
	OrogenRainfall,
	OrogenWorld,
	SphereMesh,
	StageTiming,
} from "./types"
import { createRng } from "./util/rng"
import { countContinents } from "./util/stats"
import {
	DEFAULT_DAYS_PER_YEAR,
	DEFAULT_ECCENTRICITY,
	DEFAULT_HOURS_PER_DAY,
	DEFAULT_OBLIQUITY_DEG,
	DEFAULT_SUN_TEMP_FACTOR,
	getMaxElevationKm,
	getMaxOceanDepthKm,
	meanEdgeLengthKm,
} from "./util/units"

export interface ImportParams {
	seed: number
	numPoints: number
	jitter: number
	grayscale: Uint8Array
	imageWidth: number
	imageHeight: number
	terrainWarp: number
	smoothing: number
	hydraulicErosion: number
	thermalErosion: number
	ridgeSharpening: number
	glacialErosion: number
	volcanism?: number
	planetRadiusKm?: number
	obliquity?: number
	eccentricity?: number
	sunTempFactor?: number
	daysPerYear?: number
	hoursPerDay?: number
	tidallyLocked?: boolean
	antistellarLon?: number
	perihelion?: number
	pressure?: number
}

type ProgressFn = (label: string, pct?: number) => void

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

// ── Bilinear sampling ──────────────────────────────────────────────

function sampleBilinear(
	pixels: Uint8Array,
	imgW: number,
	imgH: number,
	px: number,
	py: number,
): number {
	py = Math.max(0, Math.min(py, imgH - 1))
	const x0 = Math.floor(px)
	const y0 = Math.floor(py)
	const x1 = (x0 + 1) % imgW
	const y1 = Math.min(y0 + 1, imgH - 1)
	const fx = px - x0
	const fy = py - y0
	const v00 = pixels[y0 * imgW + (((x0 % imgW) + imgW) % imgW)]
	const v10 = pixels[y0 * imgW + x1]
	const v01 = pixels[y1 * imgW + (((x0 % imgW) + imgW) % imgW)]
	const v11 = pixels[y1 * imgW + x1]
	return (
		v00 * (1 - fx) * (1 - fy) +
		v10 * fx * (1 - fy) +
		v01 * (1 - fx) * fy +
		v11 * fx * fy
	)
}

function grayscaleToElevation(v: number): number {
	if (v < 1) return -0.5
	return Math.sqrt((v - 1) / 254)
}

function sampleHeightmap(
	mesh: SphereMesh,
	grayscale: Uint8Array,
	imgW: number,
	imgH: number,
): Float32Array {
	const N = mesh.numRegions
	const { r_xyz } = mesh
	const elevation = new Float32Array(N)

	for (let r = 0; r < N; r++) {
		const x = r_xyz[3 * r]
		const y = r_xyz[3 * r + 1]
		const z = r_xyz[3 * r + 2]

		const lat = Math.asin(Math.max(-1, Math.min(1, z)))
		const lon = Math.atan2(y, x)

		const px = (lon / Math.PI + 1) * 0.5 * imgW
		const py = (0.5 - lat / Math.PI) * imgH

		const gray = sampleBilinear(grayscale, imgW, imgH, px, py)
		elevation[r] = grayscaleToElevation(gray)
	}

	return elevation
}

// Synthetic plate derivation + distance fields are in synthetic-plates.ts

// ── Main import pipeline ───────────────────────────────────────────

export function importOrogenWorld(
	params: ImportParams,
	onProgress?: ProgressFn,
): OrogenWorld {
	const { timings, record } = createTimingRecorder()
	const rng = createRng(params.seed)

	onProgress?.("Building sphere mesh...", 5)
	let t0 = performance.now()
	const mesh = buildSphereMesh(params.numPoints, params.jitter, rng)
	record("Sphere mesh (Fibonacci + Delaunay + pole)", t0)

	onProgress?.("Sampling heightmap...", 15)
	t0 = performance.now()
	const elevation = sampleHeightmap(
		mesh,
		params.grayscale,
		params.imageWidth,
		params.imageHeight,
	)
	record("Heightmap sampling", t0)

	// Post-processing
	onProgress?.("Post-processing terrain...", 25)

	if (params.terrainWarp > 0) {
		t0 = performance.now()
		warpTerrain(
			mesh,
			elevation,
			params.seed,
			params.terrainWarp,
			new Float32Array(mesh.numRegions),
		)
		record(`Terrain warp (strength=${params.terrainWarp.toFixed(2)})`, t0)
	}

	const r_isOcean = new Uint8Array(mesh.numRegions)
	for (let r = 0; r < mesh.numRegions; r++) {
		if (elevation[r] <= 0) r_isOcean[r] = 1
	}

	if (params.smoothing > 0) {
		const smoothIters = Math.round(1 + params.smoothing * 4)
		const smoothStr = 0.2 + params.smoothing * 0.5
		t0 = performance.now()
		smoothElevation(mesh, elevation, r_isOcean, smoothIters, smoothStr)
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
		erodeComposite(
			mesh,
			elevation,
			r_isOcean,
			hIters,
			hK,
			0.5,
			1.0,
			tIters,
			talusSlope,
			kThermal,
			gIters,
			params.glacialErosion,
		)
		record(`Erosion composite (h=${hIters}, t=${tIters}, g=${gIters})`, t0)
	}

	if (params.ridgeSharpening > 0) {
		const rsIters = Math.round(1 + params.ridgeSharpening * 3)
		const rsStr = params.ridgeSharpening * 0.08
		t0 = performance.now()
		sharpenRidges(mesh, elevation, r_isOcean, rsIters, rsStr)
		record(`Ridge sharpening (${rsIters} iters)`, t0)
	}

	t0 = performance.now()
	applySoilCreep(mesh, elevation, r_isOcean, 3, 0.1125)
	record("Soil creep (3 iters)", t0)

	// Derive synthetic plates
	onProgress?.("Deriving plates...", 45)
	t0 = performance.now()
	const { plateAssignment, plateIds, plateIsOcean } = deriveSyntheticPlates(
		mesh,
		elevation,
	)
	const plates = buildSyntheticPlates(plateIds, plateIsOcean)
	const boundary = buildDummyBoundary(mesh, elevation)
	const distFields = computeSimpleDistanceFields(mesh, elevation)
	record("Synthetic plates + boundary", t0)

	// Ocean distance
	onProgress?.("Computing ocean distance...", 55)
	t0 = performance.now()
	const oceanDist = new Float32Array(mesh.numRegions)
	{
		const { adjOffset, adjList } = mesh
		const avgEdgeKm = meanEdgeLengthKm(mesh, params.planetRadiusKm)

		const visited = new Uint8Array(mesh.numRegions)
		const queue: number[] = []
		const hops = new Int32Array(mesh.numRegions)
		for (let r = 0; r < mesh.numRegions; r++) {
			if (elevation[r] <= 0) {
				visited[r] = 1
				queue.push(r)
			}
		}
		let head = 0
		while (head < queue.length) {
			const r = queue[head++]
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (!visited[nb]) {
					visited[nb] = 1
					hops[nb] = hops[r] + 1
					oceanDist[nb] = hops[nb] * avgEdgeKm
					queue.push(nb)
				}
			}
		}
	}
	record("Ocean distance (BFS)", t0)

	// Climate
	onProgress?.("Computing climate...", 65)
	const orogenParams: OrogenParams = {
		seed: params.seed,
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
		volcanism: params.volcanism ?? 0.5,
		planetRadiusKm: params.planetRadiusKm,
		obliquity: params.obliquity ?? DEFAULT_OBLIQUITY_DEG,
		eccentricity: params.eccentricity ?? DEFAULT_ECCENTRICITY,
		sunTempFactor: params.sunTempFactor ?? DEFAULT_SUN_TEMP_FACTOR,
		daysPerYear: params.daysPerYear ?? DEFAULT_DAYS_PER_YEAR,
		hoursPerDay: params.hoursPerDay ?? DEFAULT_HOURS_PER_DAY,
		tidallyLocked: params.tidallyLocked,
		antistellarLon: params.antistellarLon,
		perihelion: params.perihelion,
		pressure: params.pressure ?? 1.0,
	}
	// Build land mask from final elevation
	t0 = performance.now()
	const isLand = new Uint8Array(mesh.numRegions)
	for (let r = 0; r < mesh.numRegions; r++) {
		if (elevation[r] > 0) isLand[r] = 1
	}

	// Convert raw elevation to km (radius-scaled)
	const maxElevKm = getMaxElevationKm(params.planetRadiusKm)
	const maxDepthKm = getMaxOceanDepthKm(params.planetRadiusKm)
	const elevation_km = new Float32Array(mesh.numRegions)
	for (let r = 0; r < mesh.numRegions; r++) {
		elevation_km[r] = elevToHeightKm(elevation[r], maxElevKm, maxDepthKm)
	}
	record("Land mask + elevation km", t0)

	t0 = performance.now()
	const landFraction = computeLandFraction(mesh, isLand)
	const climate = computeTemperature(
		mesh,
		elevation,
		landFraction,
		orogenParams,
		oceanDist,
		isLand,
		elevation_km,
	)
	const currentLandmarks = computeLandmarks(mesh, isLand)
	record("Climate temperature", t0)
	t0 = performance.now()
	const monthlyTEQ: Float32Array[] | undefined = climate
		? (() => {
				const N = mesh.numRegions
				const result: Float32Array[] = new Array(12)
				for (let month = 0; month < 12; month++) {
					result[month] = computeThermalEquator(
						mesh,
						climate.temperature_monthly.subarray(month * N, (month + 1) * N),
					)
				}
				return result
			})()
		: undefined
	record("Thermal equator", t0)

	// Moisture advection
	onProgress?.("Computing moisture...", 80)
	t0 = performance.now()
	const { east: eastAdv, west: westAdv } = computeAdvection(
		mesh,
		elevation,
		distFields.distCoast,
		climate,
		orogenParams,
		isLand,
		elevation_km,
	)
	record("Moisture advection", t0)

	// Ocean currents
	onProgress?.("Computing ocean currents...", 82)
	t0 = performance.now()
	const oceanCurrents = computeOceanCurrents(
		mesh,
		isLand,
		climate,
		distFields.distCoast,
		currentLandmarks,
		orogenParams,
		monthlyTEQ,
	)

	// Apply ocean warmth as temperature modifier
	if (climate) {
		applyCurrentTemperatureEffect(
			mesh,
			climate,
			isLand,
			oceanCurrents,
			monthlyTEQ,
		)
		refreshClimatePetMonthly(climate, orogenParams)
	}
	record("Ocean currents", t0)

	// Rainfall
	onProgress?.("Computing rainfall...", 85)
	t0 = performance.now()
	const rain = computeMonthlyRain(
		mesh,
		climate,
		eastAdv,
		westAdv,
		isLand,
		orogenParams,
	)
	const rainfall: OrogenRainfall = {
		monthly: rain.monthly,
		annual: rain.annual,
		east: eastAdv,
		west: westAdv,
	}
	record("Monthly rainfall", t0)
	t0 = performance.now()
	const hydrology = computeHydrologyFields(climate, rainfall, isLand)
	record("Hydrology fields", t0)

	// Vegetation
	onProgress?.("Assigning vegetation...", 88)
	t0 = performance.now()
	const vegetation = assignVegetation(mesh, isLand, climate, rainfall)
	record("Vegetation assignment", t0)

	// Rivers
	onProgress?.("Computing rivers...", 90)
	t0 = performance.now()
	const rivers = computeRivers(
		mesh,
		elevation,
		rainfall,
		climate,
		hydrology,
		isLand,
		orogenParams,
	)
	record("Rivers", t0)

	// Clear vegetation for lake cells
	for (let r = 0; r < mesh.numRegions; r++) {
		if (rivers.lakes[r]) vegetation[r] = 0
	}

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
	record("Topography classification", t0)

	// Climate zones
	onProgress?.("Classifying climate zones...", 93)
	t0 = performance.now()
	const climateZones = assignClimateZones(mesh, isLand, climate)
	record("Climate zone assignment", t0)

	// Provinces
	onProgress?.("Partitioning provinces...", 94)
	t0 = performance.now()
	const provinces = computeProvinces(mesh, isLand, topography, params.seed, {
		climateZones,
		rainfall,
		planetRadiusKm: params.planetRadiusKm,
	})
	record("Provinces", t0)

	// Pasta climate
	const pastaResult = ENABLE_PASTA_CLASSIFICATION
		? (() => {
				onProgress?.("Classifying pasta climate...", 95)
				t0 = performance.now()
				return assignPastaClimate(
					mesh,
					isLand,
					climate,
					rainfall,
					hydrology,
					orogenParams,
				)
			})()
		: undefined
	const pastaClimate = pastaResult?.zones
	const pastaDebug = pastaResult?.debug
	if (pastaResult) record("Pasta climate assignment", t0)

	// Koppen climate
	onProgress?.("Classifying Koppen climate...", 96)
	t0 = performance.now()
	const koppenClimate = assignKoppenClimate(mesh, isLand, climate, rainfall)
	record("Koppen climate assignment", t0)

	// Province population
	onProgress?.("Computing population...", 97)
	t0 = performance.now()
	const population = computePopulation(
		provinces,
		currentLandmarks,
		climateZones,
		vegetation,
		topography,
		coastal,
		rivers.visible,
		params.seed,
		params.planetRadiusKm,
		mesh.numRegions,
	)
	record("Population", t0)

	t0 = performance.now()
	const hazards = computeHazards(
		mesh,
		boundary,
		distFields,
		elevation_km,
		isLand,
		"active",
	)
	record("Hazards", t0)

	onProgress?.("Done", 100)

	return {
		mesh,
		plates,
		plateAssignment,
		boundary,
		distFields,
		elevation,
		elevation_km,
		params: orogenParams,
		climate,
		oceanDist,
		rainfall,
		hazards,
		volcanism: { hotspot: new Float32Array(mesh.numRegions) },
		climateZones,
		pastaClimate,
		pastaDebug,
		koppenClimate,
		vegetation,
		topography,
		coastal,
		slopeScore,
		rivers,
		isLand,
		provinces,
		population,
		oceanCurrents,
		continentCount: countContinents(mesh, isLand),
		timings,
	}
}
