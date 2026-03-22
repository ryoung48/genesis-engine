/**
 * Orogen pipeline orchestrator: generates a complete tectonic world.
 * Faithful port of orogen's planet-worker.js pipeline order.
 */
import type { OrogenParams, OrogenWorld, PlateVec, SphereMesh } from "./types"
import { createRng } from "./rng"
import { buildSphereMesh } from "./mesh"
import { generateCoarsePlates, projectCoarsePlates } from "./coarse-plates"
import { smoothAndReconnectPlates } from "./plates"
import { buildSuperPlates } from "./super-plates"
import { classifyBoundaries } from "./collision"
import { computeDistanceFields, blendElevation } from "./elevation"
import { applyHotspots } from "./hotspots"
import { computeLandFraction, computeTemperature } from "./climate"
import { computeAdvection, computeMonthlyRain } from "./rain"
import {
	warpTerrain,
	smoothElevation,
	erodeComposite,
	sharpenRidges,
	applySoilCreep,
} from "./erosion"
import { assignVegetation, assignClimateZones } from "./vegetation"
import { computeRivers } from "./rivers"
import { meanEdgeLengthKm } from "./units"
import { countContinents } from "./stats"
import { applyCraters } from "./craters"

type StageTiming = {
	Stage: string
	ms: string
}

type ProgressFn = (label: string, pct?: number) => void

function computeFinalCoastDistances(mesh: SphereMesh, isLand: Uint8Array): {
	distCoast: Float32Array
	distCoastLand: Float32Array
} {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const distCoast = new Float32Array(N).fill(Infinity)
	const distCoastLand = new Float32Array(N).fill(Infinity)

	const coastQueue: number[] = []
	const landQueue: number[] = []
	for (let r = 0; r < N; r++) {
		const rIsLand = isLand[r]
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			if (isLand[adjList[j]] !== rIsLand) {
				distCoast[r] = 0
				coastQueue.push(r)
				if (rIsLand) {
					distCoastLand[r] = 0
					landQueue.push(r)
				}
				break
			}
		}
	}

	let head = 0
	while (head < coastQueue.length) {
		const r = coastQueue[head++]
		const d = distCoast[r] + 1
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (d < distCoast[nb]) {
				distCoast[nb] = d
				coastQueue.push(nb)
			}
		}
	}

	head = 0
	while (head < landQueue.length) {
		const r = landQueue[head++]
		const d = distCoastLand[r] + 1
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (d < distCoastLand[nb] && isLand[nb]) {
				distCoastLand[nb] = d
				landQueue.push(nb)
			}
		}
	}

	return { distCoast, distCoastLand }
}

export function generateOrogenWorld(params: OrogenParams, onProgress?: ProgressFn): OrogenWorld {
	const rng = createRng(params.seed)
	const pipelineTiming: StageTiming[] = []
	const elevationTiming: StageTiming[] = []
	const postTiming: StageTiming[] = []
	console.time("orogen:total")
	onProgress?.("Building sphere mesh...", 5)

	// 1. Build hi-res sphere mesh
	console.time("orogen:mesh")
	let t0 = performance.now()
	const mesh = buildSphereMesh(params.numPoints, params.jitter, rng)
	pipelineTiming.push({ Stage: "Sphere mesh (Fibonacci + Delaunay + pole)", ms: (performance.now() - t0).toFixed(1) })
	console.timeEnd("orogen:mesh")

	// 2. Generate coarse plates on fixed 20K mesh
	console.time("orogen:coarse-plates")
	onProgress?.("Generating coarse plates...", 14)
	t0 = performance.now()
	const coarse = generateCoarsePlates(
		params.seed,
		params.numPlates,
		params.landDistribution,
		params.continentSizeVariety,
		params.landCoverage,
	)
	pipelineTiming.push({
		Stage: `Coarse plates (${params.numPlates} plates, distribution ${params.landDistribution.toFixed(2)})`,
		ms: (performance.now() - t0).toFixed(1),
	})
	console.timeEnd("orogen:coarse-plates")

	// 3. Project coarse plates â†’ hi-res mesh with FBM noise perturbation
	console.time("orogen:project")
	onProgress?.("Projecting plates...", 24)
	t0 = performance.now()
	const r_plate = projectCoarsePlates(
		mesh, coarse.coarseMesh, coarse.coarse_r_plate, params.seed, params.numPlates,
	)
	pipelineTiming.push({ Stage: "Project coarse  hi-res", ms: (performance.now() - t0).toFixed(1) })
	console.timeEnd("orogen:project")

	// 4. Smooth projected boundaries + reconnect fragments
	console.time("orogen:smooth-plates")
	onProgress?.("Smoothing boundaries...", 30)
	t0 = performance.now()
	smoothAndReconnectPlates(mesh, r_plate, Array.from(coarse.coarsePlateSeeds), 3)
	pipelineTiming.push({ Stage: "Smooth projected plates", ms: (performance.now() - t0).toFixed(1) })
	console.timeEnd("orogen:smooth-plates")

	// 5. Plate density (ocean: 3.0â€“3.5, land: 2.4â€“2.9)
	// plateIds are region indices from the coarse mesh (sparse IDs matching source)
	const plateIds = Array.from(coarse.coarsePlateSeeds)
	const plateDensity = new Map<number, number>()
	const densityRng = createRng(params.seed + 777)
	for (const pid of plateIds) {
		const oceanDensity = 3.0 + densityRng.random() * 0.5
		const landDensity = 2.4 + densityRng.random() * 0.5
		plateDensity.set(pid, coarse.coarsePlateIsOcean.has(pid) ? oceanDensity : landDensity)
	}

	// 6. Build super plates (skip if < 8 plates)
	let superPlateData = null
	if (params.numPlates >= 8) {
		console.time("orogen:super-plates")
		onProgress?.("Building super plates...", 38)
		t0 = performance.now()
		superPlateData = buildSuperPlates(
			mesh, r_plate, plateIds,
			coarse.coarsePlateVec, coarse.coarsePlateIsOcean, plateDensity,
		)
		pipelineTiming.push({
			Stage: `Super plates (${superPlateData.numSuperPlates} groups from ${params.numPlates} plates)`,
			ms: (performance.now() - t0).toFixed(1),
		})
		console.timeEnd("orogen:super-plates")
	}

	// Build TectonicPlate[] for compatibility with hotspots and renderer
	// Map region-index plate IDs to ordinal indices for array access
	const seedToIdx = new Map<number, number>()
	plateIds.forEach((pid, idx) => seedToIdx.set(pid, idx))

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
	// Build a plateAssignment that maps to ordinal plate indices (for hotspots)
	const plateAssignment = new Int32Array(mesh.numRegions)
	for (let r = 0; r < mesh.numRegions; r++) {
		plateAssignment[r] = seedToIdx.get(r_plate[r]) ?? 0
	}

	// 7. Collision + stress (dual-layer with super plates)
	console.time("orogen:collision")
	onProgress?.("Computing tectonic stress...", 46)
	t0 = performance.now()
	const boundary = classifyBoundaries(
		mesh, r_plate, plateIds,
		coarse.coarsePlateVec, coarse.coarsePlateIsOcean,
		plateDensity, superPlateData, params.seed, 5, elevationTiming,
	)
	console.timeEnd("orogen:collision")

	// 8. Distance fields
	console.time("orogen:distance-fields")
	onProgress?.("Propagating distance fields...", 54)
	let elevationStageStart = performance.now()
	const distFields = computeDistanceFields(
		mesh, r_plate, coarse.coarsePlateIsOcean, boundary, params.seed,
	)
	elevationTiming.push({ Stage: "Distance fields (6x BFS)", ms: (performance.now() - elevationStageStart).toFixed(1) })
	console.timeEnd("orogen:distance-fields")

	// 9. Elevation assignment
	console.time("orogen:elevation")
	onProgress?.("Assigning elevation...", 62)
	const elevation = blendElevation(
		mesh, r_plate, coarse.coarsePlateVec, coarse.coarsePlateIsOcean,
		plateIds, distFields, boundary,
		params.roughness, params.seed, elevationTiming,
	)
	pipelineTiming.push({
		Stage: "Elevation (collisions + stress + distance fields + assignment)",
		ms: (performance.now() - t0).toFixed(1),
	})
	console.timeEnd("orogen:elevation")

	// 10. Hotspot volcanism
	console.time("orogen:hotspots")
	onProgress?.("Applying hotspots...", 70)
	elevationStageStart = performance.now()
	const r_hotspot = params.landCoverage <= 0
		? new Uint8Array(mesh.numRegions)
		: applyHotspots(mesh, plates, plateAssignment, elevation, params.seed)
	elevationTiming.push({ Stage: "Hotspot volcanism", ms: (performance.now() - elevationStageStart).toFixed(1) })
	console.timeEnd("orogen:hotspots")

	// 11. Peak compression (orogen: Math.pow(elev, 0.92) for positive elevations)
	console.time("orogen:peak-compression")
	onProgress?.("Compressing peaks...", 75)
	elevationStageStart = performance.now()
	for (let r = 0; r < mesh.numRegions; r++) {
		if (elevation[r] > 0) elevation[r] = Math.pow(elevation[r], 0.92)
	}
	elevationTiming.push({ Stage: "Peak compression", ms: (performance.now() - elevationStageStart).toFixed(1) })
	console.timeEnd("orogen:peak-compression")

	// 12. Terrain post-processing (orogen order)
	console.time("orogen:post")
	onProgress?.("Post-processing terrain...", 82)
	t0 = performance.now()

	// Terrain warp â€” first, before ocean detection or smoothing
	if (params.terrainWarp > 0) {
		const postStageStart = performance.now()
		warpTerrain(mesh, elevation, params.seed, params.terrainWarp, r_hotspot)
		postTiming.push({
			Stage: `Terrain warp (strength=${params.terrainWarp.toFixed(2)})`,
			ms: (performance.now() - postStageStart).toFixed(1),
		})
	}

	// Build ocean mask from current elevation (after warp)
	const r_isOcean = new Uint8Array(mesh.numRegions)
	for (let r = 0; r < mesh.numRegions; r++) {
		if (elevation[r] <= 0) r_isOcean[r] = 1
	}

	// Bilateral smoothing
	if (params.smoothing > 0) {
		const smoothIters = Math.round(1 + params.smoothing * 4)
		const smoothStr = 0.2 + params.smoothing * 0.5
		const postStageStart = performance.now()
		smoothElevation(mesh, elevation, r_isOcean, smoothIters, smoothStr)
		postTiming.push({
			Stage: `Smoothing (${smoothIters} iters, str=${smoothStr.toFixed(2)})`,
			ms: (performance.now() - postStageStart).toFixed(1),
		})
	}

	// Composite erosion (hydraulic + thermal + glacial interleaved)
	const gIters = Math.round(params.glacialErosion * 10)
	if (params.hydraulicErosion > 0 || params.thermalErosion > 0 || gIters > 0) {
		const hIters = Math.round(params.hydraulicErosion * 20)
		const hK = params.hydraulicErosion * 0.0006
		const tIters = Math.round(params.thermalErosion * 10)
		const talusSlope = 1.2 - params.thermalErosion * 0.4
		const kThermal = params.thermalErosion * 0.15
		const postStageStart = performance.now()
		erodeComposite(
			mesh, elevation, r_isOcean,
			hIters, hK, 0.5, 1.0,
			tIters, talusSlope, kThermal,
			gIters, params.glacialErosion,
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
		sharpenRidges(mesh, elevation, r_isOcean, rsIters, rsStr)
		postTiming.push({
			Stage: `Ridge sharpening (${rsIters} iters)`,
			ms: (performance.now() - postStageStart).toFixed(1),
		})
	}

	// Always-on soil creep
	const postStageStart = performance.now()
	applySoilCreep(mesh, elevation, r_isOcean, 3, 0.1125)
	postTiming.push({ Stage: "Soil creep (3 iters)", ms: (performance.now() - postStageStart).toFixed(1) })

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

	pipelineTiming.push({ Stage: "Terrain post-processing (total)", ms: (performance.now() - t0).toFixed(1) })
	console.timeEnd("orogen:post")

	// Pre-crater land mask — captures tectonic land/ocean boundary before impacts
	const preCraterLand = new Uint8Array(mesh.numRegions)
	for (let r = 0; r < mesh.numRegions; r++) {
		if (elevation[r] > 0) preCraterLand[r] = 1
	}

	// Impact craters (applied after all erosion so they stay crisp)
	if (params.craters && params.craters > 0) {
		console.time("orogen:craters")
		onProgress?.("Applying craters...", 83)
		t0 = performance.now()
		applyCraters(mesh, elevation, params.seed, params.craters)
		pipelineTiming.push({ Stage: `Craters (intensity=${params.craters.toFixed(2)})`, ms: (performance.now() - t0).toFixed(1) })
		console.timeEnd("orogen:craters")
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

    console.time("orogen:coastDist")
    t0 = performance.now()
    const finalCoastDist = computeFinalCoastDistances(mesh, isLand)
    distFields.distCoast = finalCoastDist.distCoast
    distFields.distCoastLand = finalCoastDist.distCoastLand
    pipelineTiming.push({ Stage: "Final coast distance (BFS)", ms: (performance.now() - t0).toFixed(1) })
    console.timeEnd("orogen:coastDist")
	// 13. Ocean distance (BFS hop count â†’ km)
	console.time("orogen:oceanDist")
	t0 = performance.now()
	const oceanDist = new Float32Array(mesh.numRegions)
	{
		const { adjOffset, adjList } = mesh
		// Average edge length on unit sphere â†’ km (Earth radius)
		const avgEdgeKm = meanEdgeLengthKm(mesh, params.planetRadiusKm)

		// BFS from all ocean cells simultaneously
		const visited = new Uint8Array(mesh.numRegions)
		const queue: number[] = []
		const hops = new Int32Array(mesh.numRegions)
		for (let r = 0; r < mesh.numRegions; r++) {
			if (!isLand[r]) {
				visited[r] = 1
				queue.push(r)
				// oceanDist stays 0 for ocean cells
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
	pipelineTiming.push({ Stage: "Ocean distance (BFS)", ms: (performance.now() - t0).toFixed(1) })
	console.timeEnd("orogen:oceanDist")

	// 14. Climate â€” EBM temperature + continentality
	console.time("orogen:climate")
	onProgress?.("Computing climate...", 93)
	t0 = performance.now()
	const landFraction = computeLandFraction(mesh, isLand)
	const climate = computeTemperature(mesh, elevation, landFraction, params, oceanDist)
	pipelineTiming.push({ Stage: "EBM temperature", ms: (performance.now() - t0).toFixed(1) })
	console.timeEnd("orogen:climate")

	// 15. Moisture advection
	console.time("orogen:advection")
	onProgress?.("Computing moisture advection...", 95)
	t0 = performance.now()
	const { east: eastAdv, west: westAdv } = computeAdvection(mesh, elevation, distFields.distCoast, climate, params, isLand)
	pipelineTiming.push({ Stage: "Moisture advection", ms: (performance.now() - t0).toFixed(1) })
	console.timeEnd("orogen:advection")

	// 16. Monthly rainfall
	console.time("orogen:rainfall")
	onProgress?.("Computing rainfall...", 97)
	t0 = performance.now()
	const rain = computeMonthlyRain(mesh, climate, eastAdv, westAdv, isLand, params)
	const rainfall = { monthly: rain.monthly, annual: rain.annual, east: eastAdv, west: westAdv }
	pipelineTiming.push({ Stage: "Monthly rainfall", ms: (performance.now() - t0).toFixed(1) })
	console.timeEnd("orogen:rainfall")

	// 17. Detect small ocean patches (< 0.1% of land area) — these become lakes.
	// Build a riverLand mask that includes them so drainage flows THROUGH them.
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

	console.time("orogen:rivers")
	onProgress?.("Computing rivers...", 97)
	t0 = performance.now()
	const rivers = computeRivers(mesh, elevation, rainfall, climate, riverLand)
	pipelineTiming.push({ Stage: "Rivers", ms: (performance.now() - t0).toFixed(1) })
	console.timeEnd("orogen:rivers")

	// Mark small ocean cells as lakes in the river output
	for (let r = 0; r < mesh.numRegions; r++) {
		if (smallOcean[r]) rivers.lakes[r] = 1
	}

	// 18. Climate zone assignment
	console.time("orogen:climateZones")
	onProgress?.("Classifying climate zones...", 98)
	t0 = performance.now()
	const climateZones = assignClimateZones(mesh, isLand, climate)
	pipelineTiming.push({ Stage: "Climate zone assignment", ms: (performance.now() - t0).toFixed(1) })
	console.timeEnd("orogen:climateZones")

	// 19. Vegetation assignment
	console.time("orogen:vegetation")
	onProgress?.("Assigning vegetation...", 99)
	t0 = performance.now()
	const vegetation = assignVegetation(mesh, isLand, climate, rainfall)
	pipelineTiming.push({ Stage: "Vegetation assignment", ms: (performance.now() - t0).toFixed(1) })
	console.timeEnd("orogen:vegetation")

	console.timeEnd("orogen:total")
	onProgress?.("Done", 100)

	return {
		mesh,
		plates,
		plateAssignment,
		boundary,
		distFields,
		elevation,
		params,
		climate,
		oceanDist,
		rainfall,
		climateZones,
		vegetation,
		rivers,
		isLand,
		riverLand,
		continentCount: countContinents(mesh, isLand),
	}
}
