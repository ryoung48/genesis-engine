/**
 * Genesis pipeline orchestrator: generates a complete tectonic world.
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
import { buildSphereMesh } from "../mesh"
import { createRng } from "../shared/rng"
import {
	computeCoastDistances,
	computeOceanDistanceBFS,
	countContinents,
} from "../shared/stats"
import { getMaxOceanDepthKm, meanEdgeLengthKm } from "../shared/units"
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
import { buildSuperPlates } from "../tectonics/super-plates"
import { applyCraters } from "../terrain/craters"
import { blendElevation, computeDistanceFields } from "../terrain/elevation"
import {
	applySoilCreep,
	erodeComposite,
	sharpenRidges,
	smoothElevation,
	warpTerrain,
} from "../terrain/erosion"
import { applyHotspots } from "../terrain/hotspots"
import { applySeaLevelToElevation } from "../terrain/sea-level"
import { deriveProvinceSociety } from "./derive-province-society"
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
		superPlateData = withTiming("super-plates", pipelineTiming, () =>
			buildSuperPlates(
				mesh,
				r_plate,
				plateIds,
				coarse.coarsePlateVec,
				coarse.coarsePlateIsOcean,
				plateDensity,
			),
		)
		onProgress?.("super-plates", 12)
	}

	// 7. Collision + stress (dual-layer with super plates)
	const boundary = withTiming("collision", pipelineTiming, () =>
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
	onProgress?.("collision", 14)

	// 8. Distance fields
	const distFields = withTiming("distance-fields", pipelineTiming, () =>
		computeDistanceFields(
			mesh,
			r_plate,
			coarse.coarsePlateIsOcean,
			boundary,
			params.seed,
		),
	)
	onProgress?.("distance-fields", 16)

	// 9. Elevation assignment
	const blendResult = withTiming("elevation", pipelineTiming, () =>
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
	onProgress?.("elevation", 26)

	// 10. Hotspot volcanism
	const r_hotspot = withTiming("hotspots", pipelineTiming, () =>
		volcanism <= 0
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
	onProgress?.("hotspots", 29)

	// 11. Peak compression (Math.pow(elev, 0.92) for positive elevations)
	withTiming("peak-compression", pipelineTiming, () => {
		applyPeakCompression(elevation, mesh.numRegions)
	})
	onProgress?.("peak-compression", 29)

	return {
		elevation,
		terrainFeatures,
		boundary,
		distFields,
		r_hotspot,
		r_mantleUpwelling,
	}
}

export function generateOrogenWorld(
	params: OrogenParams,
	onProgress?: ProgressFn,
): OrogenWorld {
	const rng = createRng(params.seed)
	const volcanism = params.volcanism ?? 1
	const pipelineTiming: StageTiming[] = []
	const elevationTiming: StageTiming[] = []
	const postTiming: StageTiming[] = []
	console.time("total")
	onProgress?.("Building sphere mesh...", 5)

	// 1. Build hi-res sphere mesh
	const mesh = withTiming("mesh", pipelineTiming, () =>
		buildSphereMesh(params.numPoints, params.jitter, rng),
	)
	onProgress?.("mesh", 3)

	// Mutable state for the active plate tectonics pipeline
	let elevation: Float32Array
	let plateAssignment: Int32Array
	let boundary: BoundaryInfo
	let distFields: DistanceFields
	let r_hotspot: Float32Array
	let r_mantleUpwelling: Float32Array
	let terrainFeatures: OrogenTerrainFeatures | undefined

	// 2. Generate coarse plates on fixed 20K mesh
	onProgress?.("coarse-plates", 5)
	const coarse = withTiming("coarse-plates", pipelineTiming, () =>
		generateCoarsePlates(
			params.seed,
			params.numPlates,
			params.landDistribution,
			params.continentSizeVariety,
			params.landCoverage,
		),
	)

	// 3. Project coarse plates → hi-res mesh with FBM noise perturbation
	onProgress?.("project", 11)
	const r_plate = withTiming("project", pipelineTiming, () =>
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
	onProgress?.("smooth-plates", 12)
	withTiming("smooth-plates", pipelineTiming, () => {
		smoothAndReconnectPlates(mesh, r_plate, plateIds, 3)
	})

	// Build TectonicPlate[] and plateAssignment
	const maxSeedId = plateIds.reduce((m, p) => Math.max(m, p), 0)
	const seedToIdx = new Int32Array(maxSeedId + 1).fill(-1)
	plateIds.forEach((pid, idx) => {
		seedToIdx[pid] = idx
	})

	const plates = plateIds.map((pid, idx) => {
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
	// 5–11. Active plate tectonics pipeline
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

	// 12. Terrain post-processing (orogen order)
	withTiming("post", pipelineTiming, () => {
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
		if (params.landCoverage <= 0 && volcanism <= 0) {
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
		withTiming("craters", pipelineTiming, () => {
			applyCraters(
				mesh,
				elevation,
				params.seed,
				params.craters,
				params.planetRadiusKm,
			)
		})
		onProgress?.("craters", 39)
	}

	const maxElevKm = (params.maxElevation ?? 6000) / 1000
	const maxDepthKm = getMaxOceanDepthKm(params.planetRadiusKm)
	const baseElevation = elevation.slice()
	const { elevation: finalElevation, elevation_km } = applySeaLevelToElevation({
		baseElevation,
		maxElevKm,
		maxDepthKm,
		seaLevel: params.seaLevel,
	})
	elevation.set(finalElevation)
	const emergedLand = new Uint8Array(mesh.numRegions)
	for (let r = 0; r < mesh.numRegions; r++) {
		if (baseElevation[r] <= 0 && elevation_km[r] > 0) emergedLand[r] = 1
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
			// Seed only from cells that are ocean *after* sea-level adjustment.
			// preCraterLand captures the pre-adjustment boundary; if sea level
			// dropped, some former ocean cells are now above sea level and must
			// not be seeded as flooded (they should become land).
			if (!preCraterLand[r] && elevation[r] <= 0) {
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
	const finalCoastDist = withTiming("coastDist", pipelineTiming, () =>
		computeCoastDistances(mesh, isLand),
	)
	distFields.distCoast = finalCoastDist.distCoast
	distFields.distCoastLand = finalCoastDist.distCoastLand
	onProgress?.("coastDist", 39)

	// 13. Ocean distance (BFS hop count → km)
	const oceanDist = withTiming("oceanDist", pipelineTiming, () =>
		computeOceanDistanceBFS(
			mesh,
			isLand,
			meanEdgeLengthKm(mesh, params.planetRadiusKm),
		),
	)
	onProgress?.("oceanDist", 39)
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
	const post = withTiming("post-pipeline", pipelineTiming, () =>
		runPostElevationPipeline({
			mesh,
			elevation,
			elevation_km,
			isLand,
			riverLand,
			distCoast: distFields.distCoast,
			oceanDist,
			params,
			emergedLand,
			tectonicMode: "active" as const,
			boundary,
			distFields,
			r_hotspot,
			r_mantleUpwelling,
			terrainFeatures,
			enableOceanCurrents: true,
			onProgress,
		}),
	)
	onProgress?.("post-pipeline", 70)

	// Summarise hotspot exposure using the final isLand (after post-elevation
	// lake clearing) so the stored count stays consistent with world.isLand.
	const hotspotExposure = summarizeHotspotExposure(
		r_hotspot,
		preCraterLand,
		isLand,
	)

	const provinceSociety = deriveProvinceSociety({
		mesh,
		params,
		post,
		isLand,
	})
	pipelineTiming.push(...provinceSociety.timings)
	onProgress?.("cultures", 77)

	const timings = [...pipelineTiming, ...post.timings]
	console.timeEnd("total")
	console.table(pipelineTiming)
	if (elevationTiming.length > 0) console.table(elevationTiming)
	if (postTiming.length > 0) console.table(postTiming)
	if (post.timings.length > 0) console.table(post.timings)

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
		cycloneRisk: post.cycloneRisk,
		tornadoRisk: post.tornadoRisk,
		tidalRange: post.tidalRange,
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
		riverAccess: post.riverAccess,
		lakeAccess: post.lakeAccess,
		slopeScore: post.slopeScore,
		dtr_annual: post.dtr_annual,
		dtr_monthly: post.dtr_monthly,
		hydrology: post.hydrology,
		rivers: post.rivers,
		isLand,
		riverLand,
		provinces: post.provinces,
		locations: post.locations,
		nations: provinceSociety.nations,
		cultures: provinceSociety.cultures,
		heritages: provinceSociety.heritages,
		faiths: provinceSociety.faiths,
		religions: provinceSociety.religions,
		landmarks: provinceSociety.landmarks,
		population: post.population,
		tradeGoods: post.tradeGoods,
		settlementRegions: provinceSociety.settlementRegions,
		settlementWaterLandmarks: provinceSociety.settlementWaterLandmarks,
		settlementPortRegions: provinceSociety.settlementPortRegions,
		oceanCurrents: post.oceanCurrents,
		continentCount: countContinents(mesh, isLand),
		monthlyTEQ: post.monthlyTEQ,
		timings,
	}
}
