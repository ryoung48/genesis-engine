/**
 * Heightmap import pipeline: samples a B&W equirectangular heightmap
 * onto a sphere mesh, derives synthetic plates, runs post-processing
 * and climate simulation.
 */
import type { OrogenParams, OrogenWorld, SphereMesh, BoundaryInfo, DistanceFields, OrogenRainfall } from "./types"
import { createRng } from "./rng"
import { buildSphereMesh } from "./mesh"
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
	planetRadiusKm?: number
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

// ── Synthetic plate derivation ─────────────────────────────────────

function deriveSyntheticPlates(
	mesh: SphereMesh,
	elevation: Float32Array,
): { plateAssignment: Int32Array; plateIds: number[]; plateIsOcean: Set<number> } {
	const N = mesh.numRegions
	const r_plate = new Int32Array(N).fill(-1)
	const plateIds: number[] = []
	const plateIsOcean = new Set<number>()
	const { adjOffset, adjList } = mesh

	for (let r = 0; r < N; r++) {
		if (r_plate[r] >= 0) continue
		const isOcean = elevation[r] <= 0
		r_plate[r] = r
		plateIds.push(r)
		if (isOcean) plateIsOcean.add(r)

		const queue = [r]
		let head = 0
		while (head < queue.length) {
			const cur = queue[head++]
			for (let ni = adjOffset[cur], end = adjOffset[cur + 1]; ni < end; ni++) {
				const nb = adjList[ni]
				if (r_plate[nb] >= 0) continue
				if ((elevation[nb] <= 0) === isOcean) {
					r_plate[nb] = r
					queue.push(nb)
				}
			}
		}
	}

	return { plateAssignment: r_plate, plateIds, plateIsOcean }
}

// ── Distance fields (simplified for imports) ───────────────────────

function computeImportDistanceFields(
	mesh: SphereMesh,
	elevation: Float32Array,
): { distCoastLand: Float32Array; distCoast: Float32Array } {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const distCoastLand = new Float32Array(N).fill(Infinity)
	const distCoast = new Float32Array(N).fill(Infinity)

	// Seed: all cells adjacent to the opposite type (land↔ocean boundary)
	const coastQueue: number[] = []
	const landQueue: number[] = []
	for (let r = 0; r < N; r++) {
		const isOcean = elevation[r] <= 0
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			if ((elevation[adjList[j]] <= 0) !== isOcean) {
				distCoast[r] = 0
				coastQueue.push(r)
				if (!isOcean) {
					distCoastLand[r] = 0
					landQueue.push(r)
				}
				break
			}
		}
	}

	// distCoast: BFS through all cells (land + ocean)
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

	// distCoastLand: BFS through land cells only
	head = 0
	while (head < landQueue.length) {
		const r = landQueue[head++]
		const d = distCoastLand[r] + 1
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (d < distCoastLand[nb] && elevation[nb] > 0) {
				distCoastLand[nb] = d
				landQueue.push(nb)
			}
		}
	}

	return { distCoastLand, distCoast }
}

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

	const plates = plateIds.map((pid, idx) => ({
		id: idx,
		isOcean: plateIsOcean.has(pid),
		pole: [0, 0, 1] as [number, number, number],
		omega: 0,
		regions: new Set<number>(),
		growthRate: 1,
		growthDir: [0, 0, 0] as [number, number, number],
		dirStrength: 0,
	}))

	// Simplified boundary / distance fields for downstream consumers
	const mountain_r = new Set<number>()
	const coastline_r = new Set<number>()
	const ocean_r = new Set<number>()
	for (let r = 0; r < mesh.numRegions; r++) {
		if (elevation[r] <= 0) {
			ocean_r.add(r)
		} else if (elevation[r] > 0.5) {
			mountain_r.add(r)
		}
		if (elevation[r] > 0) {
			for (let j = mesh.adjOffset[r], jEnd = mesh.adjOffset[r + 1]; j < jEnd; j++) {
				if (elevation[mesh.adjList[j]] <= 0) {
					coastline_r.add(r)
					break
				}
			}
		}
	}

	const boundary: BoundaryInfo = {
		mountain_r,
		coastline_r,
		ocean_r,
		r_stress: new Float32Array(mesh.numRegions),
		r_subductFactor: new Float32Array(mesh.numRegions),
		r_boundaryType: new Int8Array(mesh.numRegions),
		r_bothOcean: new Uint8Array(mesh.numRegions),
		r_hasOcean: new Uint8Array(mesh.numRegions),
	}

	const importDist = computeImportDistanceFields(mesh, elevation)
	const distFields: DistanceFields = {
		distMountain: new Float32Array(mesh.numRegions),
		distOcean: new Float32Array(mesh.numRegions),
		distCoastline: new Float32Array(mesh.numRegions),
		distCoast: importDist.distCoast,
		distCoastLand: importDist.distCoastLand,
	}

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
		numContinents: 0,
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
		planetRadiusKm: params.planetRadiusKm,
	}
	const landFraction = computeLandFraction(mesh, elevation)
	const climate = computeTemperature(mesh, elevation, landFraction, orogenParams, oceanDist)

	// Moisture advection
	onProgress?.("Computing moisture...", 80)
	const { east: eastAdv, west: westAdv } = computeAdvection(mesh, elevation, distFields.distCoast, climate, params.planetRadiusKm)

	// Rainfall
	onProgress?.("Computing rainfall...", 85)
	const rain = computeMonthlyRain(mesh, elevation, climate, eastAdv, westAdv)
	const rainfall: OrogenRainfall = { monthly: rain.monthly, annual: rain.annual, east: eastAdv, west: westAdv }

	// Rivers
	onProgress?.("Computing rivers...", 90)
	const rivers = computeRivers(mesh, elevation, rainfall, climate)

	// Climate zones
	onProgress?.("Classifying climate zones...", 93)
	const climateZones = assignClimateZones(mesh, elevation, climate)

	// Vegetation
	onProgress?.("Assigning vegetation...", 95)
	const vegetation = assignVegetation(mesh, elevation, climate, rainfall)

	onProgress?.("Done", 100)

	return {
		mesh,
		plates,
		plateAssignment,
		boundary,
		distFields,
		elevation,
		params: orogenParams,
		climate,
		oceanDist,
		rainfall,
		climateZones,
		vegetation,
		rivers,
	}
}
