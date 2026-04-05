/**
 * Collision detection, stress propagation, and dual-layer super plate blending.
 * Faithful port of orogen's elevation.js collision/stress logic.
 */

import type {
	BoundaryInfo,
	CollisionResult,
	PlateVec,
	SphereMesh,
	SuperPlateData,
} from "../types"
import { SimplexNoise } from "../util/simplex-noise"

const COLLISION_THRESHOLD = 0.75
type StageTiming = { Stage: string; ms: string }

function plateVelocityAt(
	plateVec: Map<number, PlateVec>,
	plateId: number,
	x: number,
	y: number,
	z: number,
): [number, number, number] {
	const pv = plateVec.get(plateId)
	if (!pv) return [0, 0, 0]
	const px = pv.pole[0],
		py = pv.pole[1],
		pz = pv.pole[2]
	const omega = pv.omega
	return [
		omega * (py * z - pz * y),
		omega * (pz * x - px * z),
		omega * (px * y - py * x),
	]
}

export function findCollisions(
	mesh: SphereMesh,
	r_xyz: Float32Array,
	plateIsOcean: Set<number>,
	r_plate: Int32Array,
	plateVec: Map<number, PlateVec>,
	plateDensity: Map<number, number>,
	noise: SimplexNoise,
): CollisionResult {
	const dt = 1e-2 / Math.max(1, Math.sqrt(mesh.numRegions / 10000))
	const { numRegions, adjOffset, adjList } = mesh

	const mountain_r = new Set<number>()
	const coastline_r = new Set<number>()
	const ocean_r = new Set<number>()
	const r_stress = new Float32Array(numRegions)
	const r_subductFactor = new Float32Array(numRegions).fill(0.5)
	const r_boundaryType = new Int8Array(numRegions)
	const r_bothOcean = new Uint8Array(numRegions)
	const r_hasOcean = new Uint8Array(numRegions)

	// Pair intensity cache for consistent per-plate-pair randomization
	const pairCache = new Map<number, number>()
	function getPairIntensity(a: number, b: number): number {
		const lo = Math.min(a, b),
			hi = Math.max(a, b)
		const key = lo * 1000003 + hi
		const cached = pairCache.get(key)
		if (cached !== undefined) return cached
		let h = ((lo * 16807) ^ (hi * 48271)) >>> 0
		h = (((h >> 16) ^ h) * 0x45d9f3b) >>> 0
		const val = 0.5 + (h % 10001) / 10000
		pairCache.set(key, val)
		return val
	}

	const undulOctaves = numRegions > 200000 ? 2 : 3

	for (let r = 0; r < numRegions; r++) {
		const myPlate = r_plate[r]
		let bestComp = -Infinity
		let best = -1
		let bestNormalComp = 0

		for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
			const nb = adjList[ni]
			if (myPlate !== r_plate[nb]) {
				const ri3 = 3 * r,
					ni3 = 3 * nb
				const dx = r_xyz[ri3] - r_xyz[ni3]
				const dy = r_xyz[ri3 + 1] - r_xyz[ni3 + 1]
				const dz = r_xyz[ri3 + 2] - r_xyz[ni3 + 2]
				const dBefore = Math.sqrt(dx * dx + dy * dy + dz * dz)

				const v1 = plateVelocityAt(
					plateVec,
					myPlate,
					r_xyz[ri3],
					r_xyz[ri3 + 1],
					r_xyz[ri3 + 2],
				)
				const v2 = plateVelocityAt(
					plateVec,
					r_plate[nb],
					r_xyz[ni3],
					r_xyz[ni3 + 1],
					r_xyz[ni3 + 2],
				)
				const ax = r_xyz[ri3] + v1[0] * dt,
					ay = r_xyz[ri3 + 1] + v1[1] * dt,
					az = r_xyz[ri3 + 2] + v1[2] * dt
				const bx = r_xyz[ni3] + v2[0] * dt,
					by = r_xyz[ni3 + 1] + v2[1] * dt,
					bz = r_xyz[ni3 + 2] + v2[2] * dt
				const adx = ax - bx,
					ady = ay - by,
					adz = az - bz
				const dAfter = Math.sqrt(adx * adx + ady * ady + adz * adz)
				const comp = dBefore - dAfter

				if (comp > bestComp) {
					bestComp = comp
					best = nb
					const rvx = v1[0] - v2[0],
						rvy = v1[1] - v2[1],
						rvz = v1[2] - v2[2]
					const bnLen = dBefore || 1
					bestNormalComp = -(rvx * dx + rvy * dy + rvz * dz) / bnLen
				}
			}
		}

		if (best !== -1) {
			const collided = bestComp > COLLISION_THRESHOLD * dt
			const rOcean = plateIsOcean.has(myPlate) ? 1 : 0
			const nOcean = plateIsOcean.has(r_plate[best]) ? 1 : 0
			r_bothOcean[r] = rOcean && nOcean ? 1 : 0
			r_hasOcean[r] = rOcean || nOcean ? 1 : 0

			const thresh = 0.3 * dt
			if (bestNormalComp > thresh) r_boundaryType[r] = 1
			else if (bestNormalComp < -thresh) r_boundaryType[r] = 2
			else r_boundaryType[r] = 3

			if (collided) {
				r_stress[r] = (bestComp / dt) * getPairIntensity(myPlate, r_plate[best])
			}

			// Density-based subduction factor
			const myDensity = plateDensity.get(myPlate) ?? 2.7
			const nbDensity = plateDensity.get(r_plate[best]) ?? 2.7
			const densityDiff = myDensity - nbDensity
			const baseFactor = 0.5 + 0.5 * Math.tanh(densityDiff * 8)
			const densityContrast = Math.abs(densityDiff)
			const undulationStrength = Math.exp(-densityContrast * 12)
			const x = r_xyz[3 * r],
				y = r_xyz[3 * r + 1],
				z = r_xyz[3 * r + 2]
			const undulation =
				noise.fbm(x * 6, y * 6, z * 6, undulOctaves) * 0.4 * undulationStrength
			r_subductFactor[r] = Math.max(0, Math.min(1, baseFactor + undulation))

			if (rOcean && nOcean) {
				;(collided ? coastline_r : ocean_r).add(r)
			} else if (!rOcean && !nOcean) {
				if (collided) {
					if (r_subductFactor[r] < 0.55) mountain_r.add(r)
					else coastline_r.add(r)
				}
			} else {
				;(collided ? mountain_r : coastline_r).add(r)
			}
		}
	}

	return {
		mountain_r,
		coastline_r,
		ocean_r,
		r_stress,
		r_subductFactor,
		r_boundaryType,
		r_bothOcean,
		r_hasOcean,
	}
}

/**
 * Frontier-based BFS stress diffusion inward from boundaries.
 */
export function propagateStress(
	mesh: SphereMesh,
	r_stress: Float32Array,
	r_subductFactor: Float32Array,
	r_plate: Int32Array,
	plateIsOcean: Set<number>,
	decayFactor: number,
	subductDecayFactor: number,
	numPasses: number,
): void {
	const { adjOffset, adjList, numRegions } = mesh

	let frontier: number[] = []
	for (let r = 0; r < numRegions; r++) {
		if (r_stress[r] > 0.01) frontier.push(r)
	}

	for (let pass = 0; pass < numPasses && frontier.length > 0; pass++) {
		const nextFrontier: number[] = []
		for (const r of frontier) {
			const plate = r_plate[r]
			if (plateIsOcean.has(plate)) continue
			const sf = r_subductFactor[r]
			const effDecay = sf > 0.5 ? subductDecayFactor : decayFactor
			const propagated = r_stress[r] * effDecay
			if (propagated < 0.005) continue

			for (let ni = adjOffset[r], niEnd = adjOffset[r + 1]; ni < niEnd; ni++) {
				const nb = adjList[ni]
				if (r_plate[nb] === plate && propagated > r_stress[nb]) {
					r_stress[nb] = propagated
					r_subductFactor[nb] = sf
					nextFrontier.push(nb)
				}
			}
		}
		frontier = nextFrontier
	}
}

/**
 * Classify boundaries with dual-layer super plate blending (orogen port).
 * Runs findCollisions on both small plates and super plates, then blends.
 */
export function classifyBoundaries(
	mesh: SphereMesh,
	r_plate: Int32Array,
	plateSeeds: number[],
	plateVec: Map<number, PlateVec>,
	plateIsOcean: Set<number>,
	plateDensity: Map<number, number>,
	superPlateData: SuperPlateData | null,
	seed: number,
	spread: number,
	timing?: StageTiming[],
): BoundaryInfo {
	const { numRegions, r_xyz } = mesh
	const noise = new SimplexNoise(seed)

	// Small-plate collisions (always computed)
	const collisionsStart = performance.now()
	const smallCol = findCollisions(
		mesh,
		r_xyz,
		plateIsOcean,
		r_plate,
		plateVec,
		plateDensity,
		noise,
	)

	const hasSuperPlates = superPlateData != null
	let superCol: CollisionResult | null = null
	if (hasSuperPlates) {
		superCol = findCollisions(
			mesh,
			r_xyz,
			superPlateData.superPlateIsOcean,
			superPlateData.r_superPlate,
			superPlateData.superPlateVec,
			superPlateData.superPlateDensity,
			noise,
		)
	}
	timing?.push({
		Stage: "Collisions (dual)",
		ms: (performance.now() - collisionsStart).toFixed(1),
	})

	let mountain_r: Set<number>
	let coastline_r: Set<number>
	let ocean_r: Set<number>
	let r_stress: Float32Array
	let r_subductFactor: Float32Array
	let r_boundaryType: Int8Array
	let r_bothOcean: Uint8Array
	let r_hasOcean: Uint8Array

	const SMALL_W = 0.05
	const SUPER_W = 0.95

	if (!hasSuperPlates || !superCol) {
		;({
			mountain_r,
			coastline_r,
			ocean_r,
			r_stress,
			r_subductFactor,
			r_boundaryType,
			r_bothOcean,
			r_hasOcean,
		} = smallCol)
	} else {
		// Union seed sets
		mountain_r = new Set([...superCol.mountain_r, ...smallCol.mountain_r])
		ocean_r = new Set([...superCol.ocean_r, ...smallCol.ocean_r])
		coastline_r = new Set<number>()
		for (const r of superCol.coastline_r) {
			if (!mountain_r.has(r)) coastline_r.add(r)
		}
		for (const r of smallCol.coastline_r) {
			if (!mountain_r.has(r) && !coastline_r.has(r)) coastline_r.add(r)
		}

		// Stress blending with smooth ramp
		r_stress = new Float32Array(numRegions)
		{
			let maxSuperStress = 0
			for (let r = 0; r < numRegions; r++) {
				if (superCol.r_stress[r] > maxSuperStress)
					maxSuperStress = superCol.r_stress[r]
			}
			const invMax = maxSuperStress > 1e-6 ? 1 / maxSuperStress : 0
			for (let r = 0; r < numRegions; r++) {
				const sS = smallCol.r_stress[r],
					sP = superCol.r_stress[r]
				const proximity = Math.min(1, sP * invMax * 3)
				const effectiveSmallW = SMALL_W * (SMALL_W + (1 - SMALL_W) * proximity)
				r_stress[r] = effectiveSmallW * sS + SUPER_W * sP
			}
		}

		// SubductFactor blend
		r_subductFactor = new Float32Array(numRegions)
		for (let r = 0; r < numRegions; r++) {
			const wS = SMALL_W * smallCol.r_stress[r],
				wP = SUPER_W * superCol.r_stress[r]
			const total = wS + wP
			if (total > 1e-6) {
				r_subductFactor[r] =
					(wS * smallCol.r_subductFactor[r] +
						wP * superCol.r_subductFactor[r]) /
					total
			} else {
				r_subductFactor[r] =
					SMALL_W * smallCol.r_subductFactor[r] +
					SUPER_W * superCol.r_subductFactor[r]
			}
		}

		// BoundaryType: use whichever layer has higher weighted stress
		r_boundaryType = new Int8Array(numRegions)
		for (let r = 0; r < numRegions; r++) {
			const wS = SMALL_W * smallCol.r_stress[r]
			const wP = SUPER_W * superCol.r_stress[r]
			r_boundaryType[r] =
				wS > wP ? smallCol.r_boundaryType[r] : superCol.r_boundaryType[r]
		}

		// Boolean flags
		r_bothOcean = new Uint8Array(numRegions)
		r_hasOcean = new Uint8Array(numRegions)
		for (let r = 0; r < numRegions; r++) {
			r_bothOcean[r] = smallCol.r_bothOcean[r] | superCol.r_bothOcean[r]
			r_hasOcean[r] = smallCol.r_hasOcean[r] | superCol.r_hasOcean[r]
		}
	}

	// Propagate stress inward
	const scaleFactor = Math.sqrt(numRegions / 10000)
	const baseDecay = 0.5 + spread * 0.04
	const decayFactor = Math.pow(baseDecay, 1 / scaleFactor)
	const subductBaseDecay = baseDecay * 0.45
	const subductDecayFactor = Math.pow(subductBaseDecay, 1 / scaleFactor)
	const numPasses = Math.max(1, Math.round(spread * 3 * scaleFactor))
	const stressStart = performance.now()

	if (!hasSuperPlates || !superCol) {
		propagateStress(
			mesh,
			r_stress,
			r_subductFactor,
			r_plate,
			plateIsOcean,
			decayFactor,
			subductDecayFactor,
			numPasses,
		)
	} else {
		// Dual stress propagation: each layer within its own plates, then blend
		const smallStress = new Float32Array(smallCol.r_stress)
		const smallSubduct = new Float32Array(smallCol.r_subductFactor)
		propagateStress(
			mesh,
			smallStress,
			smallSubduct,
			r_plate,
			plateIsOcean,
			decayFactor,
			subductDecayFactor,
			numPasses,
		)

		const superStress = new Float32Array(superCol.r_stress)
		const superSubduct = new Float32Array(superCol.r_subductFactor)
		propagateStress(
			mesh,
			superStress,
			superSubduct,
			superPlateData!.r_superPlate,
			superPlateData!.superPlateIsOcean,
			decayFactor,
			subductDecayFactor,
			numPasses,
		)

		// Blend propagated stress
		for (let r = 0; r < numRegions; r++) {
			r_stress[r] = SMALL_W * smallStress[r] + SUPER_W * superStress[r]
		}

		// Update subduct factor from propagated values
		for (let r = 0; r < numRegions; r++) {
			const wS = SMALL_W * smallStress[r],
				wP = SUPER_W * superStress[r]
			const total = wS + wP
			if (total > 1e-6) {
				r_subductFactor[r] =
					(wS * smallSubduct[r] + wP * superSubduct[r]) / total
			}
		}
	}
	timing?.push({
		Stage: "Stress propagation (dual)",
		ms: (performance.now() - stressStart).toFixed(1),
	})

	// Plate interiors: find a representative hi-res region per plate
	{
		const plateRep = new Map<number, number>()
		for (let r = 0; r < numRegions; r++) {
			const pid = r_plate[r]
			if (
				!plateRep.has(pid) &&
				!mountain_r.has(r) &&
				!coastline_r.has(r) &&
				!ocean_r.has(r)
			) {
				plateRep.set(pid, r)
			}
		}
		for (const pid of plateSeeds) {
			const rep = plateRep.get(pid)
			if (rep !== undefined) {
				;(plateIsOcean.has(pid) ? ocean_r : coastline_r).add(rep)
			}
		}
	}

	return {
		mountain_r,
		coastline_r,
		ocean_r,
		r_stress,
		r_subductFactor,
		r_boundaryType,
		r_bothOcean,
		r_hasOcean,
	}
}
