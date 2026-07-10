/**
 * Heightmap import pipeline: samples a B&W equirectangular heightmap
 * onto a sphere mesh, derives synthetic plates, runs post-processing
 * and climate simulation.
 */

import type { GenesisParams, GenesisWorld, SphereMesh, StageTiming } from ".."
import {
	DEFAULT_ORBITAL_DISTANCE_AU,
	DEFAULT_SPECTRAL_CLASS,
	DEFAULT_STAR_SUBTYPE,
} from "../celestial/star/star-types"
import { buildSphereMesh } from "../mesh"
import { createRng } from "../shared/rng"
import { computeOceanDistanceBFS, countContinents } from "../shared/stats"
import {
	DEFAULT_DAYS_PER_YEAR,
	DEFAULT_ECCENTRICITY,
	DEFAULT_HOURS_PER_DAY,
	DEFAULT_OBLIQUITY_DEG,
	DEFAULT_PERIHELION,
	DEFAULT_PLANET_RADIUS_KM,
	DEFAULT_SUBSTELLAR_LON,
	getMaxOceanDepthKm,
} from "../shared/units"
import {
	buildDummyBoundary,
	buildSyntheticPlates,
	computeSimpleDistanceFields,
	deriveSyntheticPlates,
} from "../tectonics/synthetic-plates"
import { buildCoastDensityWeight } from "../terrain/coast-density"
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

interface ImportParams {
	seed: number
	numPoints: number
	jitter: number
	grayscale: Uint8Array
	imageWidth: number
	imageHeight: number
	coastlineMask?: Uint8Array
	maskWidth?: number
	maskHeight?: number
	coastDensityBoost?: number
	lakeMask?: Uint8Array
	lakeMaskWidth?: number
	lakeMaskHeight?: number
	riverLines?: { points: number[]; strokeweig: number }[]
	realClimateMonthly?: Int16Array
	realClimateWidth?: number
	realClimateHeight?: number
	realClimateMonths?: number
	realClimateScale?: number
	realClimateNoData?: number
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
	substellarLon?: number
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

function sampleMonthlyFloatRaster(
	mesh: SphereMesh,
	raster: Int16Array,
	rasterW: number,
	rasterH: number,
	months: number,
	scale: number,
	nodata: number,
): Float32Array {
	const N = mesh.numRegions
	const { r_xyz } = mesh
	const out = new Float32Array(months * N)

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

		for (let month = 0; month < months; month++) {
			const monthOffset = month * rasterW * rasterH
			const q00 = raster[monthOffset + yi0 * rasterW + xi0]
			const q10 = raster[monthOffset + yi0 * rasterW + x1]
			const q01 = raster[monthOffset + y1 * rasterW + xi0]
			const q11 = raster[monthOffset + y1 * rasterW + x1]
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

			out[month * N + r] = weightSum > 0 ? weighted / weightSum : NaN
		}
	}

	return out
}

function attachObservedEarthClimate(params: {
	mesh: SphereMesh
	climate: GenesisWorld["climate"]
	realClimateMonthly: Int16Array
	realClimateWidth: number
	realClimateHeight: number
	realClimateMonths: number
	realClimateScale: number
	realClimateNoData: number
}): void {
	const {
		mesh,
		climate,
		realClimateMonthly,
		realClimateWidth,
		realClimateHeight,
		realClimateMonths,
		realClimateScale,
		realClimateNoData,
	} = params
	if (realClimateMonths !== 12) return

	const N = mesh.numRegions
	const observedMonthly = sampleMonthlyFloatRaster(
		mesh,
		realClimateMonthly,
		realClimateWidth,
		realClimateHeight,
		realClimateMonths,
		realClimateScale,
		realClimateNoData,
	)
	const observedAnnual = new Float32Array(N)
	const diffMonthly = new Float32Array(N * realClimateMonths)
	const diffAnnual = new Float32Array(N)

	for (let r = 0; r < N; r++) {
		let observedSum = 0
		let observedCount = 0
		let diffSum = 0
		let diffCount = 0
		for (let month = 0; month < realClimateMonths; month++) {
			const idx = month * N + r
			const observed = observedMonthly[idx]
			if (Number.isFinite(observed)) {
				observedSum += observed
				observedCount++
				diffMonthly[idx] = climate.temperature_monthly[idx] - observed
				diffSum += diffMonthly[idx]
				diffCount++
			} else {
				diffMonthly[idx] = NaN
			}
		}
		observedAnnual[r] = observedCount > 0 ? observedSum / observedCount : NaN
		diffAnnual[r] = diffCount > 0 ? diffSum / diffCount : NaN
	}

	climate.real_temperature_monthly = observedMonthly
	climate.real_temperature_avg = observedAnnual
	climate.temperature_diff_monthly = diffMonthly
	climate.temperature_diff_avg = diffAnnual
}

// Nearest-neighbor sample of a binary land/ocean mask (255 = land, 0 =
// ocean), using the same lat/lon -> pixel convention as sampleHeightmap.
// Nearest (not bilinear) is deliberate: the mask is a hard vector boundary,
// not a continuous field, so blending would just reintroduce the blur this
// is meant to eliminate.
function sampleCoastlineMask(
	mesh: SphereMesh,
	mask: Uint8Array,
	maskW: number,
	maskH: number,
): Uint8Array {
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

// Clamps elevation sign to match the authoritative coastline mask so that
// erosion/smoothing/warp passes can never redraw the land/ocean boundary
// the vector coastline established. `epsilon` keeps clamped cells strictly
// on the correct side of sea level without introducing a visible plateau.
function reconcileElevationWithMask(
	elevation: Float32Array,
	maskIsLand: Uint8Array,
	epsilon: number,
): void {
	for (let r = 0; r < elevation.length; r++) {
		if (maskIsLand[r]) {
			if (elevation[r] <= 0) elevation[r] = epsilon
		} else {
			if (elevation[r] > 0) elevation[r] = -epsilon
		}
	}
}

// ── Real rivers/lakes (vector data) ─────────────────────────────────

// Uniform 1°×1° lat/lon bucket grid over mesh region centers, for snapping
// arbitrary lon/lat query points (river polyline vertices) onto the nearest
// mesh region. Brute-force nearest-of-N (N≈200k) per query would be too
// slow for thousands of river vertices; this is a one-time O(N) build plus
// an expanding-ring bucket search per query, typically O(1).
function buildRegionSpatialIndex(mesh: SphereMesh) {
	const N = mesh.numRegions
	const binsLon = 360
	const binsLat = 180
	const buckets: number[][] = new Array(binsLon * binsLat)
	const { r_xyz } = mesh

	for (let r = 0; r < N; r++) {
		const x = r_xyz[3 * r]
		const y = r_xyz[3 * r + 1]
		const z = r_xyz[3 * r + 2]
		const lat = (Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI
		const lon = (Math.atan2(y, x) * 180) / Math.PI
		const bx = Math.min(binsLon - 1, Math.max(0, Math.floor(lon + 180)))
		const by = Math.min(binsLat - 1, Math.max(0, Math.floor(90 - lat)))
		const idx = by * binsLon + bx
		;(buckets[idx] ??= []).push(r)
	}

	return {
		nearest(lonDeg: number, latDeg: number): number {
			const bx0 = Math.min(binsLon - 1, Math.max(0, Math.floor(lonDeg + 180)))
			const by0 = Math.min(binsLat - 1, Math.max(0, Math.floor(90 - latDeg)))
			const latR = (latDeg * Math.PI) / 180
			const lonR = (lonDeg * Math.PI) / 180
			const cosLat = Math.cos(latR)
			const qx = cosLat * Math.cos(lonR)
			const qy = cosLat * Math.sin(lonR)
			const qz = Math.sin(latR)

			let best = -1
			let bestD = Infinity
			for (let ring = 0; ring <= 12; ring++) {
				let sawBucket = false
				for (let dy = -ring; dy <= ring; dy++) {
					const by = by0 + dy
					if (by < 0 || by >= binsLat) continue
					const onYEdge = dy === -ring || dy === ring
					for (let dx = -ring; dx <= ring; dx++) {
						if (!onYEdge && dx !== -ring && dx !== ring) continue
						const bx = (((bx0 + dx) % binsLon) + binsLon) % binsLon
						const bucket = buckets[by * binsLon + bx]
						if (!bucket) continue
						sawBucket = true
						for (const r of bucket) {
							const dxp = r_xyz[3 * r] - qx
							const dyp = r_xyz[3 * r + 1] - qy
							const dzp = r_xyz[3 * r + 2] - qz
							const d = dxp * dxp + dyp * dyp + dzp * dzp
							if (d < bestD) {
								bestD = d
								best = r
							}
						}
					}
				}
				// Stop one ring after first finding candidates, so the true
				// nearest (which could be just across a bucket boundary) isn't
				// missed by stopping the instant the first bucket is hit.
				if (best >= 0 && !sawBucket) break
				if (best >= 0 && ring > 0 && bestD < ring * ring * 1e-4) break
			}
			return best
		},
	}
}

interface RealRiverLineInput {
	points: number[] // flat [lon0, lat0, lon1, lat1, ...] degrees
	strokeweig: number
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

	let maxFlow = 0
	for (const line of outLines) for (const [, , flow] of line) maxFlow = Math.max(maxFlow, flow)

	return {
		lines: outLines,
		visible,
		riverId,
		riverLengthKm,
		minFlow: 0,
		maxFlow: maxFlow || 1,
	}
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
	const densityWeight =
		params.coastlineMask && params.maskWidth && params.maskHeight
			? buildCoastDensityWeight(
					params.coastlineMask,
					params.maskWidth,
					params.maskHeight,
					{
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
					},
				)
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
	const elevation = sampleHeightmap(
		mesh,
		params.grayscale,
		params.imageWidth,
		params.imageHeight,
	)
	record("Heightmap sampling", t0)

	// Authoritative land/ocean mask from vector coastline data, if provided.
	// Reconciled against elevation now (before warp/erosion) and again after,
	// so post-processing can reshape terrain magnitude near the coast but can
	// never redraw which side of the coastline a cell is on.
	let maskIsLand: Uint8Array | undefined
	if (params.coastlineMask && params.maskWidth && params.maskHeight) {
		t0 = performance.now()
		maskIsLand = sampleCoastlineMask(
			mesh,
			params.coastlineMask,
			params.maskWidth,
			params.maskHeight,
		)
		reconcileElevationWithMask(elevation, maskIsLand, 0.02)
		record("Coastline mask reconciliation", t0)
	}

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

	// Warp can shift elevation sign near the coast; re-clamp to the mask
	// before deriving r_isOcean so erosion/smoothing operate on the correct
	// boundary from the start.
	if (maskIsLand) reconcileElevationWithMask(elevation, maskIsLand, 0.02)

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

	// Final clamp: erosion/soil-creep can nudge elevation across zero near
	// the coast even though r_isOcean itself was fixed going in — reconcile
	// once more so the coastline that reaches isLand/plates/climate below is
	// still exactly the vector mask, not wherever erosion left it.
	if (maskIsLand) reconcileElevationWithMask(elevation, maskIsLand, 0.02)

	// Derive synthetic plates
	t0 = performance.now()
	const { plateAssignment, plateIds, plateIsOcean } = deriveSyntheticPlates(
		mesh,
		elevation,
	)
	const plates = buildSyntheticPlates(plateIds, plateIsOcean)
	const boundary = buildDummyBoundary(mesh, elevation)
	const distFields = computeSimpleDistanceFields(
		mesh,
		elevation,
		params.planetRadiusKm ?? DEFAULT_PLANET_RADIUS_KM,
	)
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
		realLakeRegions = sampleCoastlineMask(
			mesh,
			params.lakeMask,
			params.lakeMaskWidth,
			params.lakeMaskHeight,
		)
		for (let r = 0; r < mesh.numRegions; r++) {
			if (realLakeRegions[r]) isLand[r] = 0
		}
	}

	const oceanDist = computeOceanDistanceBFS(
		mesh,
		isLand,
		params.planetRadiusKm ?? DEFAULT_PLANET_RADIUS_KM,
	)
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
		planetRadiusKm: params.planetRadiusKm ?? DEFAULT_PLANET_RADIUS_KM,
		obliquity: params.obliquity ?? DEFAULT_OBLIQUITY_DEG,
		eccentricity: params.eccentricity ?? DEFAULT_ECCENTRICITY,
		spectralClass: params.spectralClass ?? DEFAULT_SPECTRAL_CLASS,
		starSubtype: params.starSubtype ?? DEFAULT_STAR_SUBTYPE,
		orbitalDistanceAU: params.orbitalDistanceAU ?? DEFAULT_ORBITAL_DISTANCE_AU,
		daysPerYear: params.daysPerYear ?? DEFAULT_DAYS_PER_YEAR,
		hoursPerDay: params.hoursPerDay ?? DEFAULT_HOURS_PER_DAY,
		substellarLon: params.substellarLon ?? DEFAULT_SUBSTELLAR_LON,
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
		realLakeRegions,
		realRivers,
		r_hotspot: new Float32Array(mesh.numRegions),
		r_mantleUpwelling: new Float32Array(mesh.numRegions),
		terrainFeatures: undefined,
		enableOceanCurrents: true,
		onProgress,
	})
	record("Post-elevation pipeline", t0)
	onProgress?.("import:post-pipeline", 70)

	if (
		params.realClimateMonthly &&
		params.realClimateWidth &&
		params.realClimateHeight &&
		params.realClimateMonths &&
		params.realClimateScale !== undefined &&
		params.realClimateNoData !== undefined
	) {
		t0 = performance.now()
		attachObservedEarthClimate({
			mesh,
			climate: post.climate,
			realClimateMonthly: params.realClimateMonthly,
			realClimateWidth: params.realClimateWidth,
			realClimateHeight: params.realClimateHeight,
			realClimateMonths: params.realClimateMonths,
			realClimateScale: params.realClimateScale,
			realClimateNoData: params.realClimateNoData,
		})
		record("Observed Earth climate sampling", t0)
	}

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
		isEarthImport: true,
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
