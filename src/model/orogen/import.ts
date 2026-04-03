/**
 * Heightmap import pipeline: samples a B&W equirectangular heightmap
 * onto a sphere mesh, derives synthetic plates, runs post-processing
 * and climate simulation.
 */
import type { OrogenParams, OrogenWorld, SphereMesh, OrogenRainfall } from "./types"
import { createRng } from "./rng"
import { buildSphereMesh } from "./mesh"
import { deriveSyntheticPlates, buildSyntheticPlates, buildDummyBoundary, computeSimpleDistanceFields } from "./synthetic-plates"
import { computeLandFraction, computeTemperature } from "./climate/climate"
import { computeOceanCurrents } from "./climate/ocean-currents"
import { computeHydrologyFields, refreshClimatePetMonthly } from "./climate/hydrology"
import { computeWind } from "./climate/wind"
import { computeAdvection, computeMonthlyRain } from "./climate/rain"
import {
	warpTerrain,
	smoothElevation,
	erodeComposite,
	sharpenRidges,
	applySoilCreep,
} from "./erosion"
import { assignVegetation, assignClimateZones } from "./climate/vegetation"
import { assignPastaClimate } from "./climate/pasta"
import { assignKoppenClimate } from "./climate/koppen"
import { ENABLE_PASTA_CLASSIFICATION, ENABLE_WIND_FIELDS } from "./features"
import { computeRivers } from "./topography/rivers"
import { classifyTopography } from "./topography/classification"
import { DEFAULT_DAYS_PER_YEAR, DEFAULT_ECCENTRICITY, DEFAULT_HOURS_PER_DAY, DEFAULT_OBLIQUITY_DEG, DEFAULT_SUN_TEMP_FACTOR, meanEdgeLengthKm, getMaxElevationKm, getMaxOceanDepthKm } from "./units"
import { elevToHeightKm } from "./climate/climate"
import { countContinents } from "./stats"
import { computeHazards } from "./hazards"

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
	const v00 = pixels[y0 * imgW + ((x0 % imgW) + imgW) % imgW]
	const v10 = pixels[y0 * imgW + x1]
	const v01 = pixels[y1 * imgW + ((x0 % imgW) + imgW) % imgW]
	const v11 = pixels[y1 * imgW + x1]
	return v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy
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

export function importOrogenWorld(params: ImportParams, onProgress?: ProgressFn): OrogenWorld {
	const rng = createRng(params.seed)

	onProgress?.("Building sphere mesh...", 5)
	const mesh = buildSphereMesh(params.numPoints, params.jitter, rng)

	onProgress?.("Sampling heightmap...", 15)
	const elevation = sampleHeightmap(mesh, params.grayscale, params.imageWidth, params.imageHeight)

	// Post-processing
	onProgress?.("Post-processing terrain...", 25)

	if (params.terrainWarp > 0) {
		warpTerrain(mesh, elevation, params.seed, params.terrainWarp, new Uint8Array(mesh.numRegions))
	}

	const r_isOcean = new Uint8Array(mesh.numRegions)
	for (let r = 0; r < mesh.numRegions; r++) {
		if (elevation[r] <= 0) r_isOcean[r] = 1
	}

	if (params.smoothing > 0) {
		const smoothIters = Math.round(1 + params.smoothing * 4)
		const smoothStr = 0.2 + params.smoothing * 0.5
		smoothElevation(mesh, elevation, r_isOcean, smoothIters, smoothStr)
	}

	const gIters = Math.round(params.glacialErosion * 10)
	if (params.hydraulicErosion > 0 || params.thermalErosion > 0 || gIters > 0) {
		const hIters = Math.round(params.hydraulicErosion * 20)
		const hK = params.hydraulicErosion * 0.0006
		const tIters = Math.round(params.thermalErosion * 10)
		const talusSlope = 1.2 - params.thermalErosion * 0.4
		const kThermal = params.thermalErosion * 0.15
		erodeComposite(
			mesh, elevation, r_isOcean,
			hIters, hK, 0.5, 1.0,
			tIters, talusSlope, kThermal,
			gIters, params.glacialErosion,
		)
	}

	if (params.ridgeSharpening > 0) {
		const rsIters = Math.round(1 + params.ridgeSharpening * 3)
		const rsStr = params.ridgeSharpening * 0.08
		sharpenRidges(mesh, elevation, r_isOcean, rsIters, rsStr)
	}

	applySoilCreep(mesh, elevation, r_isOcean, 3, 0.1125)

	// Derive synthetic plates
	onProgress?.("Deriving plates...", 45)
	const { plateAssignment, plateIds, plateIsOcean } = deriveSyntheticPlates(mesh, elevation)
	const plates = buildSyntheticPlates(plateIds, plateIsOcean)
	const boundary = buildDummyBoundary(mesh, elevation)
	const distFields = computeSimpleDistanceFields(mesh, elevation)

	// Ocean distance
	onProgress?.("Computing ocean distance...", 55)
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

	const landFraction = computeLandFraction(mesh, isLand)
	const climate = computeTemperature(mesh, elevation, landFraction, orogenParams, oceanDist, isLand, elevation_km)

	// Moisture advection
	onProgress?.("Computing moisture...", 80)
	const { east: eastAdv, west: westAdv } = computeAdvection(mesh, elevation, distFields.distCoast, climate, orogenParams, isLand, elevation_km)

	// Ocean currents
	onProgress?.("Computing ocean currents...", 82)
	const oceanCurrents = computeOceanCurrents(mesh, eastAdv, westAdv, isLand, climate, orogenParams)

	// Apply ocean warmth as temperature modifier
	if (climate) {
		const N = mesh.numRegions
		for (let month = 0; month < 12; month++) {
			const offset = month * N
			for (let r = 0; r < N; r++) {
				if (!isLand[r]) {
					climate.temperature_monthly[offset + r] += oceanCurrents.oceanWarmth[r] * 12
				} else {
					climate.temperature_monthly[offset + r] += oceanCurrents.coastalWarmth[r] * 5
				}
			}
		}
		for (let r = 0; r < N; r++) {
			let sum = 0, min = Infinity, max = -Infinity
			for (let month = 0; month < 12; month++) {
				const t = climate.temperature_monthly[month * N + r]
				sum += t
				if (t < min) min = t
				if (t > max) max = t
			}
			climate.temperature_avg[r] = sum / 12
			climate.temperature_min[r] = min
			climate.temperature_max[r] = max
		}
		refreshClimatePetMonthly(climate, orogenParams)
	}

	// Wind fields
	const wind = ENABLE_WIND_FIELDS
		? (() => {
			onProgress?.("Computing wind fields...", 84)
			return climate ? computeWind(mesh, elevation, isLand, climate, orogenParams) : undefined
		})()
		: undefined

	// Rainfall
	onProgress?.("Computing rainfall...", 85)
	const rain = computeMonthlyRain(mesh, climate, eastAdv, westAdv, isLand, orogenParams)
	const rainfall: OrogenRainfall = { monthly: rain.monthly, annual: rain.annual, east: eastAdv, west: westAdv }
	const hydrology = computeHydrologyFields(climate, rainfall, isLand)

	// Vegetation
	onProgress?.("Assigning vegetation...", 88)
	const vegetation = assignVegetation(mesh, isLand, climate, rainfall)

	// Rivers
	onProgress?.("Computing rivers...", 90)
	const rivers = computeRivers(mesh, elevation, rainfall, climate, hydrology, isLand, orogenParams)

	// Clear vegetation for lake cells
	for (let r = 0; r < mesh.numRegions; r++) {
		if (rivers.lakes[r]) vegetation[r] = 0
	}

	const { topography, slopeScore } = classifyTopography({
		mesh,
		elevationKm: elevation_km,
		isLand,
		rivers,
		vegetation,
		planetRadiusKm: params.planetRadiusKm,
		seed: params.seed,
	})

	// Climate zones
	onProgress?.("Classifying climate zones...", 93)
	const climateZones = assignClimateZones(mesh, isLand, climate)

	// Pasta climate
	const pastaResult = ENABLE_PASTA_CLASSIFICATION
		? (() => {
			onProgress?.("Classifying pasta climate...", 94)
			return assignPastaClimate(mesh, isLand, climate, rainfall, hydrology, orogenParams)
		})()
		: undefined
	const pastaClimate = pastaResult?.zones
	const pastaDebug = pastaResult?.debug

	// Koppen climate
	onProgress?.("Classifying Koppen climate...", 95)
	const koppenClimate = assignKoppenClimate(mesh, isLand, climate, rainfall)

	const hazards = computeHazards(mesh, boundary, distFields, elevation_km, isLand, "active")

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
		slopeScore,
		rivers,
		isLand,
		oceanCurrents,
		wind,
		continentCount: countContinents(mesh, isLand),
	}
}
