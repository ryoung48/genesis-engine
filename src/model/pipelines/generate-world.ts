/**
 * Orogen pipeline orchestrator: generates a complete tectonic world.
 * Faithful port of orogen's planet-worker.js pipeline order.
 */

import type {
	BoundaryInfo,
	DistanceFields,
	OrogenParams,
	OrogenTerrainFeatures,
	OrogenWorld,
	SphereMesh,
	StageTiming,
	TectonicPlate,
} from ".."
import { elevToHeightKm } from "../climate/climate"
import { buildSphereMesh } from "../mesh"
import { createRng } from "../shared/rng"
import {
	computeCoastDistances,
	computeOceanDistanceBFS,
	countContinents,
} from "../shared/stats"
import {
	getMaxElevationKm,
	getMaxOceanDepthKm,
	meanEdgeLengthKm,
} from "../shared/units"
import { clampVolcanism } from "../shared/volcanism"
import { computeCultures } from "../society/culture"
import { computeFaiths } from "../society/faith"
import { computeHeritages } from "../society/heritage"
import { computeNations } from "../society/nations"
import { computeReligions } from "../society/religion"
import { deriveChildColors } from "../society/shared"
import {
	generateCoarsePlates,
	projectCoarsePlates,
} from "../tectonics/coarse-plates"
import { classifyBoundaries } from "../tectonics/collision"
import {
	computeMantleField,
	projectMantleFieldToRegions,
} from "../tectonics/mantle"
import { smoothAndReconnectPlates } from "../tectonics/plates"
import { generateStaticElevation } from "../tectonics/static-elevation"
import { buildSuperPlates } from "../tectonics/super-plates"
import {
	buildDummyBoundary,
	computeSimpleDistanceFields,
} from "../tectonics/synthetic-plates"
import { applyCraters } from "../terrain/craters"
import { blendElevation, computeDistanceFields } from "../terrain/elevation"
import {
	applySoilCreep,
	erodeComposite,
	sharpenRidges,
	smoothElevation,
	warpTerrain,
} from "../terrain/erosion"
import { applyHotspots, applyStaticHotspots } from "../terrain/hotspots"
import { assignLandmarkIdentity } from "../terrain/landmarks"
import { runPostElevationPipeline } from "./post-elevation"

type ProgressFn = (label: string, pct?: number) => void

function withTiming<T>(label: string, timings: StageTiming[], fn: () => T): T {
	console.time(label)
	const t0 = performance.now()
	const result = fn()
	timings.push({ Stage: label, ms: (performance.now() - t0).toFixed(1) })
	console.timeEnd(label)
	return result
}

function applyPeakCompression(elev: Float32Array, N: number): void {
	for (let r = 0; r < N; r++) {
		if (elev[r] > 0) elev[r] = Math.pow(elev[r], 0.92)
	}
}

function clampHotspots(raw: Float32Array): Float32Array {
	for (let i = 0; i < raw.length; i++) {
		const value = raw[i]
		raw[i] = value <= 0 ? 0 : value >= 1 ? 1 : value
	}
	return raw
}

const HOTSPOT_EXPOSURE_THRESHOLD = 0.01

function summarizeHotspotExposure(
	hotspot: Float32Array,
	beforeFloodLand: Uint8Array,
	finalLand: Uint8Array,
) {
	let activeCells = 0
	let aboveWaterBeforeFlood = 0
	let aboveWaterAfterFlood = 0
	for (let r = 0; r < hotspot.length; r++) {
		if (hotspot[r] <= HOTSPOT_EXPOSURE_THRESHOLD) continue
		activeCells++
		if (beforeFloodLand[r]) aboveWaterBeforeFlood++
		if (finalLand[r]) aboveWaterAfterFlood++
	}
	return {
		threshold: HOTSPOT_EXPOSURE_THRESHOLD,
		activeCells,
		aboveWaterBeforeFlood,
		aboveWaterAfterFlood,
	}
}

interface TectonicPathResult {
	elevation: Float32Array
	terrainFeatures: OrogenTerrainFeatures | undefined
	boundary: BoundaryInfo
	distFields: DistanceFields
	r_hotspot: Float32Array
	r_mantleUpwelling: Float32Array
}

function runActivePath(
	mesh: SphereMesh,
	r_plate: Int32Array,
	plates: TectonicPlate[],
	plateIds: number[],
	coarse: ReturnType<typeof generateCoarsePlates>,
	params: OrogenParams,
	volcanism: number,
	plateAssignment: Int32Array,
	pipelineTiming: StageTiming[],
	elevationTiming: StageTiming[],
	onProgress?: ProgressFn,
): TectonicPathResult {
	// 5. Plate density (ocean: 3.0–3.5, land: 2.4–2.9)
	const plateDensity = new Map<number, number>()
	const densityRng = createRng(params.seed + 777)
	for (const pid of plateIds) {
		const oceanDensity = 3.0 + densityRng.random() * 0.5
		const landDensity = 2.4 + densityRng.random() * 0.5
		plateDensity.set(
			pid,
			coarse.coarsePlateIsOcean.has(pid) ? oceanDensity : landDensity,
		)
	}

	const coarseMantleField = computeMantleField(
		coarse.coarsePlateVec,
		coarse.coarsePlateSeeds,
		coarse.coarsePlateIsOcean,
		coarse.coarse_r_plate,
		coarse.coarseMesh,
		params.seed,
	)
	const r_mantleUpwelling = projectMantleFieldToRegions(
		coarseMantleField,
		coarse.coarseMesh,
		mesh,
	)

	// 6. Build super plates (skip if < 8 plates)
	let superPlateData = null
	if (params.numPlates >= 8) {
		onProgress?.("Building super plates...", 38)
		superPlateData = withTiming("orogen:super-plates", pipelineTiming, () =>
			buildSuperPlates(
				mesh,
				r_plate,
				plateIds,
				coarse.coarsePlateVec,
				coarse.coarsePlateIsOcean,
				plateDensity,
			),
		)
	}

	// 7. Collision + stress (dual-layer with super plates)
	onProgress?.("Computing tectonic stress...", 46)
	const boundary = withTiming("orogen:collision", pipelineTiming, () =>
		classifyBoundaries(
			mesh,
			r_plate,
			plateIds,
			coarse.coarsePlateVec,
			coarse.coarsePlateIsOcean,
			plateDensity,
			superPlateData,
			params.seed,
			5,
			elevationTiming,
		),
	)

	// 8. Distance fields
	onProgress?.("Propagating distance fields...", 54)
	const distFields = withTiming("orogen:distance-fields", pipelineTiming, () =>
		computeDistanceFields(
			mesh,
			r_plate,
			coarse.coarsePlateIsOcean,
			boundary,
			params.seed,
		),
	)

	// 9. Elevation assignment
	onProgress?.("Assigning elevation...", 62)
	const blendResult = withTiming("orogen:elevation", pipelineTiming, () =>
		blendElevation(
			mesh,
			r_plate,
			coarse.coarsePlateVec,
			coarse.coarsePlateIsOcean,
			distFields,
			boundary,
			params.roughness,
			volcanism,
			params.seed,
			elevationTiming,
		),
	)
	const { elevation, terrainFeatures } = blendResult

	// 10. Hotspot volcanism
	onProgress?.("Applying hotspots...", 70)
	const r_hotspot = withTiming("orogen:hotspots", pipelineTiming, () =>
		params.landCoverage <= 0
			? new Float32Array(mesh.numRegions)
			: applyHotspots(
					mesh,
					plates,
					plateAssignment,
					elevation,
					r_mantleUpwelling,
					terrainFeatures,
					params.seed,
					volcanism,
				),
	)
	clampHotspots(r_hotspot)

	// 11. Peak compression (orogen: Math.pow(elev, 0.92) for positive elevations)
	onProgress?.("Compressing peaks...", 75)
	withTiming("orogen:peak-compression", pipelineTiming, () => {
		applyPeakCompression(elevation, mesh.numRegions)
	})

	return {
		elevation,
		terrainFeatures,
		boundary,
		distFields,
		r_hotspot,
		r_mantleUpwelling,
	}
}

function runStagnantPath(
	mesh: SphereMesh,
	r_plate: Int32Array,
	coarse: ReturnType<typeof generateCoarsePlates>,
	params: OrogenParams,
	volcanism: number,
	pipelineTiming: StageTiming[],
	onProgress?: ProgressFn,
): TectonicPathResult {
	// Build per-region ocean mask from plate classification
	const plateOceanMask = new Uint8Array(mesh.numRegions)
	for (let r = 0; r < mesh.numRegions; r++) {
		if (coarse.coarsePlateIsOcean.has(r_plate[r])) plateOceanMask[r] = 1
	}

	onProgress?.("Generating stagnant lid terrain...", 50)
	const elevation = withTiming("orogen:static-elevation", pipelineTiming, () =>
		generateStaticElevation(
			mesh,
			params.seed,
			params.roughness,
			params.landCoverage,
			volcanism,
			plateOceanMask,
		),
	)

	// Static hotspots (no plate velocity needed)
	onProgress?.("Applying hotspots...", 60)
	const r_hotspot = withTiming("orogen:static-hotspots", pipelineTiming, () =>
		params.landCoverage <= 0
			? new Float32Array(mesh.numRegions)
			: applyStaticHotspots(mesh, elevation, params.seed, volcanism),
	)
	clampHotspots(r_hotspot)

	// Peak compression
	applyPeakCompression(elevation, mesh.numRegions)

	// Dummy boundary/distance data for downstream climate + rivers
	const boundary = buildDummyBoundary(mesh, elevation)
	const distFields = computeSimpleDistanceFields(mesh, elevation)

	return {
		elevation,
		terrainFeatures: undefined,
		boundary,
		distFields,
		r_hotspot,
		r_mantleUpwelling: new Float32Array(mesh.numRegions),
	}
}

export function generateOrogenWorld(
	params: OrogenParams,
	onProgress?: ProgressFn,
): OrogenWorld {
	const rng = createRng(params.seed)
	const volcanism = clampVolcanism(params.volcanism, 1)
	const pipelineTiming: StageTiming[] = []
	const elevationTiming: StageTiming[] = []
	const postTiming: StageTiming[] = []
	console.time("orogen:total")
	onProgress?.("Building sphere mesh...", 5)

	// 1. Build hi-res sphere mesh
	const mesh = withTiming("orogen:mesh", pipelineTiming, () =>
		buildSphereMesh(params.numPoints, params.jitter, rng),
	)

	const tectonicMode = params.tectonicMode ?? "active"

	// Shared mutable state populated by either the active or stagnant path
	let elevation: Float32Array
	let plates: TectonicPlate[]
	let plateAssignment: Int32Array
	let boundary: BoundaryInfo
	let distFields: DistanceFields
	let r_hotspot: Float32Array
	let r_mantleUpwelling: Float32Array
	let terrainFeatures: OrogenTerrainFeatures | undefined

	// ── Shared plate generation (both active and stagnant paths) ──────

	// 2. Generate coarse plates on fixed 20K mesh
	onProgress?.("Generating coarse plates...", 14)
	const coarse = withTiming("orogen:coarse-plates", pipelineTiming, () =>
		generateCoarsePlates(
			params.seed,
			params.numPlates,
			params.landDistribution,
			params.continentSizeVariety,
			params.landCoverage,
		),
	)

	// 3. Project coarse plates → hi-res mesh with FBM noise perturbation
	onProgress?.("Projecting plates...", 24)
	const r_plate = withTiming("orogen:project", pipelineTiming, () =>
		projectCoarsePlates(
			mesh,
			coarse.coarseMesh,
			coarse.coarse_r_plate,
			params.seed,
			params.numPlates,
		),
	)

	// 4. Smooth projected boundaries + reconnect fragments
	const plateIds = Array.from(coarse.coarsePlateSeeds)
	onProgress?.("Smoothing boundaries...", 30)
	withTiming("orogen:smooth-plates", pipelineTiming, () => {
		smoothAndReconnectPlates(mesh, r_plate, plateIds, 3)
	})

	// Build TectonicPlate[] and plateAssignment (shared by both paths)
	const maxSeedId = plateIds.reduce((m, p) => Math.max(m, p), 0)
	const seedToIdx = new Int32Array(maxSeedId + 1).fill(-1)
	plateIds.forEach((pid, idx) => {
		seedToIdx[pid] = idx
	})

	plates = plateIds.map((pid, idx) => {
		const pv = coarse.coarsePlateVec.get(pid)!
		return {
			id: idx,
			isOcean: coarse.coarsePlateIsOcean.has(pid),
			pole: pv.pole,
			omega: pv.omega,
			regions: new Set<number>(),
			growthRate: 1,
			growthDir: [0, 0, 0] as [number, number, number],
			dirStrength: 0,
		}
	})
	plateAssignment = new Int32Array(mesh.numRegions)
	for (let r = 0; r < mesh.numRegions; r++) {
		const idx = seedToIdx[r_plate[r]]
		plateAssignment[r] = idx !== -1 ? idx : 0
	}

	if (tectonicMode === "active") {
		// ── Active plate tectonics path (stages 5–11) ─────────────────────
		;({
			elevation,
			terrainFeatures,
			boundary,
			distFields,
			r_hotspot,
			r_mantleUpwelling,
		} = runActivePath(
			mesh,
			r_plate,
			plates,
			plateIds,
			coarse,
			params,
			volcanism,
			plateAssignment,
			pipelineTiming,
			elevationTiming,
			onProgress,
		))
	} else {
		// ── Stagnant lid path (plates determine land/ocean, noise drives terrain) ──
		;({
			elevation,
			terrainFeatures,
			boundary,
			distFields,
			r_hotspot,
			r_mantleUpwelling,
		} = runStagnantPath(
			mesh,
			r_plate,
			coarse,
			params,
			volcanism,
			pipelineTiming,
			onProgress,
		))
	} // end tectonic mode branch

	// 12. Terrain post-processing (orogen order)
	onProgress?.("Post-processing terrain...", 82)
	withTiming("orogen:post", pipelineTiming, () => {
		// Terrain warp — first, before ocean detection or smoothing
		if (params.terrainWarp > 0) {
			const postStageStart = performance.now()
			warpTerrain(mesh, elevation, params.seed, params.terrainWarp, r_hotspot)
			postTiming.push({
				Stage: `Terrain warp (strength=${params.terrainWarp.toFixed(2)})`,
				ms: (performance.now() - postStageStart).toFixed(1),
			})
		}

		// Build ocean mask from current elevation (after warp)
		const ocean = new Uint8Array(mesh.numRegions)
		for (let r = 0; r < mesh.numRegions; r++) {
			if (elevation[r] <= 0) ocean[r] = 1
		}

		// Bilateral smoothing
		if (params.smoothing > 0) {
			const smoothIters = Math.round(1 + params.smoothing * 4)
			const smoothStr = 0.2 + params.smoothing * 0.5
			const postStageStart = performance.now()
			smoothElevation(mesh, elevation, ocean, smoothIters, smoothStr)
			postTiming.push({
				Stage: `Smoothing (${smoothIters} iters, str=${smoothStr.toFixed(2)})`,
				ms: (performance.now() - postStageStart).toFixed(1),
			})
		}

		// Composite erosion (hydraulic + thermal + glacial interleaved)
		const gIters = Math.round(params.glacialErosion * 10)
		if (
			params.hydraulicErosion > 0 ||
			params.thermalErosion > 0 ||
			gIters > 0
		) {
			const hIters = Math.round(params.hydraulicErosion * 20)
			const hK = params.hydraulicErosion * 0.0006
			const tIters = Math.round(params.thermalErosion * 10)
			const talusSlope = 1.2 - params.thermalErosion * 0.4
			const kThermal = params.thermalErosion * 0.15
			const postStageStart = performance.now()
			erodeComposite(
				mesh,
				elevation,
				ocean,
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
			postTiming.push({
				Stage: `Erosion composite (h=${hIters}, t=${tIters}, g=${gIters})`,
				ms: (performance.now() - postStageStart).toFixed(1),
			})
		}

		// Ridge sharpening
		if (params.ridgeSharpening > 0) {
			const rsIters = Math.round(1 + params.ridgeSharpening * 3)
			const rsStr = params.ridgeSharpening * 0.08
			const postStageStart = performance.now()
			sharpenRidges(mesh, elevation, ocean, rsIters, rsStr)
			postTiming.push({
				Stage: `Ridge sharpening (${rsIters} iters)`,
				ms: (performance.now() - postStageStart).toFixed(1),
			})
		}

		// Always-on soil creep
		const postStageStart = performance.now()
		applySoilCreep(mesh, elevation, ocean, 3, 0.1125)
		postTiming.push({
			Stage: "Soil creep (3 iters)",
			ms: (performance.now() - postStageStart).toFixed(1),
		})

		// Honor exact coverage extremes after all terrain shaping.
		if (params.landCoverage <= 0) {
			for (let r = 0; r < mesh.numRegions; r++) {
				elevation[r] = Math.min(elevation[r], -0.02)
			}
		} else if (params.landCoverage >= 1) {
			for (let r = 0; r < mesh.numRegions; r++) {
				elevation[r] = Math.max(elevation[r], 0.02)
			}
		}
	})

	// Pre-crater land mask — captures tectonic land/ocean boundary before impacts
	const preCraterLand = new Uint8Array(mesh.numRegions)
	for (let r = 0; r < mesh.numRegions; r++) {
		if (elevation[r] > 0) preCraterLand[r] = 1
	}

	// Impact craters (applied after all erosion so they stay crisp)
	if (params.craters && params.craters > 0) {
		onProgress?.("Applying craters...", 83)
		withTiming("orogen:craters", pipelineTiming, () => {
			applyCraters(
				mesh,
				elevation,
				params.seed,
				params.craters,
				params.planetRadiusKm,
			)
		})
	}

	// Convert raw [0,1] elevation to physical km (radius-scaled)
	const maxElevKm = getMaxElevationKm(params.planetRadiusKm)
	const maxDepthKm = getMaxOceanDepthKm(params.planetRadiusKm)
	const elevation_km = new Float32Array(mesh.numRegions)
	for (let r = 0; r < mesh.numRegions; r++) {
		elevation_km[r] = elevToHeightKm(elevation[r], maxElevKm, maxDepthKm)
	}

	// Final land mask — ocean flood-fill determines which below-sea-level cells
	// are connected to the ocean (become ocean) vs enclosed inland basins (stay land).
	const isLand = new Uint8Array(mesh.numRegions)
	{
		const { adjOffset, adjList } = mesh
		// BFS from all pre-crater ocean cells through any cell with elevation <= 0
		const flooded = new Uint8Array(mesh.numRegions)
		const queue: number[] = []
		for (let r = 0; r < mesh.numRegions; r++) {
			if (!preCraterLand[r]) {
				flooded[r] = 1
				queue.push(r)
			}
		}
		let head = 0
		while (head < queue.length) {
			const r = queue[head++]
			for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (!flooded[nb] && elevation[nb] <= 0) {
					flooded[nb] = 1
					queue.push(nb)
				}
			}
		}
		// Land = above sea level OR below sea level but not reached by ocean flood
		for (let r = 0; r < mesh.numRegions; r++) {
			if (!flooded[r]) isLand[r] = 1
		}
	}
	const hotspotExposure = summarizeHotspotExposure(
		r_hotspot,
		preCraterLand,
		isLand,
	)

	const finalCoastDist = withTiming("orogen:coastDist", pipelineTiming, () =>
		computeCoastDistances(mesh, isLand),
	)
	distFields.distCoast = finalCoastDist.distCoast
	distFields.distCoastLand = finalCoastDist.distCoastLand

	// 13. Ocean distance (BFS hop count → km)
	const oceanDist = withTiming("orogen:oceanDist", pipelineTiming, () =>
		computeOceanDistanceBFS(
			mesh,
			isLand,
			meanEdgeLengthKm(mesh, params.planetRadiusKm),
		),
	)
	// 17. Small ocean detection — patches < 0.1% of land become lakes so rivers drain through them
	const smallOcean = new Uint8Array(mesh.numRegions)
	{
		const { adjOffset, adjList } = mesh
		let landCount = 0
		for (let r = 0; r < mesh.numRegions; r++) {
			if (isLand[r]) landCount++
		}
		const minOceanSize = Math.max(1, Math.floor(landCount * 0.001))

		const oceanLabel = new Int32Array(mesh.numRegions).fill(-1)
		let nextLabel = 0
		for (let r = 0; r < mesh.numRegions; r++) {
			if (isLand[r] || oceanLabel[r] >= 0) continue
			const label = nextLabel++
			const oStack = [r]
			oceanLabel[r] = label
			while (oStack.length > 0) {
				const c = oStack.pop()!
				for (let j = adjOffset[c], jEnd = adjOffset[c + 1]; j < jEnd; j++) {
					const nb = adjList[j]
					if (!isLand[nb] && oceanLabel[nb] < 0) {
						oceanLabel[nb] = label
						oStack.push(nb)
					}
				}
			}
		}

		const oceanSize = new Int32Array(nextLabel)
		for (let r = 0; r < mesh.numRegions; r++) {
			if (oceanLabel[r] >= 0) oceanSize[oceanLabel[r]]++
		}

		for (let r = 0; r < mesh.numRegions; r++) {
			if (oceanLabel[r] >= 0 && oceanSize[oceanLabel[r]] < minOceanSize) {
				smallOcean[r] = 1
			}
		}
	}

	// River land mask: isLand + small ocean patches (so rivers drain through them)
	const riverLand = new Uint8Array(mesh.numRegions)
	for (let r = 0; r < mesh.numRegions; r++) {
		riverLand[r] = isLand[r] || smallOcean[r] ? 1 : 0
	}

	// 14–22. Shared post-elevation pipeline (climate → population)
	const post = withTiming("orogen:post-pipeline", pipelineTiming, () =>
		runPostElevationPipeline({
			mesh,
			elevation,
			elevation_km,
			isLand,
			riverLand,
			distCoast: distFields.distCoast,
			oceanDist,
			params,
			tectonicMode: tectonicMode === "active" ? "active" : "stagnant",
			boundary,
			distFields,
			r_hotspot,
			r_mantleUpwelling,
			terrainFeatures,
			enableOceanCurrents: false,
			onProgress,
		}),
	)

	// Mark small ocean cells as lakes in river output
	for (let r = 0; r < mesh.numRegions; r++) {
		if (smallOcean[r]) post.rivers.lakes[r] = 1
	}

	// 23. Nations / cultures (pipeline-only, not in import path)
	let cultures
	let heritages
	let faiths
	let religions
	let nations
	if (post.provinces) {
		if (post.population) {
			nations = withTiming("orogen:nations", pipelineTiming, () =>
				computeNations({
					provinces: post.provinces!,
					coastal: post.coastal,
					riverVisible: post.rivers.visible,
					waterAccess: post.waterAccess,
					habitability: post.population!.habitability,
					r_xyz: mesh.r_xyz,
					seed: params.seed,
					planetRadiusKm: params.planetRadiusKm,
				}),
			)
		}
		withTiming("orogen:cultures", pipelineTiming, () => {
			cultures = computeCultures(post.provinces!, params.seed)
			heritages = computeHeritages(cultures!, params.seed)
			faiths = computeFaiths(cultures!, params.seed)
			religions = computeReligions(faiths!, params.seed)
			cultures!.colors = deriveChildColors({
				childCount: cultures!.count,
				childToParent: heritages!.assignment,
				parentColors: heritages!.colors,
				seed: params.seed + 5101,
			})
			faiths!.colors = deriveChildColors({
				childCount: faiths!.count,
				childToParent: religions!.assignment,
				parentColors: religions!.colors,
				seed: params.seed + 5102,
			})
		})
	}
	post.landmarks = assignLandmarkIdentity({
		mesh,
		landmarks: post.landmarks,
		provinces: post.provinces,
		cultures,
		isLand,
		seed: params.seed,
	})

	const timings = [...pipelineTiming, ...post.timings]
	console.timeEnd("orogen:total")
	console.table(pipelineTiming)
	if (elevationTiming.length > 0) console.table(elevationTiming)
	if (postTiming.length > 0) console.table(postTiming)
	if (post.timings.length > 0) console.table(post.timings)
	onProgress?.("Done", 100)

	return {
		mesh,
		plates,
		plateAssignment,
		boundary,
		distFields,
		elevation,
		terrainFeatures,
		elevation_km,
		params,
		climate: post.climate,
		oceanDist,
		rainfall: post.rainfall,
		hazards: post.hazards,
		volcanism: {
			hotspot: r_hotspot,
			mantleUpwelling: r_mantleUpwelling,
			hotspotExposure,
		},
		climateZones: post.climateZones,
		pastaClimate: post.pastaClimate,
		pastaDebug: post.pastaDebug,
		iceThickness: post.iceThickness,
		iceMinMonthly: post.iceMinMonthly,
		iceMaxMonthly: post.iceMaxMonthly,
		koppenClimate: post.koppenClimate,
		vegetation: post.vegetation,
		topography: post.topography,
		coastal: post.coastal,
		waterAccess: post.waterAccess,
		slopeScore: post.slopeScore,
		dtr_annual: post.dtr_annual,
		dtr_monthly: post.dtr_monthly,
		hydrology: post.hydrology,
		rivers: post.rivers,
		isLand,
		riverLand,
		provinces: post.provinces,
		locations: post.locations,
		nations,
		cultures,
		heritages,
		faiths,
		religions,
		landmarks: post.landmarks,
		population: post.population,
		tradeGoods: post.tradeGoods,
		oceanCurrents: post.oceanCurrents,
		continentCount: countContinents(mesh, isLand),
		monthlyTEQ: post.monthlyTEQ,
		timings,
	}
}
