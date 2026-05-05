/**
 * Distance fields and elevation assignment.
 * Faithful port of orogen's elevation.js distance-field + elevation logic.
 */

import type {
	BoundaryInfo,
	DistanceFields,
	OrogenTerrainFeatures,
	PlateVec,
	SphereMesh,
} from ".."
import { createRng } from "../shared/rng"
import { SimplexNoise } from "../shared/simplex-noise"
import { OROGEN_TERRAIN_FEATURE } from "../types/tectonics"
import { applyVolcanicArcs } from "./volcanism"

type StageTiming = { Stage: string; ms: string }

// ----------------------------------------------------------------
//  Randomized BFS distance field (orogen port)
// ----------------------------------------------------------------
function assignDistanceField(
	mesh: SphereMesh,
	seeds: Iterable<number>,
	stops: Set<number>,
	seedVal: number,
): Float32Array {
	const { numRegions, adjOffset, adjList } = mesh
	const dist = new Float32Array(numRegions).fill(Infinity)
	const isStop = new Uint8Array(numRegions)
	for (const r of stops) isStop[r] = 1

	const queue: number[] = []
	for (const r of seeds) {
		queue.push(r)
		dist[r] = 0
	}

	// Deterministic shuffle RNG
	const prng = createRng(seedVal)
	const randInt = (n: number) => Math.floor(prng.random() * n)

	for (let qi = 0; qi < queue.length; qi++) {
		const pos = qi + randInt(queue.length - qi)
		const cur = queue[pos]
		queue[pos] = queue[qi]
		for (
			let ni = adjOffset[cur], niEnd = adjOffset[cur + 1];
			ni < niEnd;
			ni++
		) {
			const nb = adjList[ni]
			if (dist[nb] === Infinity && !isStop[nb]) {
				dist[nb] = dist[cur] + 1
				queue.push(nb)
			}
		}
	}
	return dist
}

/**
 * Compute distance fields from mountains, oceans, coastlines, and land-coast.
 */
export function computeDistanceFields(
	mesh: SphereMesh,
	r_plate: Int32Array,
	plateIsOcean: Set<number>,
	boundary: BoundaryInfo,
	seed: number,
): DistanceFields {
	const { numRegions, adjOffset, adjList } = mesh

	// Stress mountains: mountain seeds with subduct < 0.55
	const stress_mountain_r = new Set<number>()
	for (const r of boundary.mountain_r) {
		if (boundary.r_subductFactor[r] < 0.55) stress_mountain_r.add(r)
	}

	const stop_r = new Set([
		...stress_mountain_r,
		...boundary.coastline_r,
		...boundary.ocean_r,
	])

	const distMountain = assignDistanceField(
		mesh,
		stress_mountain_r,
		boundary.ocean_r,
		seed + 1,
	)
	const distOcean = assignDistanceField(
		mesh,
		boundary.ocean_r,
		boundary.coastline_r,
		seed + 2,
	)
	const distCoastline = assignDistanceField(
		mesh,
		boundary.coastline_r,
		stop_r,
		seed + 3,
	)

	// Ocean/land mask
	const r_isOcean = new Uint8Array(numRegions)
	for (let r = 0; r < numRegions; r++) {
		if (plateIsOcean.has(r_plate[r])) r_isOcean[r] = 1
	}

	// Coast distance for ocean floor features
	const coastSeeds = new Set<number>()
	for (let r = 0; r < numRegions; r++) {
		if (!r_isOcean[r]) {
			for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
				if (r_isOcean[adjList[ni]]) {
					coastSeeds.add(adjList[ni])
					break
				}
			}
		}
	}
	const distCoast = assignDistanceField(mesh, coastSeeds, new Set(), seed + 4)

	// Land-only coast distance: propagates only through land
	const landCoastSeeds = new Set<number>()
	for (let r = 0; r < numRegions; r++) {
		if (r_isOcean[r]) continue
		for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
			if (r_isOcean[adjList[ni]]) {
				landCoastSeeds.add(r)
				break
			}
		}
	}
	const oceanBarriers = new Set<number>()
	for (let r = 0; r < numRegions; r++) {
		if (r_isOcean[r]) oceanBarriers.add(r)
	}
	const distCoastLand = assignDistanceField(
		mesh,
		landCoastSeeds,
		oceanBarriers,
		seed + 5,
	)

	return { distMountain, distOcean, distCoastline, distCoast, distCoastLand }
}

/**
 * BFS that propagates hop-count distances from pre-seeded nodes up to halfWidth hops.
 * `canVisit(nr, r)` gates whether neighbor `nr` (from current node `r`) may be visited.
 */
function boundedBfs(
	dist: Float32Array,
	seeds: number[],
	halfWidth: number,
	adjOffset: Int32Array,
	adjList: Int32Array,
	canVisit: (nr: number, r: number) => boolean,
): void {
	let qi = 0
	while (qi < seeds.length) {
		const r = seeds[qi++]
		const nd = dist[r] + 1
		if (nd > halfWidth) continue
		for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
			const nr = adjList[ni]
			if (nd < dist[nr] && canVisit(nr, r)) {
				dist[nr] = nd
				seeds.push(nr)
			}
		}
	}
}

/**
 * Assign elevation from distance fields, stress, noise, and tectonic features.
 * Faithful port of orogen's main elevation loop.
 */
export function blendElevation(
	mesh: SphereMesh,
	r_plate: Int32Array,
	plateVec: Map<number, PlateVec>,
	plateIsOcean: Set<number>,
	distFields: DistanceFields,
	boundary: BoundaryInfo,
	roughness: number,
	volcanism: number,
	seed: number,
	timing?: StageTiming[],
): {
	elevation: Float32Array
	terrainFeatures: OrogenTerrainFeatures
} {
	const { numRegions, r_xyz, adjOffset, adjList } = mesh
	const { distMountain, distOcean, distCoastline, distCoast, distCoastLand } =
		distFields
	const { r_stress, r_subductFactor, r_boundaryType, r_bothOcean, r_hasOcean } =
		boundary

	const elev = new Float32Array(numRegions)
	const featureMask = new Uint32Array(numRegions)
	const dominantFeature = new Uint8Array(numRegions)
	const dominantMagnitude = new Float32Array(numRegions)
	const noiseMag = roughness

	function markFeature(r: number, feature: number, delta: number) {
		const magnitude = Math.abs(delta)
		if (magnitude <= 1e-5) return
		featureMask[r] |= 1 << (feature - 1)
		if (magnitude > dominantMagnitude[r]) {
			dominantMagnitude[r] = magnitude
			dominantFeature[r] = feature
		}
	}

	const noise = new SimplexNoise(seed)
	const foldNoise = new SimplexNoise(seed + 557)
	const riftNoise = new SimplexNoise(seed + 419)
	const MAX_OCEAN_ARC_ELEV = 0.2

	// Source uses default persistence (2/3) for most fbm calls.
	// Only detail/fine noise uses explicit 0.5.
	function fbm(x: number, y: number, z: number, octaves = 5): number {
		return noise.fbm(x, y, z, octaves)
	}

	function ridgedFbm(x: number, y: number, z: number, octaves = 4): number {
		return noise.ridgedFbm(x, y, z, octaves, 2.0, 0.5, 1.0)
	}

	function foldFbm(x: number, y: number, z: number, octaves = 4): number {
		return foldNoise.fbm(x, y, z, octaves)
	}

	function riftFbm(x: number, y: number, z: number, octaves = 3): number {
		return riftNoise.ridgedFbm(x, y, z, octaves, 2.0, 0.5, 1.0)
	}

	// Ocean/land mask
	const r_isOcean = new Uint8Array(numRegions)
	for (let r = 0; r < numRegions; r++) {
		if (plateIsOcean.has(r_plate[r])) r_isOcean[r] = 1
	}
	const coastal = new Float32Array(numRegions)
	const margins = new Float32Array(numRegions)
	const backArc = new Float32Array(numRegions)
	const foldRidge = new Float32Array(numRegions)
	const orogenicPowerField = new Float32Array(numRegions)

	// 95th-percentile stress normalization
	let maxStress = 0
	const stressVals = new Float32Array(numRegions)
	let stressCount = 0
	for (let r = 0; r < numRegions; r++) {
		if (r_stress[r] > 0.01) stressVals[stressCount++] = r_stress[r]
		if (r_stress[r] > maxStress) maxStress = r_stress[r]
	}
	if (stressCount > 0) {
		stressVals.subarray(0, stressCount).sort()
		maxStress =
			stressVals[Math.min(stressCount - 1, Math.floor(stressCount * 0.97))]
	}
	if (maxStress < 0.01) maxStress = 1

	const scaleFactor = Math.sqrt(numRegions / 10000)
	const eps = 1e-3
	const warpScale = 0.4
	const warpOctaves = numRegions > 200000 ? 2 : 3

	const INTERIOR_BAND_BASE = 16
	const interiorBand = Math.max(4, Math.round(INTERIOR_BAND_BASE * scaleFactor))
	const TECTONIC_REACH_BASE = 20
	const tectonicReach = Math.max(
		6,
		Math.round(TECTONIC_REACH_BASE * scaleFactor),
	)
	const plateauStart = Math.max(2, Math.round(3 * scaleFactor))

	// Rift BFS
	const coastAndRiftStart = performance.now()
	const RIFT_HALF_WIDTH_BASE = 6
	const riftHalfWidth = Math.max(
		3,
		Math.round(RIFT_HALF_WIDTH_BASE * scaleFactor),
	)
	const riftDist = new Float32Array(numRegions).fill(Infinity)
	const riftSeeds: number[] = []
	for (let r = 0; r < numRegions; r++) {
		if (r_boundaryType[r] === 2 && !r_hasOcean[r]) {
			riftSeeds.push(r)
			riftDist[r] = 0
		}
	}
	boundedBfs(
		riftDist,
		riftSeeds,
		riftHalfWidth,
		adjOffset,
		adjList,
		(nr, r) => r_plate[nr] === r_plate[r] && !r_isOcean[nr],
	)

	// Pull-apart basin BFS (continental transform boundaries)
	const PULL_APART_HW_BASE = 3
	const pullApartHalfWidth = Math.max(
		2,
		Math.round(PULL_APART_HW_BASE * scaleFactor),
	)
	const pullApartDist = new Float32Array(numRegions).fill(Infinity)
	const pullApartSeeds: number[] = []
	for (let r = 0; r < numRegions; r++) {
		if (r_boundaryType[r] === 3 && !r_hasOcean[r]) {
			pullApartSeeds.push(r)
			pullApartDist[r] = 0
		}
	}
	boundedBfs(
		pullApartDist,
		pullApartSeeds,
		pullApartHalfWidth,
		adjOffset,
		adjList,
		(nr, _r) => !r_isOcean[nr],
	)
	timing?.push({
		Stage: "Coast boundary + rift BFS",
		ms: (performance.now() - coastAndRiftStart).toFixed(1),
	})

	// Mid-ocean ridge BFS
	const ridgeAndBackArcStart = performance.now()
	const RIDGE_HW_BASE = 4
	const ridgeHalfWidth = Math.max(2, Math.round(RIDGE_HW_BASE * scaleFactor))
	const ridgeDist = new Float32Array(numRegions).fill(Infinity)
	const ridgeSeeds: number[] = []
	for (let r = 0; r < numRegions; r++) {
		if (r_boundaryType[r] === 2 && r_bothOcean[r]) {
			ridgeSeeds.push(r)
			ridgeDist[r] = 0
		}
	}
	boundedBfs(
		ridgeDist,
		ridgeSeeds,
		ridgeHalfWidth,
		adjOffset,
		adjList,
		(nr, _r) => !!r_isOcean[nr],
	)

	// Fracture zone BFS
	const FRAC_HW_BASE = 3
	const fractureHalfWidth = Math.max(2, Math.round(FRAC_HW_BASE * scaleFactor))
	const fractureDist = new Float32Array(numRegions).fill(Infinity)
	const fractureSeeds: number[] = []
	for (let r = 0; r < numRegions; r++) {
		if (r_boundaryType[r] === 3 && r_bothOcean[r]) {
			fractureSeeds.push(r)
			fractureDist[r] = 0
		}
	}
	boundedBfs(
		fractureDist,
		fractureSeeds,
		fractureHalfWidth,
		adjOffset,
		adjList,
		(nr, _r) => !!r_isOcean[nr],
	)

	// Back-arc basin BFS
	const baStart = Math.max(1, Math.round(2 * scaleFactor))
	const baPeak = Math.max(2, Math.round(3 * scaleFactor))
	const baEnd = Math.max(3, Math.round(5 * scaleFactor))
	const backArcDist = new Float32Array(numRegions).fill(Infinity)
	const backArcStress = new Float32Array(numRegions)
	const backArcSeeds: number[] = []
	for (let r = 0; r < numRegions; r++) {
		if (r_boundaryType[r] === 1 && r_hasOcean[r] && r_subductFactor[r] < 0.5) {
			backArcSeeds.push(r)
			backArcDist[r] = 0
			backArcStress[r] = Math.min(1, r_stress[r] / maxStress)
		}
	}
	{
		let qi = 0
		while (qi < backArcSeeds.length) {
			const r = backArcSeeds[qi++]
			const nd = backArcDist[r] + 1
			if (nd > baEnd) continue
			const plate = r_plate[r]
			for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
				const nr = adjList[ni]
				if (nd < backArcDist[nr] && r_plate[nr] === plate) {
					backArcDist[nr] = nd
					backArcStress[nr] = backArcStress[r]
					backArcSeeds.push(nr)
				}
			}
		}
	}

	// Coast boundary BFS (for coastal roughening)
	const coastBdry: number[] = []
	for (let r = 0; r < numRegions; r++) {
		const rOc = r_isOcean[r]
		for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
			if (r_isOcean[adjList[ni]] !== rOc) {
				coastBdry.push(r)
				break
			}
		}
	}
	const maxCD = Math.max(8, Math.round(8 * scaleFactor))
	const r_coastDist = new Float32Array(numRegions).fill(maxCD + 1)
	const coastStressMax = new Float32Array(numRegions)
	const coastSubductMax = new Float32Array(numRegions)
	const coastConvergent = new Uint8Array(numRegions)
	for (const r of coastBdry) {
		r_coastDist[r] = 0
		coastStressMax[r] = Math.min(1, r_stress[r] / maxStress)
		coastSubductMax[r] = r_subductFactor[r]
		coastConvergent[r] = r_boundaryType[r] === 1 ? 1 : 0
	}
	{
		let qi = 0
		while (qi < coastBdry.length) {
			const r = coastBdry[qi++]
			const nd = r_coastDist[r] + 1
			if (nd > maxCD) continue
			for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
				const nr = adjList[ni]
				if (nd < r_coastDist[nr]) {
					r_coastDist[nr] = nd
					coastStressMax[nr] = coastStressMax[r]
					coastSubductMax[nr] = coastSubductMax[r]
					coastConvergent[nr] = coastConvergent[r]
					coastBdry.push(nr)
				} else if (
					nd === r_coastDist[nr] &&
					coastStressMax[r] > coastStressMax[nr]
				) {
					coastStressMax[nr] = coastStressMax[r]
					coastSubductMax[nr] = coastSubductMax[r]
					coastConvergent[nr] = coastConvergent[r]
				}
			}
		}
	}
	timing?.push({
		Stage: "Ridge/fracture/back-arc BFS",
		ms: (performance.now() - ridgeAndBackArcStart).toFixed(1),
	})

	// ---- Main elevation loop ----
	const mainElevationLoopStart = performance.now()
	for (let r = 0; r < numRegions; r++) {
		const isOceanPlate = r_isOcean[r]
		const sf = r_subductFactor[r]

		// Asymmetric mountain profiles
		const asymmetry = 1.0 + (sf - 0.5) * 0.8
		const a = distMountain[r] * asymmetry + eps
		const b = distOcean[r] + eps
		const c = distCoastline[r] + eps
		const BASE_SCALE = 0.6

		if (a === Infinity && b === Infinity) {
			elev[r] = 0.1 * BASE_SCALE
		} else {
			elev[r] = ((1 / a - 1 / b) / (1 / a + 1 / b + 1 / c)) * BASE_SCALE
		}

		const stressNorm = Math.min(1, r_stress[r] / maxStress)
		const btype = r_boundaryType[r]
		const x = r_xyz[3 * r],
			y = r_xyz[3 * r + 1],
			z = r_xyz[3 * r + 2]

		const wx = x + warpScale * fbm(x + 5.3, y + 1.7, z + 3.1, warpOctaves)
		const wy = y + warpScale * fbm(x + 8.1, y + 2.9, z + 7.3, warpOctaves)
		const wz = z + warpScale * fbm(x + 1.4, y + 6.2, z + 4.8, warpOctaves)

		// Orogenic power noise
		const rawOro = noise.noise3D(x * 1.5 + 33.7, y * 1.5 + 11.2, z * 1.5 + 22.9)
		const shaped = rawOro >= 0 ? Math.sqrt(rawOro) : -Math.sqrt(-rawOro)
		const orogenicPower = Math.max(0, Math.min(1, 0.5 + 0.5 * shaped))
		orogenicPowerField[r] = orogenicPower - 0.5

		if (!isOceanPlate) {
			// Subduction suppression
			if (sf > 0.5 && elev[r] > 0) {
				const suppression = (sf - 0.5) * 2
				elev[r] *= 1 - suppression * 0.42
			}

			// Tectonic uplift/depression
			if (stressNorm > 0.01) {
				const stressMag = stressNorm * stressNorm * 0.55 * orogenicPower
				const uplift = stressMag * (1 - sf)
				const depress = stressMag * 0.4 * sf
				const heightVar =
					0.6 + 0.8 * fbm(x * 8 + 13.7, y * 8 + 9.2, z * 8 + 4.5, 3)
				elev[r] += (uplift - depress) * heightVar
			}

			// Foreland basin
			if (stressNorm > 0 && stressNorm < 0.1) {
				const forelandT = stressNorm / 0.1
				elev[r] -= 0.06 * (1 - forelandT)
			}

			// Rift valley
			{
				const rd = riftDist[r]
				if (rd !== Infinity) {
					const floorEnd = Math.max(2, Math.round(2.5 * scaleFactor))
					const shoulderEnd = Math.max(3, Math.round(4 * scaleFactor))
					let riftEffect = 0
					if (rd <= 0.5) {
						riftEffect = -0.25
						riftEffect += riftFbm(x * 8, y * 8, z * 8) * 0.05
					} else if (rd <= floorEnd) {
						const t = rd / floorEnd
						riftEffect = -0.2 * (1 - t * 0.3)
						riftEffect += riftFbm(x * 8, y * 8, z * 8) * 0.04 * (1 - t)
					} else if (rd <= shoulderEnd) {
						const t = (rd - floorEnd) / (shoulderEnd - floorEnd)
						riftEffect = 0.04 * (1 - t)
					} else if (riftHalfWidth > shoulderEnd) {
						const t = (rd - shoulderEnd) / (riftHalfWidth - shoulderEnd)
						const fadeT = Math.min(1, t)
						const fade = fadeT * fadeT * (3 - 2 * fadeT)
						riftEffect = 0.04 * (1 - fade) * 0.2
					}
					elev[r] += riftEffect
					markFeature(r, OROGEN_TERRAIN_FEATURE.RIFT_VALLEY, riftEffect)
				}
			}

			// Pull-apart basins (continental transform faults)
			{
				const pd = pullApartDist[r]
				if (pd !== Infinity) {
					let paEffect = 0
					if (pd <= 0.5) {
						paEffect = -0.18
						paEffect += riftFbm(x * 10, y * 10, z * 10) * 0.04
					} else if (pd <= pullApartHalfWidth) {
						const t = pd / pullApartHalfWidth
						const fade = t * t * (3 - 2 * t)
						paEffect = -0.12 * (1 - fade)
						paEffect += riftFbm(x * 10, y * 10, z * 10) * 0.03 * (1 - fade)
					}
					elev[r] += paEffect
					markFeature(r, OROGEN_TERRAIN_FEATURE.PULL_APART_BASIN, paEffect)
				}
			}

			// Back-arc basin
			{
				const bad = backArcDist[r]
				if (bad !== Infinity && bad >= baStart) {
					const dMtn = distMountain[r]
					const orogenyFactor =
						dMtn !== Infinity && dMtn < bad ? Math.max(0, dMtn / bad) : 1.0
					let baEffect = 0
					if (bad <= baPeak) {
						const t = (bad - baStart) / Math.max(1, baPeak - baStart)
						const s = t * t * (3 - 2 * t)
						baEffect = -0.1 * backArcStress[r] * s * orogenyFactor
					} else if (bad <= baEnd) {
						const t = (bad - baPeak) / Math.max(1, baEnd - baPeak)
						const s = t * t * (3 - 2 * t)
						baEffect = -0.1 * backArcStress[r] * (1 - s) * orogenyFactor
					}
					elev[r] += baEffect
					backArc[r] = baEffect
					markFeature(r, OROGEN_TERRAIN_FEATURE.BACK_ARC_BASIN, baEffect)
				}
			}

			// Tectonic activity (for noise scaling + fold ridges)
			const dMtn = distMountain[r]
			const rawProximity =
				dMtn === Infinity || dMtn >= tectonicReach
					? 0
					: 1 - dMtn / tectonicReach
			const tectonicActivity = Math.max(stressNorm, rawProximity * rawProximity)

			// Fold ridges
			{
				const pid = r_plate[r]
				const pv = plateVec.get(pid)
				const foldActivity = tectonicActivity * tectonicActivity
				if (pv && foldActivity > 0.01) {
					const u = x * pv.pole[0] + y * pv.pole[1] + z * pv.pole[2]
					const phaseWarp =
						foldFbm(x * 3 + 55.3, y * 3 + 33.7, z * 3 + 17.2, 2) * 0.08
					const FOLD_FREQ = 30
					const phase = (u + phaseWarp) * FOLD_FREQ * Math.PI
					const ridge = 1 - Math.abs(Math.sin(phase))
					const foldCentered = ridge - 0.36
					const ampMod =
						0.6 + 0.4 * foldFbm(x * 4 + 88.1, y * 4 + 62.3, z * 4 + 41.7, 2)
					const elevBoost = 1 + 4 * Math.max(0, elev[r])
					const foldAmp =
						foldActivity *
						Math.max(0, 1 - sf * 1.5) *
						noiseMag *
						0.8 *
						elevBoost
					const foldEffect = foldCentered * foldAmp * ampMod
					elev[r] += foldEffect
					foldRidge[r] = foldEffect
					markFeature(r, OROGEN_TERRAIN_FEATURE.FOLD_RIDGES, foldEffect)
				}
			}

			// Plateau zone
			const isPlateauZone =
				sf < 0.45 && dMtn !== Infinity && dMtn > plateauStart

			// Noise
			const blend = Math.min(1, stressNorm * 3)
			const smoothNoise = fbm(wx, wy, wz) * noiseMag
			const ridgedNoisev = ridgedFbm(wx, wy, wz) * noiseMag * 1.5
			const noiseVal = smoothNoise * (1 - blend) + ridgedNoisev * blend
			const detailNoise =
				noise.fbm(wx * 4 + 22.1, wy * 4 + 6.8, wz * 4 + 15.4, 4, 0.5) *
				noiseMag *
				0.5
			const noiseActivity = Math.min(1, stressNorm * 4)
			const plateauSuppress = isPlateauZone
				? Math.max(0.3, 1 - tectonicActivity * 0.6)
				: 1.0
			const noiseScale = (0.25 + 0.75 * noiseActivity) * plateauSuppress
			const fineNoise =
				noise.fbm(wx * 8 + 41.7, wy * 8 + 13.2, wz * 8 + 27.9, 3, 0.5) *
				noiseMag *
				0.25
			const fineScale = Math.sqrt(noiseScale)
			elev[r] += (noiseVal + detailNoise) * noiseScale + fineNoise * fineScale

			// Mountain dissection
			{
				const DISSECT_THRESHOLD = 0.12
				if (elev[r] > DISSECT_THRESHOLD) {
					const elevExcess = elev[r] - DISSECT_THRESHOLD
					const dissectVal = noise.fbm(
						wx * 16 + 71.3,
						wy * 16 + 44.8,
						wz * 16 + 29.1,
						3,
						0.5,
					)
					const dissectAmp = Math.sqrt(elevExcess) * stressNorm * noiseMag * 0.4
					elev[r] += dissectVal * dissectAmp
				}
			}

			// Summit peaks
			{
				const SUMMIT_THRESHOLD = 0.65
				if (elev[r] > SUMMIT_THRESHOLD && stressNorm > 0.2) {
					const excess = elev[r] - SUMMIT_THRESHOLD
					const peakNoise = noise.ridgedFbm(
						wx * 24 + 91.3,
						wy * 24 + 55.7,
						wz * 24 + 38.2,
						3,
						0.5,
						0.5,
						1.0,
					)
					const spike = Math.max(0, peakNoise - 0.45)
					elev[r] += spike * excess * stressNorm * 1.2
				}
			}

			// Continental interior uplift
			const lcd = distCoastLand[r]
			if (lcd < Infinity) {
				const tDown = Math.min(lcd / interiorBand, 1)
				const sDown = tDown * tDown * (3 - 2 * tDown)
				const tUp = Math.min(lcd / (interiorBand * 0.4), 1)
				const sUp = tUp * tUp * (3 - 2 * tUp)
				const INTERIOR_BASE = 0.06
				const INTERIOR_TECTONIC = 0.16
				const interiorUplift =
					INTERIOR_BASE + tectonicActivity * INTERIOR_TECTONIC
				const baseBias = -0.08 * (1 - sDown) + interiorUplift * sUp
				const mod = 1.0 + 0.2 * fbm(x * 2 + 19.3, y * 2 + 7.6, z * 2 + 13.1, 2)
				const interiorEffect = baseBias * mod
				elev[r] += interiorEffect
				markFeature(
					r,
					OROGEN_TERRAIN_FEATURE.CONTINENTAL_INTERIOR,
					interiorEffect,
				)
			}

			// Plateau uplift boost
			if (isPlateauZone && tectonicActivity > 0.1) {
				const plateauEffect = 0.025 * tectonicActivity * (1 - sf)
				elev[r] += plateauEffect
				markFeature(r, OROGEN_TERRAIN_FEATURE.PLATEAU_UPLIFT, plateauEffect)
			}
		} else {
			// ---- Ocean floor ----
			// Shelf width varies: passive margins are wide & shallow,
			// convergent margins are narrow & steep.
			const dc = distCoast[r]
			const isPassive = !coastConvergent[r]
			margins[r] = isPassive ? 0.2 : 0.8
			const shelfScale = isPassive ? 1.8 : 0.6
			const shelfEnd = 5 * shelfScale
			const slopeEnd = shelfEnd + 7 * shelfScale
			let oceanBase: number
			if (dc < shelfEnd) {
				// Continental shelf — gentle slope
				const shelfDepth = isPassive ? -0.03 : -0.05
				const shelfDrop = isPassive ? -0.04 : -0.08
				oceanBase = shelfDepth + shelfDrop * (dc / shelfEnd)
			} else if (dc < slopeEnd) {
				// Continental slope — steeper drop to abyssal plain
				const topDepth = isPassive ? -0.07 : -0.13
				oceanBase = topDepth - 0.25 * ((dc - shelfEnd) / (slopeEnd - shelfEnd))
			} else {
				oceanBase = -0.35 + fbm(x * 2, y * 2, z * 2, 3) * 0.03
			}

			elev[r] = Math.min(elev[r], oceanBase)

			// Mid-ocean ridge
			const rd = ridgeDist[r]
			if (rd !== Infinity && rd <= ridgeHalfWidth) {
				margins[r] = 1
				const t = rd / ridgeHalfWidth
				const ridgeFade = (1 - t) * (1 - t)
				const ridgeN = ridgedFbm(x * 3, y * 3, z * 3, 4)
				const ridgeEffect = (0.12 * ridgeN + 0.06) * ridgeFade
				elev[r] += ridgeEffect
				markFeature(r, OROGEN_TERRAIN_FEATURE.MID_OCEAN_RIDGE, ridgeEffect)
			}

			// Fracture zones
			const fd = fractureDist[r]
			if (fd !== Infinity && fd <= fractureHalfWidth) {
				margins[r] = -0.5
				const ft = fd / fractureHalfWidth
				const fractureEffect = -0.03 * (1 - ft)
				elev[r] += fractureEffect
				markFeature(r, OROGEN_TERRAIN_FEATURE.FRACTURE_ZONE, fractureEffect)
			}

			// Trenches
			if (btype === 1) {
				const trenchEffect = -(0.15 + 0.15 * stressNorm)
				elev[r] += trenchEffect
				markFeature(r, OROGEN_TERRAIN_FEATURE.TRENCH, trenchEffect)
			}

			// Back-arc basin (ocean)
			{
				const bad = backArcDist[r]
				if (bad !== Infinity && bad >= baStart) {
					const dMtn2 = distMountain[r]
					const orogenyFactor =
						dMtn2 !== Infinity && dMtn2 < bad ? Math.max(0, dMtn2 / bad) : 1.0
					let baEffect = 0
					if (bad <= baPeak) {
						const t = (bad - baStart) / Math.max(1, baPeak - baStart)
						const s = t * t * (3 - 2 * t)
						baEffect = -0.1 * backArcStress[r] * s * orogenyFactor
					} else if (bad <= baEnd) {
						const t = (bad - baPeak) / Math.max(1, baEnd - baPeak)
						const s = t * t * (3 - 2 * t)
						baEffect = -0.1 * backArcStress[r] * (1 - s) * orogenyFactor
					}
					elev[r] += baEffect
					backArc[r] = baEffect
					markFeature(r, OROGEN_TERRAIN_FEATURE.BACK_ARC_BASIN, baEffect)
				}
			}

			// Ocean noise
			elev[r] += fbm(wx, wy, wz) * noiseMag * 0.3
		}
	}
	timing?.push({
		Stage: "Main elevation loop (land+ocean)",
		ms: (performance.now() - mainElevationLoopStart).toFixed(1),
	})

	// ---- Coastal roughening ----
	const coastalRougheningStart = performance.now()
	{
		const coastRoughenDist = Math.max(8, Math.round(8 * scaleFactor))
		const cNoise = new SimplexNoise(seed + 77)
		const cNoise2 = new SimplexNoise(seed + 133)
		const cNoise3 = new SimplexNoise(seed + 211)

		function coastFbm(
			n: SimplexNoise,
			x: number,
			y: number,
			z: number,
			octaves = 5,
			persistence = 0.55,
		): number {
			return n.fbm(x, y, z, octaves, persistence)
		}

		for (let r = 0; r < numRegions; r++) {
			if (r_coastDist[r] > coastRoughenDist) continue
			const x = r_xyz[3 * r],
				y = r_xyz[3 * r + 1],
				z = r_xyz[3 * r + 2]
			const t = r_coastDist[r] / coastRoughenDist
			const sn = Math.min(
				1,
				Math.max(coastStressMax[r], r_stress[r] / maxStress),
			)

			const isSubductingOcean =
				r_isOcean[r] && coastConvergent[r] && coastSubductMax[r] > 0.45
			const subSup = isSubductingOcean
				? Math.min(1, (coastSubductMax[r] - 0.45) / 0.55)
				: 0
			const isPassiveCoast = !coastConvergent[r]

			// Layer 1: Coastal fractal noise
			const falloff1 = (1 - t) * (1 - t)
			const stressAmp1 = 1 + sn * 5
			const coastFreq = isPassiveCoast ? 12 : 18
			const coastAmp = isPassiveCoast ? 0.08 : 0.12
			const n1 = coastFbm(
				cNoise,
				x * coastFreq + 3.7,
				y * coastFreq + 7.1,
				z * coastFreq + 2.3,
				5,
				0.55,
			)
			let coastNoise1 = n1 * coastAmp * falloff1 * stressAmp1
			if (subSup > 0 && coastNoise1 > 0) coastNoise1 *= 1 - subSup
			elev[r] += coastNoise1
			coastal[r] += coastNoise1
			markFeature(r, OROGEN_TERRAIN_FEATURE.COASTAL_ROUGHENING, coastNoise1)

			// Layer 3: Coastline-aware domain warping
			const warpReach = isPassiveCoast ? 1.2 : 1.5
			const falloffW = Math.max(0, 1 - t * warpReach)
			if (falloffW > 0) {
				const warpAmt = 0.35 * falloffW * (1 + sn * 2)
				const dwx =
					coastFbm(cNoise3, x * 6 + 11.3, y * 6 + 4.7, z * 6 + 8.2, 3, 0.6) *
					warpAmt
				const dwy =
					coastFbm(cNoise3, x * 6 + 2.9, y * 6 + 9.4, z * 6 + 1.6, 3, 0.6) *
					warpAmt
				const dwz =
					coastFbm(cNoise3, x * 6 + 7.5, y * 6 + 0.3, z * 6 + 5.9, 3, 0.6) *
					warpAmt
				const origN = fbm(x, y, z) * noiseMag
				const warpN = fbm(x + dwx, y + dwy, z + dwz) * noiseMag
				let warpDelta = (warpN - origN) * falloffW
				if (subSup > 0 && warpDelta > 0) warpDelta *= 1 - subSup
				elev[r] += warpDelta
				coastal[r] += warpDelta
				markFeature(r, OROGEN_TERRAIN_FEATURE.COASTAL_ROUGHENING, warpDelta)
			}

			// Layer 2: Island scattering
			if (
				r_isOcean[r] &&
				r_coastDist[r] > 0 &&
				r_coastDist[r] <= Math.max(4, Math.round(4 * scaleFactor)) &&
				subSup < 0.3
			) {
				const islandN = coastFbm(
					cNoise2,
					x * 35 + 5.1,
					y * 35 + 9.3,
					z * 35 + 2.7,
					4,
					0.5,
				)
				const threshold = 0.25 - sn * 0.2
				if (islandN > threshold) {
					const excess = (islandN - threshold) / (1 - threshold)
					const distFade =
						1 - r_coastDist[r] / Math.max(4, Math.round(4 * scaleFactor))
					let bump = excess * excess * 0.18 * (1 + sn * 2) * distFade
					bump *= 1 - subSup / 0.3
					elev[r] += bump
					coastal[r] += bump
					markFeature(r, OROGEN_TERRAIN_FEATURE.COASTAL_ROUGHENING, bump)
				}
			}
		}
	}
	timing?.push({
		Stage: "Coastal roughening",
		ms: (performance.now() - coastalRougheningStart).toFixed(1),
	})

	// ---- Island arcs ----
	const islandArcsStart = performance.now()
	{
		const arcNoise = new SimplexNoise(seed + 307)
		const maxArcDist = Math.max(5, Math.round(5 * scaleFactor))
		const arcDist = new Float32Array(numRegions).fill(maxArcDist + 1)
		const arcStress = new Float32Array(numRegions)
		const arcSeedsList: number[] = []

		for (let r = 0; r < numRegions; r++) {
			if (
				r_boundaryType[r] === 1 &&
				r_bothOcean[r] &&
				r_subductFactor[r] < 0.45
			) {
				arcSeedsList.push(r)
				arcDist[r] = 0
				arcStress[r] = Math.min(1, r_stress[r] / maxStress)
			}
		}

		let aq = 0
		while (aq < arcSeedsList.length) {
			const r = arcSeedsList[aq++]
			const nd = arcDist[r] + 1
			if (nd > maxArcDist) continue
			const plate = r_plate[r]
			for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
				const nr = adjList[ni]
				if (nd < arcDist[nr] && r_plate[nr] === plate && r_isOcean[nr]) {
					arcDist[nr] = nd
					arcStress[nr] = arcStress[r]
					arcSeedsList.push(nr)
				}
			}
		}

		for (let r = 0; r < numRegions; r++) {
			const d = arcDist[r]
			if (d < 1 || d > maxArcDist) continue
			const x = r_xyz[3 * r],
				y = r_xyz[3 * r + 1],
				z = r_xyz[3 * r + 2]
			const peakDist = Math.max(1.5, 1.5 * scaleFactor)
			const sigma = Math.max(1.5, 1.5 * scaleFactor)
			const distWeight = Math.exp(-0.5 * ((d - peakDist) / sigma) ** 2)
			const n = arcNoise.ridgedFbm(x * 4, y * 4, z * 4, 4, 2.0, 0.5, 1.0)
			const threshold = 0.3
			if (n > threshold) {
				const excess = (n - threshold) / (1 - threshold)
				let uplift = excess * excess * 0.55 * distWeight * (0.5 + arcStress[r])
				if (r_isOcean[r]) {
					const maxOceanUplift = Math.max(0, -elev[r] + MAX_OCEAN_ARC_ELEV)
					uplift = Math.min(uplift, maxOceanUplift)
				}
				elev[r] += uplift
				if (uplift > 0.001) {
					markFeature(r, OROGEN_TERRAIN_FEATURE.ISLAND_ARC, uplift)
				}
			}
		}
	}
	timing?.push({
		Stage: "Island arcs",
		ms: (performance.now() - islandArcsStart).toFixed(1),
	})

	const volcanicArcsStart = performance.now()
	applyVolcanicArcs({
		mesh,
		elevation: elev,
		boundary,
		maxStress,
		seed,
		volcanism,
		markFeature,
	})
	timing?.push({
		Stage: "Volcanic arcs",
		ms: (performance.now() - volcanicArcsStart).toFixed(1),
	})

	void coastal
	void margins
	void backArc
	void foldRidge
	void orogenicPowerField

	return {
		elevation: elev,
		terrainFeatures: {
			featureMask,
			dominantFeature,
			dominantMagnitude,
		},
	}
}
