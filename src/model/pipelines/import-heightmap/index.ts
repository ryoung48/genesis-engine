import type {
	GenesisParams,
	GenesisWorld,
	SphereMesh,
	StageTiming,
} from "@/model"
import { STAR } from "@/model/celestial/star"
import { HUMIDITY } from "@/model/climate/humidity"
import { KOPPEN } from "@/model/climate/koppen"
import { OBSERVED_EARTH } from "@/model/climate/observed-earth"
import { buildRegionSpatialIndex, buildSphereMesh } from "@/model/mesh"
import { DERIVE_PROVINCE_SOCIETY } from "@/model/pipelines/derive-province-society"
import type {
	ImportGenesisWorldParams,
	MatchRealLakeNamesParams,
	MergeEu4LandMaskParams,
	PointInRingParams,
	RealProvinceInput,
	RealRiverLineInput,
	ReconcileElevationWithMaskParams,
	SampleBilinearParams,
	SampleCategoricalRasterParams,
	SampleCoastlineMaskParams,
	SampleHeightmapParams,
	SampleSingleBandFloatRasterParams,
} from "@/model/pipelines/import-heightmap/types"
import { POST_ELEVATION } from "@/model/pipelines/post-elevation"
import { RNG } from "@/model/shared/rng"
import { STATS } from "@/model/shared/stats"
import { UNITS } from "@/model/shared/units"
import { SYNTHETIC_PLATES } from "@/model/tectonics/synthetic-plates"
import { COAST_DENSITY } from "@/model/terrain/coast-density"
import { EROSION } from "@/model/terrain/erosion"
import { LANDMARKS } from "@/model/terrain/landmarks"
import { SEA_LEVEL } from "@/model/terrain/sea-level"

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

function sampleBilinear({
	pixels,
	imgW,
	imgH,
	px,
	py,
}: SampleBilinearParams): number {
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

function sampleHeightmap({
	mesh,
	grayscale,
	imgW,
	imgH,
}: SampleHeightmapParams): Float32Array {
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

		const gray = sampleBilinear({ pixels: grayscale, imgW, imgH, px, py })
		elevation[r] = grayscaleToElevation(gray)
	}

	return elevation
}

function sampleSingleBandFloatRaster({
	mesh,
	raster,
	rasterW,
	rasterH,
	scale,
	nodata,
}: SampleSingleBandFloatRasterParams): Float32Array {
	const N = mesh.numRegions
	const { r_xyz } = mesh
	const out = new Float32Array(N)

	for (let r = 0; r < N; r++) {
		const x = r_xyz[3 * r]
		const y = r_xyz[3 * r + 1]
		const z = r_xyz[3 * r + 2]

		const lat = Math.asin(Math.max(-1, Math.min(1, z)))
		const lon = Math.atan2(y, x)
		const px = (lon / Math.PI + 1) * 0.5 * rasterW
		const py = (0.5 - lat / Math.PI) * rasterH

		const x0 = Math.floor(px)
		const y0 = Math.floor(py)
		const x1 = (x0 + 1) % rasterW
		const y1 = Math.min(y0 + 1, rasterH - 1)
		const fx = px - x0
		const fy = py - y0
		const xi0 = (((x0 % rasterW) + rasterW) % rasterW) | 0
		const yi0 = Math.max(0, Math.min(rasterH - 1, y0)) | 0

		const q00 = raster[yi0 * rasterW + xi0]
		const q10 = raster[yi0 * rasterW + x1]
		const q01 = raster[y1 * rasterW + xi0]
		const q11 = raster[y1 * rasterW + x1]
		const v00 = q00 === nodata ? NaN : q00 * scale
		const v10 = q10 === nodata ? NaN : q10 * scale
		const v01 = q01 === nodata ? NaN : q01 * scale
		const v11 = q11 === nodata ? NaN : q11 * scale

		let weighted = 0
		let weightSum = 0
		if (Number.isFinite(v00)) {
			const w = (1 - fx) * (1 - fy)
			weighted += v00 * w
			weightSum += w
		}
		if (Number.isFinite(v10)) {
			const w = fx * (1 - fy)
			weighted += v10 * w
			weightSum += w
		}
		if (Number.isFinite(v01)) {
			const w = (1 - fx) * fy
			weighted += v01 * w
			weightSum += w
		}
		if (Number.isFinite(v11)) {
			const w = fx * fy
			weighted += v11 * w
			weightSum += w
		}

		out[r] = weightSum > 0 ? weighted / weightSum : NaN
	}

	return out
}

function attachObservedEarthHumidity(params: {
	mesh: SphereMesh
	world: {
		climate: GenesisWorld["climate"]
		observedHumidity?: GenesisWorld["observedHumidity"]
	}
	realVaporPressureMonthly: Int16Array
	realVaporPressureWidth: number
	realVaporPressureHeight: number
	realVaporPressureMonths: number
	realVaporPressureScale: number
	realVaporPressureNoData: number
}): void {
	const {
		mesh,
		world,
		realVaporPressureMonthly,
		realVaporPressureWidth,
		realVaporPressureHeight,
		realVaporPressureMonths,
		realVaporPressureScale,
		realVaporPressureNoData,
	} = params
	if (realVaporPressureMonths !== 12 || !world.climate.real_temperature_monthly)
		return

	const N = mesh.numRegions
	const observedVaporPressureMonthly = OBSERVED_EARTH.sampleMonthlyFloatRaster({
		mesh,
		raster: realVaporPressureMonthly,
		rasterW: realVaporPressureWidth,
		rasterH: realVaporPressureHeight,
		months: realVaporPressureMonths,
		scale: realVaporPressureScale,
		nodata: realVaporPressureNoData,
	})
	const observedMonthly = new Float32Array(N * realVaporPressureMonths)
	const observedAnnual = new Float32Array(N)

	for (let r = 0; r < N; r++) {
		let observedSum = 0
		let observedCount = 0
		for (let month = 0; month < realVaporPressureMonths; month++) {
			const idx = month * N + r
			const vaporPressure = observedVaporPressureMonthly[idx]
			const meanTemp = world.climate.real_temperature_monthly[idx]
			if (Number.isFinite(vaporPressure) && Number.isFinite(meanTemp)) {
				const observed = HUMIDITY.relativeHumidityFromVaporPressure({
					meanTempC: meanTemp,
					vaporPressureKpa: vaporPressure,
				})
				observedMonthly[idx] = observed
				observedSum += observed
				observedCount++
			} else {
				observedMonthly[idx] = NaN
			}
		}
		observedAnnual[r] = observedCount > 0 ? observedSum / observedCount : NaN
	}

	world.observedHumidity = {
		real_monthly: observedMonthly,
		real_annual: observedAnnual,
	}
}

function sampleCoastlineMask({
	mesh,
	mask,
	maskW,
	maskH,
}: SampleCoastlineMaskParams): Uint8Array {
	const N = mesh.numRegions
	const { r_xyz } = mesh
	const isLand = new Uint8Array(N)

	for (let r = 0; r < N; r++) {
		const x = r_xyz[3 * r]
		const y = r_xyz[3 * r + 1]
		const z = r_xyz[3 * r + 2]

		const lat = Math.asin(Math.max(-1, Math.min(1, z)))
		const lon = Math.atan2(y, x)

		const px = ((((lon / Math.PI + 1) * 0.5 * maskW) % maskW) + maskW) % maskW
		const py = Math.max(0, Math.min(maskH - 1, (0.5 - lat / Math.PI) * maskH))

		const xi = Math.min(maskW - 1, Math.round(px))
		const yi = Math.min(maskH - 1, Math.round(py))
		isLand[r] = mask[yi * maskW + xi] >= 128 ? 1 : 0
	}

	return isLand
}

function sampleCategoricalRaster({
	mesh,
	raster,
	rasterW,
	rasterH,
	nodata,
}: SampleCategoricalRasterParams): Int16Array {
	const N = mesh.numRegions
	const { r_xyz } = mesh
	const out = new Int16Array(N)

	for (let r = 0; r < N; r++) {
		const x = r_xyz[3 * r]
		const y = r_xyz[3 * r + 1]
		const z = r_xyz[3 * r + 2]

		const lat = Math.asin(Math.max(-1, Math.min(1, z)))
		const lon = Math.atan2(y, x)

		const px =
			((((lon / Math.PI + 1) * 0.5 * rasterW) % rasterW) + rasterW) % rasterW
		const py = Math.max(
			0,
			Math.min(rasterH - 1, (0.5 - lat / Math.PI) * rasterH),
		)

		const xi = Math.min(rasterW - 1, Math.round(px))
		const yi = Math.min(rasterH - 1, Math.round(py))
		const value = raster[yi * rasterW + xi]
		out[r] = value === nodata ? -1 : value
	}

	return out
}

function reconcileElevationWithMask({
	elevation,
	maskIsLand,
	epsilon,
}: ReconcileElevationWithMaskParams): void {
	for (let r = 0; r < elevation.length; r++) {
		if (maskIsLand[r]) {
			if (elevation[r] <= 0) elevation[r] = epsilon
		} else {
			if (elevation[r] > 0) elevation[r] = -epsilon
		}
	}
}

function buildRealRiversData(
	mesh: SphereMesh,
	lines: RealRiverLineInput[],
	elevation_km: Float32Array,
	planetRadiusKm: number,
): {
	lines: [number, number, number, number][][]
	visible: Uint8Array
	riverId: Int32Array
	riverLengthKm: Float32Array
	riverNames: (string | null)[]
	minFlow: number
	maxFlow: number
} {
	const N = mesh.numRegions
	const visible = new Uint8Array(N)
	const riverId = new Int32Array(N).fill(-1)
	const riverLengthKm = new Float32Array(N)
	const index = buildRegionSpatialIndex(mesh)

	let maxStroke = 0
	for (const line of lines) maxStroke = Math.max(maxStroke, line.strokeweig)
	if (maxStroke <= 0) maxStroke = 1

	const outLines: [number, number, number, number][][] = []

	lines.forEach((line, lineIdx) => {
		const numPoints = line.points.length / 2
		if (numPoints < 2) return

		// Flow is a rendering-only proxy derived from Natural Earth's
		// strokeweig (there's no real discharge simulation here) — scaled
		// into a plausible-looking m3/s-ish range so line-width normalization
		// (which expects flow-like magnitudes) still produces sensible output.
		const flow = (line.strokeweig / maxStroke) * 5000

		const quad: [number, number, number, number][] = []
		let lengthKm = 0
		let prevXyz: [number, number, number] | null = null
		for (let i = 0; i < numPoints; i++) {
			const lonDeg = line.points[2 * i]
			const latDeg = line.points[2 * i + 1]
			const lonR = (lonDeg * Math.PI) / 180
			const latR = (latDeg * Math.PI) / 180
			const cosLat = Math.cos(latR)
			const xyz: [number, number, number] = [
				cosLat * Math.cos(lonR),
				cosLat * Math.sin(lonR),
				Math.sin(latR),
			]
			if (prevXyz) {
				const dx = xyz[0] - prevXyz[0]
				const dy = xyz[1] - prevXyz[1]
				const dz = xyz[2] - prevXyz[2]
				lengthKm += Math.sqrt(dx * dx + dy * dy + dz * dz) * planetRadiusKm
			}
			prevXyz = xyz

			const region = index.nearest(lonDeg, latDeg)
			const elevKm = region >= 0 ? elevation_km[region] : 0
			quad.push([lonDeg, latDeg, flow, elevKm])

			if (region >= 0) {
				visible[region] = 1
				riverId[region] = lineIdx
			}
		}
		outLines.push(quad)

		for (let i = 0; i < numPoints; i++) {
			const region = index.nearest(line.points[2 * i], line.points[2 * i + 1])
			if (region >= 0) riverLengthKm[region] = lengthKm
		}
	})

	let minFlow = Infinity
	let maxFlow = 0
	for (const line of outLines)
		for (const [, , flow] of line) {
			minFlow = Math.min(minFlow, flow)
			maxFlow = Math.max(maxFlow, flow)
		}
	if (!Number.isFinite(minFlow)) minFlow = 0

	const riverNames = lines.map((line) => line.name ?? null)

	return {
		lines: outLines,
		visible,
		riverId,
		riverLengthKm,
		riverNames,
		minFlow,
		maxFlow: maxFlow || 1,
	}
}

function pointInRing({ lonDeg, latDeg, ring }: PointInRingParams): boolean {
	let inside = false
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const [xi, yi] = ring[i]
		const [xj, yj] = ring[j]
		const intersects =
			yi > latDeg !== yj > latDeg &&
			lonDeg < ((xj - xi) * (latDeg - yi)) / (yj - yi) + xi
		if (intersects) inside = !inside
	}
	return inside
}

function matchRealLakeNames({
	mesh,
	landmarks,
	lakeLandmarkType,
	lakePolygons,
}: MatchRealLakeNamesParams): (string | null)[] {
	const realNames = new Array<string | null>(landmarks.count).fill(null)
	if (!lakePolygons.length) return realNames

	const { r_xyz } = mesh
	const sumX = new Float64Array(landmarks.count)
	const sumY = new Float64Array(landmarks.count)
	const sumZ = new Float64Array(landmarks.count)
	const counts = new Int32Array(landmarks.count)
	for (let r = 0; r < mesh.numRegions; r++) {
		const landmarkId = landmarks.regionLandmark[r]
		if (landmarkId < 0 || landmarks.type[landmarkId] !== lakeLandmarkType)
			continue
		sumX[landmarkId] += r_xyz[3 * r]
		sumY[landmarkId] += r_xyz[3 * r + 1]
		sumZ[landmarkId] += r_xyz[3 * r + 2]
		counts[landmarkId]++
	}

	const polygonCentroids = lakePolygons.map(({ ring }) => {
		let lonSum = 0
		let latSum = 0
		for (const [lon, lat] of ring) {
			lonSum += lon
			latSum += lat
		}
		return [lonSum / ring.length, latSum / ring.length] as [number, number]
	})

	const NEAREST_THRESHOLD_DEG = 3

	for (let landmarkId = 0; landmarkId < landmarks.count; landmarkId++) {
		if (
			landmarks.type[landmarkId] !== lakeLandmarkType ||
			counts[landmarkId] === 0
		)
			continue
		const x = sumX[landmarkId] / counts[landmarkId]
		const y = sumY[landmarkId] / counts[landmarkId]
		const z = sumZ[landmarkId] / counts[landmarkId]
		const lat = (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI
		const lon = (Math.atan2(y, x) * 180) / Math.PI

		let matched: string | null = null
		for (const { name, ring } of lakePolygons) {
			if (pointInRing({ lonDeg: lon, latDeg: lat, ring })) {
				matched = name
				break
			}
		}
		if (!matched) {
			let bestDist = Infinity
			let bestIdx = -1
			for (let i = 0; i < polygonCentroids.length; i++) {
				const [clon, clat] = polygonCentroids[i]
				const d = Math.hypot(clon - lon, clat - lat)
				if (d < bestDist) {
					bestDist = d
					bestIdx = i
				}
			}
			if (bestIdx >= 0 && bestDist <= NEAREST_THRESHOLD_DEG)
				matched = lakePolygons[bestIdx].name
		}
		realNames[landmarkId] = matched
	}

	return realNames
}

function resolveRealProvinceSeeds(
	mesh: SphereMesh,
	isLand: Uint8Array,
	provinces: RealProvinceInput[],
): { regions: Int32Array; weights: Float32Array; names: string[] } {
	const index = buildRegionSpatialIndex(mesh)
	const { adjOffset, adjList } = mesh
	const regionOwner = new Map<number, number>() // region -> index into accepted[]
	const accepted: { region: number; weight: number; name: string }[] = []

	function nearestLandRegion(lonDeg: number, latDeg: number): number {
		const start = index.nearest(lonDeg, latDeg)
		if (start < 0) return -1
		if (isLand[start]) return start
		// BFS outward for the nearest land region.
		const visited = new Set<number>([start])
		let frontier = [start]
		for (let hop = 0; hop < 8 && frontier.length > 0; hop++) {
			const next: number[] = []
			for (const r of frontier) {
				for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
					const nb = adjList[j]
					if (visited.has(nb)) continue
					visited.add(nb)
					if (isLand[nb]) return nb
					next.push(nb)
				}
			}
			frontier = next
		}
		return -1
	}

	for (const p of provinces) {
		const region = nearestLandRegion(p.lon, p.lat)
		if (region < 0) continue
		const existingIdx = regionOwner.get(region)
		if (existingIdx === undefined) {
			regionOwner.set(region, accepted.length)
			accepted.push({ region, weight: p.weight, name: p.name })
		} else if (p.weight > accepted[existingIdx].weight) {
			accepted[existingIdx] = { region, weight: p.weight, name: p.name }
		}
	}

	return {
		regions: Int32Array.from(accepted.map((a) => a.region)),
		weights: Float32Array.from(accepted.map((a) => a.weight)),
		names: accepted.map((a) => a.name),
	}
}

function mergeEu4LandMask({
	mask,
	eu4Raster,
	eu4Nodata,
}: MergeEu4LandMaskParams): Uint8Array {
	const merged = new Uint8Array(mask.length)
	for (let i = 0; i < mask.length; i++) {
		merged[i] = mask[i] >= 128 || eu4Raster[i] !== eu4Nodata ? 255 : 0
	}
	return merged
}

function importGenesisWorld({
	params,
	onProgress,
}: ImportGenesisWorldParams): GenesisWorld {
	const { timings, record } = createTimingRecorder()
	const rng = RNG.createRng({ seed: params.seed })

	onProgress?.("import:mesh", 3)
	let t0 = performance.now()
	const densityCoastlineMask =
		params.coastlineMask &&
		params.maskWidth &&
		params.maskHeight &&
		params.eu4ProvincesRaster &&
		params.eu4ProvincesWidth === params.maskWidth &&
		params.eu4ProvincesHeight === params.maskHeight
			? mergeEu4LandMask({
					mask: params.coastlineMask,
					eu4Raster: params.eu4ProvincesRaster,
					eu4Nodata: params.eu4ProvincesNoData ?? -32768,
				})
			: params.coastlineMask
	const densityWeight =
		densityCoastlineMask && params.maskWidth && params.maskHeight
			? COAST_DENSITY.buildCoastDensityWeight({
					mask: densityCoastlineMask,
					width: params.maskWidth,
					height: params.maskHeight,
					options: {
						boost: params.coastDensityBoost ?? 8,
						// Only usable when the lake mask matches the coastline
						// mask's resolution (both are rasterized at the same
						// size for this app) — mismatched sizes are silently
						// ignored by the caller, not mixed pixel-for-pixel.
						lakeMask:
							params.lakeMask &&
							params.lakeMaskWidth === params.maskWidth &&
							params.lakeMaskHeight === params.maskHeight
								? params.lakeMask
								: undefined,
						// Same-resolution province raster doubles as a source of
						// density-boosting boundaries (province borders), not
						// just land/ocean coastline.
						provinceRaster:
							params.eu4ProvincesRaster &&
							params.eu4ProvincesWidth === params.maskWidth &&
							params.eu4ProvincesHeight === params.maskHeight
								? params.eu4ProvincesRaster
								: undefined,
					},
				})
			: undefined
	const mesh = buildSphereMesh(
		params.numPoints,
		params.jitter,
		rng,
		densityWeight,
	)
	record("Sphere mesh (Fibonacci + Delaunay + pole)", t0)

	onProgress?.("import:heightmap", 10)
	t0 = performance.now()
	const elevation = sampleHeightmap({
		mesh,
		grayscale: params.grayscale,
		imgW: params.imageWidth,
		imgH: params.imageHeight,
	})
	record("Heightmap sampling", t0)

	// Authoritative land/ocean mask from vector coastline data, if provided.
	// Reconciled against elevation now (before warp/erosion) and again after,
	// so post-processing can reshape terrain magnitude near the coast but can
	// never redraw which side of the coastline a cell is on.
	let maskIsLand: Uint8Array | undefined
	if (params.coastlineMask && params.maskWidth && params.maskHeight) {
		t0 = performance.now()
		maskIsLand = sampleCoastlineMask({
			mesh,
			mask: params.coastlineMask,
			maskW: params.maskWidth,
			maskH: params.maskHeight,
		})
		reconcileElevationWithMask({ elevation, maskIsLand, epsilon: 0.02 })
		record("Coastline mask reconciliation", t0)
	}

	// Post-processing
	if (params.terrainWarp > 0) {
		t0 = performance.now()
		EROSION.warpTerrain({
			mesh,
			elev: elevation,
			seed: params.seed,
			strength: params.terrainWarp,
			r_hotspot: new Float32Array(mesh.numRegions),
		})
		record(`Terrain warp (strength=${params.terrainWarp.toFixed(2)})`, t0)
	}

	// Warp can shift elevation sign near the coast; re-clamp to the mask
	// before deriving r_isOcean so erosion/smoothing operate on the correct
	// boundary from the start.
	if (maskIsLand)
		reconcileElevationWithMask({ elevation, maskIsLand, epsilon: 0.02 })

	const r_isOcean = new Uint8Array(mesh.numRegions)
	if (maskIsLand) {
		for (let r = 0; r < mesh.numRegions; r++)
			r_isOcean[r] = maskIsLand[r] ? 0 : 1
	} else {
		for (let r = 0; r < mesh.numRegions; r++) {
			if (elevation[r] <= 0) r_isOcean[r] = 1
		}
	}

	if (params.smoothing > 0) {
		const smoothIters = Math.round(1 + params.smoothing * 4)
		const smoothStr = 0.2 + params.smoothing * 0.5
		t0 = performance.now()
		EROSION.smoothElevation({
			mesh,
			elev: elevation,
			r_isOcean,
			iterations: smoothIters,
			strength: smoothStr,
		})
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
		EROSION.erodeComposite({
			mesh,
			elev: elevation,
			r_isOcean,
			hIters,
			K: hK,
			m: 0.5,
			dt: 1.0,
			tIters,
			talusSlope,
			kThermal,
			gIters,
			glacialStrength: params.glacialErosion,
		})
		record(`Erosion composite (h=${hIters}, t=${tIters}, g=${gIters})`, t0)
	}

	if (params.ridgeSharpening > 0) {
		const rsIters = Math.round(1 + params.ridgeSharpening * 3)
		const rsStr = params.ridgeSharpening * 0.08
		t0 = performance.now()
		EROSION.sharpenRidges({
			mesh,
			elev: elevation,
			r_isOcean,
			iterations: rsIters,
			strength: rsStr,
		})
		record(`Ridge sharpening (${rsIters} iters)`, t0)
	}

	t0 = performance.now()
	EROSION.applySoilCreep({
		mesh,
		elev: elevation,
		r_isOcean,
		iterations: 3,
		strength: 0.1125,
	})
	record("Soil creep (3 iters)", t0)
	onProgress?.("import:post", 20)

	// Final clamp: erosion/soil-creep can nudge elevation across zero near
	// the coast even though r_isOcean itself was fixed going in — reconcile
	// once more so the coastline that reaches isLand/plates/climate below is
	// still exactly the vector mask, not wherever erosion left it.
	if (maskIsLand)
		reconcileElevationWithMask({ elevation, maskIsLand, epsilon: 0.02 })

	// Derive synthetic plates
	t0 = performance.now()
	const { plateAssignment, plateIds, plateIsOcean } =
		SYNTHETIC_PLATES.deriveSyntheticPlates({ mesh, elevation })
	const plates = SYNTHETIC_PLATES.buildSyntheticPlates({
		plateIds,
		plateIsOcean,
	})
	const boundary = SYNTHETIC_PLATES.buildDummyBoundary({ mesh, elevation })
	const distFields = SYNTHETIC_PLATES.computeSimpleDistanceFields({
		mesh,
		elevation,
		planetRadiusKm: params.planetRadiusKm ?? UNITS.defaultPlanetRadiusKm,
	})
	record("Synthetic plates + boundary", t0)
	onProgress?.("import:plates", 25)

	// Ocean distance
	t0 = performance.now()
	const isLand = new Uint8Array(mesh.numRegions)
	for (let r = 0; r < mesh.numRegions; r++) {
		if (elevation[r] > 0) isLand[r] = 1
	}

	// Real lake cells (vector lake polygons) carve water out of `isLand` the
	// same way the coastline mask does for ocean — before oceanDist/plates
	// are computed, so downstream stages see the final water geometry from
	// the start rather than only after a later reconciliation pass.
	let realLakeRegions: Uint8Array | undefined
	if (params.lakeMask && params.lakeMaskWidth && params.lakeMaskHeight) {
		realLakeRegions = sampleCoastlineMask({
			mesh,
			mask: params.lakeMask,
			maskW: params.lakeMaskWidth,
			maskH: params.lakeMaskHeight,
		})
		for (let r = 0; r < mesh.numRegions; r++) {
			if (realLakeRegions[r]) isLand[r] = 0
		}
	}

	const oceanDist = STATS.computeOceanDistanceBFS({
		mesh,
		isLand,
		planetRadiusKm: params.planetRadiusKm ?? UNITS.defaultPlanetRadiusKm,
	})
	record("Ocean distance (BFS)", t0)
	onProgress?.("import:oceanDist", 28)

	// Build GenesisParams from ImportParams
	const genesisParams: GenesisParams = {
		seed: params.seed,
		tideLock: null,
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
		planetRadiusKm: params.planetRadiusKm ?? UNITS.defaultPlanetRadiusKm,
		obliquity: params.obliquity ?? UNITS.defaultObliquityDeg,
		eccentricity: params.eccentricity ?? UNITS.defaultEccentricity,
		spectralClass: params.spectralClass ?? STAR.defaultSpectralClass,
		starSubtype: params.starSubtype ?? STAR.defaultStarSubtype,
		orbitalDistanceAU:
			params.orbitalDistanceAU ?? STAR.defaultOrbitalDistanceAu,
		daysPerYear: params.daysPerYear ?? UNITS.defaultDaysPerYear,
		hoursPerDay: params.hoursPerDay ?? UNITS.defaultHoursPerDay,
		substellarLon: params.substellarLon ?? UNITS.defaultSubstellarLon,
		perihelion: params.perihelion ?? UNITS.defaultPerihelion,
		pressure: params.pressure ?? 1.0,
		albedo: params.albedo,
		greenhouseFactor: params.greenhouseFactor,
		seismologyTotalHeatingK: params.seismologyTotalHeatingK,
	}

	const maxElevKm = (genesisParams.maxElevation ?? 6000) / 1000
	const maxDepthKm = UNITS.getMaxOceanDepthKm(genesisParams.planetRadiusKm)
	const baseElevation = elevation.slice()
	const { elevation: finalElevation, elevation_km } =
		SEA_LEVEL.applySeaLevelToElevation({
			baseElevation,
			maxElevKm,
			maxDepthKm,
			seaLevel: genesisParams.seaLevel,
		})
	elevation.set(finalElevation)

	// Real-world elevation override: the 8-bit grayscale heightmap's
	// sqrt-curve reconstruction has its own systematic error independent of
	// terrain-warp/erosion, so substitute accurate sampled elevation wherever
	// the raster has coverage. This supports both land-only rasters and
	// merged land+bathymetry rasters. Does not touch the normalized
	// `elevation` array (rendering/mesh geometry), only elevation_km.
	if (
		params.realElevationRaster &&
		params.realElevationWidth &&
		params.realElevationHeight &&
		params.realElevationScale !== undefined &&
		params.realElevationNoData !== undefined
	) {
		const realElevationM = sampleSingleBandFloatRaster({
			mesh,
			raster: params.realElevationRaster,
			rasterW: params.realElevationWidth,
			rasterH: params.realElevationHeight,
			scale: params.realElevationScale,
			nodata: params.realElevationNoData,
		})
		for (let r = 0; r < mesh.numRegions; r++) {
			const realKm = realElevationM[r] / 1000
			if (Number.isFinite(realKm)) elevation_km[r] = realKm
		}
	}

	const eu5Topography =
		params.eu5TopographyRaster &&
		params.eu5TopographyWidth &&
		params.eu5TopographyHeight &&
		params.eu5TopographyNoData !== undefined
			? sampleCategoricalRaster({
					mesh,
					raster: params.eu5TopographyRaster,
					rasterW: params.eu5TopographyWidth,
					rasterH: params.eu5TopographyHeight,
					nodata: params.eu5TopographyNoData,
				})
			: undefined
	const eu5Vegetation =
		params.eu5VegetationRaster &&
		params.eu5VegetationWidth &&
		params.eu5VegetationHeight &&
		params.eu5VegetationNoData !== undefined
			? sampleCategoricalRaster({
					mesh,
					raster: params.eu5VegetationRaster,
					rasterW: params.eu5VegetationWidth,
					rasterH: params.eu5VegetationHeight,
					nodata: params.eu5VegetationNoData,
				})
			: undefined
	const eu5Climate =
		params.eu5ClimateRaster &&
		params.eu5ClimateWidth &&
		params.eu5ClimateHeight &&
		params.eu5ClimateNoData !== undefined
			? sampleCategoricalRaster({
					mesh,
					raster: params.eu5ClimateRaster,
					rasterW: params.eu5ClimateWidth,
					rasterH: params.eu5ClimateHeight,
					nodata: params.eu5ClimateNoData,
				})
			: undefined

	let realRivers: ReturnType<typeof buildRealRiversData> | undefined
	if (params.riverLines?.length) {
		t0 = performance.now()
		realRivers = buildRealRiversData(
			mesh,
			params.riverLines,
			elevation_km,
			genesisParams.planetRadiusKm,
		)
		record("Real river snapping", t0)
	}

	let realProvinceSeeds: ReturnType<typeof resolveRealProvinceSeeds> | undefined
	if (params.realProvinces?.length) {
		t0 = performance.now()
		realProvinceSeeds = resolveRealProvinceSeeds(
			mesh,
			isLand,
			params.realProvinces,
		)
		record("Real province seed resolution", t0)
	}

	let eu4ProvinceIds: Int16Array | undefined
	if (
		params.eu4ProvincesRaster &&
		params.eu4ProvincesWidth &&
		params.eu4ProvincesHeight &&
		params.eu4ProvincesNoData !== undefined
	) {
		t0 = performance.now()
		eu4ProvinceIds = sampleCategoricalRaster({
			mesh,
			raster: params.eu4ProvincesRaster,
			rasterW: params.eu4ProvincesWidth,
			rasterH: params.eu4ProvincesHeight,
			nodata: params.eu4ProvincesNoData,
		})
		record("EU4 province raster sampling", t0)
	}

	// Shared post-elevation pipeline (climate → population). Real climate
	// rasters are passed straight in so post-elevation can attach observed
	// Earth temperature/rainfall/DTR *before* it runs the Pasta climate
	// classification -- vegetation for Earth imports should key off observed
	// climate, not the procedural EBM output. See runPostElevationPipeline's
	// "Observed Earth climate" step.
	t0 = performance.now()
	const post = POST_ELEVATION.runPostElevationPipeline({
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
		realLakeRegions,
		realRivers,
		realProvinceSeeds,
		eu4ProvinceIds,
		eu4ProvinceFallbackSeeds: params.eu4ProvinceFallbackSeeds,
		r_hotspot: new Float32Array(mesh.numRegions),
		r_mantleUpwelling: new Float32Array(mesh.numRegions),
		terrainFeatures: undefined,
		enableOceanCurrents: true,
		realClimateMonthly: params.realClimateMonthly,
		realClimateWidth: params.realClimateWidth,
		realClimateHeight: params.realClimateHeight,
		realClimateMonths: params.realClimateMonths,
		realClimateScale: params.realClimateScale,
		realClimateNoData: params.realClimateNoData,
		realPrecipMonthly: params.realPrecipMonthly,
		realPrecipWidth: params.realPrecipWidth,
		realPrecipHeight: params.realPrecipHeight,
		realPrecipMonths: params.realPrecipMonths,
		realPrecipScale: params.realPrecipScale,
		realPrecipNoData: params.realPrecipNoData,
		realDtrMonthly: params.realDtrMonthly,
		realDtrWidth: params.realDtrWidth,
		realDtrHeight: params.realDtrHeight,
		realDtrMonths: params.realDtrMonths,
		realDtrScale: params.realDtrScale,
		realDtrNoData: params.realDtrNoData,
		onProgress,
	})
	record("Post-elevation pipeline", t0)
	onProgress?.("import:post-pipeline", 70)

	if (
		params.realVaporPressureMonthly &&
		params.realVaporPressureWidth &&
		params.realVaporPressureHeight &&
		params.realVaporPressureMonths &&
		params.realVaporPressureScale !== undefined &&
		params.realVaporPressureNoData !== undefined
	) {
		t0 = performance.now()
		attachObservedEarthHumidity({
			mesh,
			world: post,
			realVaporPressureMonthly: params.realVaporPressureMonthly,
			realVaporPressureWidth: params.realVaporPressureWidth,
			realVaporPressureHeight: params.realVaporPressureHeight,
			realVaporPressureMonths: params.realVaporPressureMonths,
			realVaporPressureScale: params.realVaporPressureScale,
			realVaporPressureNoData: params.realVaporPressureNoData,
		})
		record("Observed Earth humidity sampling", t0)
	}

	if (post.climate.real_temperature_monthly && post.rainfall.real_monthly) {
		t0 = performance.now()
		post.realKoppenClimate = KOPPEN.assignKoppenClimate({
			mesh,
			isLand,
			temperatureMonthly: post.climate.real_temperature_monthly,
			rainfallMonthly: post.rainfall.real_monthly,
		})
		record("Observed Earth koppen classification", t0)
	}

	t0 = performance.now()
	const provinceSociety = DERIVE_PROVINCE_SOCIETY.deriveProvinceSociety({
		mesh,
		params: genesisParams,
		post,
		isLand,
	})
	record("Imported province society", t0)
	onProgress?.("import:society", 77)

	if (params.lakeNames?.length) {
		t0 = performance.now()
		provinceSociety.landmarks.realNames = matchRealLakeNames({
			mesh,
			landmarks: provinceSociety.landmarks,
			lakeLandmarkType: LANDMARKS.landmarkTypeLake,
			lakePolygons: params.lakeNames,
		})
		record("Real lake name matching", t0)
	}

	return {
		mesh,
		isEarthImport: true,
		plates,
		plateAssignment,
		boundary,
		distFields,
		elevation,
		elevation_km,
		eu5Topography,
		eu5Vegetation,
		eu5Climate,
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
		realKoppenClimate: post.realKoppenClimate,
		realPastaClimate: post.realPastaClimate,
		vegetation: post.vegetation,
		topography: post.topography,
		coastal: post.coastal,
		waterAccess: post.waterAccess,
		riverAccess: post.riverAccess,
		lakeAccess: post.lakeAccess,
		slopeScore: post.slopeScore,
		dtr_annual: post.dtr_annual,
		dtr_monthly: post.dtr_monthly,
		observedDtr: post.observedDtr,
		observedHumidity: post.observedHumidity,
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
		continentCount: STATS.countContinents({ mesh, isLand }),
		timings: [...timings, ...post.timings, ...provinceSociety.timings],
	}
}

export const IMPORT_HEIGHTMAP = {
	importGenesisWorld,
}
