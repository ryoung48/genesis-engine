/**
 * Heightmap import pipeline: samples a B&W equirectangular heightmap
 * onto a sphere mesh, derives synthetic plates, runs post-processing
 * and climate simulation.
 */

import type { GenesisParams, GenesisWorld, SphereMesh, StageTiming } from ".."
import { buildSphereMesh } from "../mesh"
import { createRng } from "../shared/rng"
import {
	DEFAULT_ORBITAL_DISTANCE_AU,
	DEFAULT_SPECTRAL_CLASS,
	DEFAULT_STAR_SUBTYPE,
} from "../shared/star-types"
import { computeOceanDistanceBFS, countContinents } from "../shared/stats"
import {
	DEFAULT_ANTISTELLAR_LON,
	DEFAULT_DAYS_PER_YEAR,
	DEFAULT_ECCENTRICITY,
	DEFAULT_HOURS_PER_DAY,
	DEFAULT_OBLIQUITY_DEG,
	DEFAULT_PERIHELION,
	DEFAULT_PLANET_RADIUS_KM,
	getMaxOceanDepthKm,
	meanEdgeLengthKm,
} from "../shared/units"
import {
	buildDummyBoundary,
	buildSyntheticPlates,
	computeSimpleDistanceFields,
	deriveSyntheticPlates,
} from "../tectonics/synthetic-plates"
import {
	applySoilCreep,
	erodeComposite,
	sharpenRidges,
	smoothElevation,
	warpTerrain,
} from "../terrain/erosion"
import { applySeaLevelToElevation } from "../terrain/sea-level"
import { deriveProvinceSociety } from "./derive-province-society"
import { runPostElevationPipeline } from "./post-elevation"

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
	seaLevel: number
	volcanism?: number
	craters?: number
	maxElevation?: number
	planetRadiusKm?: number
	obliquity?: number
	eccentricity?: number
	spectralClass?: string
	starSubtype?: number
	orbitalDistanceAU?: number
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

// ── Main import pipeline ───────────────────────────────────────────

export function importGenesisWorld(
	params: ImportParams,
	onProgress?: ProgressFn,
): GenesisWorld {
	const { timings, record } = createTimingRecorder()
	const rng = createRng(params.seed)

	onProgress?.("import:mesh", 3)
	let t0 = performance.now()
	const mesh = buildSphereMesh(params.numPoints, params.jitter, rng)
	record("Sphere mesh (Fibonacci + Delaunay + pole)", t0)

	onProgress?.("import:heightmap", 10)
	t0 = performance.now()
	const elevation = sampleHeightmap(
		mesh,
		params.grayscale,
		params.imageWidth,
		params.imageHeight,
	)
	record("Heightmap sampling", t0)

	// Post-processing
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
	onProgress?.("import:post", 20)

	// Derive synthetic plates
	t0 = performance.now()
	const { plateAssignment, plateIds, plateIsOcean } = deriveSyntheticPlates(
		mesh,
		elevation,
	)
	const plates = buildSyntheticPlates(plateIds, plateIsOcean)
	const boundary = buildDummyBoundary(mesh, elevation)
	const distFields = computeSimpleDistanceFields(mesh, elevation)
	record("Synthetic plates + boundary", t0)
	onProgress?.("import:plates", 25)

	// Ocean distance
	t0 = performance.now()
	const isLand = new Uint8Array(mesh.numRegions)
	for (let r = 0; r < mesh.numRegions; r++) {
		if (elevation[r] > 0) isLand[r] = 1
	}
	const oceanDist = computeOceanDistanceBFS(
		mesh,
		isLand,
		meanEdgeLengthKm(mesh, params.planetRadiusKm),
	)
	record("Ocean distance (BFS)", t0)
	onProgress?.("import:oceanDist", 28)

	// Build GenesisParams from ImportParams
	const genesisParams: GenesisParams = {
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
		seaLevel: params.seaLevel,
		volcanism: params.volcanism ?? 0.5,
		planetRadiusKm: params.planetRadiusKm ?? DEFAULT_PLANET_RADIUS_KM,
		obliquity: params.obliquity ?? DEFAULT_OBLIQUITY_DEG,
		eccentricity: params.eccentricity ?? DEFAULT_ECCENTRICITY,
		spectralClass: params.spectralClass ?? DEFAULT_SPECTRAL_CLASS,
		starSubtype: params.starSubtype ?? DEFAULT_STAR_SUBTYPE,
		orbitalDistanceAU: params.orbitalDistanceAU ?? DEFAULT_ORBITAL_DISTANCE_AU,
		daysPerYear: params.daysPerYear ?? DEFAULT_DAYS_PER_YEAR,
		hoursPerDay: params.hoursPerDay ?? DEFAULT_HOURS_PER_DAY,
		tidallyLocked: params.tidallyLocked ?? false,
		antistellarLon: params.antistellarLon ?? DEFAULT_ANTISTELLAR_LON,
		perihelion: params.perihelion ?? DEFAULT_PERIHELION,
		pressure: params.pressure ?? 1.0,
	}

	const maxElevKm = (genesisParams.maxElevation ?? 6000) / 1000
	const maxDepthKm = getMaxOceanDepthKm(genesisParams.planetRadiusKm)
	const baseElevation = elevation.slice()
	const { elevation: finalElevation, elevation_km } = applySeaLevelToElevation({
		baseElevation,
		maxElevKm,
		maxDepthKm,
		seaLevel: genesisParams.seaLevel,
	})
	elevation.set(finalElevation)

	// Shared post-elevation pipeline (climate → population)
	t0 = performance.now()
	const post = runPostElevationPipeline({
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
		r_hotspot: new Float32Array(mesh.numRegions),
		r_mantleUpwelling: new Float32Array(mesh.numRegions),
		terrainFeatures: undefined,
		enableOceanCurrents: true,
		onProgress,
	})
	record("Post-elevation pipeline", t0)
	onProgress?.("import:post-pipeline", 70)

	t0 = performance.now()
	const provinceSociety = deriveProvinceSociety({
		mesh,
		params: genesisParams,
		post,
		isLand,
	})
	record("Imported province society", t0)
	onProgress?.("import:society", 77)

	return {
		mesh,
		plates,
		plateAssignment,
		boundary,
		distFields,
		elevation,
		elevation_km,
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
		pastaClimate: post.pastaClimate,
		pastaDebug: post.pastaDebug,
		koppenClimate: post.koppenClimate,
		vegetation: post.vegetation,
		topography: post.topography,
		coastal: post.coastal,
		waterAccess: post.waterAccess,
		riverAccess: post.riverAccess,
		lakeAccess: post.lakeAccess,
		slopeScore: post.slopeScore,
		dtr_annual: post.dtr_annual,
		dtr_monthly: post.dtr_monthly,
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
		religionTypes: provinceSociety.religionTypes,
		landmarks: provinceSociety.landmarks,
		population: post.population,
		tradeGoods: post.tradeGoods,
		settlementRegions: provinceSociety.settlementRegions,
		settlementWaterLandmarks: provinceSociety.settlementWaterLandmarks,
		settlementPortRegions: provinceSociety.settlementPortRegions,
		oceanCurrents: post.oceanCurrents,
		continentCount: countContinents(mesh, isLand),
		timings: [...timings, ...post.timings, ...provinceSociety.timings],
	}
}
