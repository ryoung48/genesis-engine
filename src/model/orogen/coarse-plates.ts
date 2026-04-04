/**
 * Coarse reference grid for resolution-independent plate boundaries.
 * Generates plates on a fixed ~20K-region mesh, then projects onto any
 * high-res mesh with FBM noise perturbation for fractal boundaries.
 * Faithful port of orogen's coarse-plates.js.
 */

import { buildSphereMesh } from "./mesh"
import { assignOceanLand, generatePlates } from "./plates"
import { makeRng } from "./rng"
import { SimplexNoise } from "./simplex-noise"
import type { PlateVec, SphereMesh } from "./types"

const N_COARSE = 20000
const COARSE_JITTER = 0.75

export interface CoarsePlateResult {
	coarseMesh: SphereMesh
	coarse_r_plate: Int32Array
	coarsePlateSeeds: Set<number>
	coarsePlateVec: Map<number, PlateVec>
	coarsePlateIsOcean: Set<number>
}

/**
 * Generate plates and ocean/land on a fixed coarse reference mesh.
 * Matches source: makeRng(seed+137) only for mesh building,
 * generatePlates and assignOceanLand use raw seed internally.
 */
export function generateCoarsePlates(
	seed: number,
	numPlates: number,
	landDistribution: number,
	continentSizeVariety: number,
	landCoverage: number,
): CoarsePlateResult {
	// Coarse mesh uses isolated RNG — matches source coarse-plates.js
	const coarseRng = makeRng(seed + 137)
	const coarseMesh = buildSphereMesh(N_COARSE, COARSE_JITTER, {
		random: () => coarseRng(),
		randint: (a: number, b: number) =>
			a + Math.floor(coarseRng() * (b - a + 1)),
	})

	// generatePlates creates its own dual RNGs internally (seed+0.5 and seed)
	const {
		r_plate: coarse_r_plate,
		plateSeeds: coarsePlateSeeds,
		plateVec: coarsePlateVec,
	} = generatePlates(coarseMesh, numPlates, seed)

	// assignOceanLand creates its own RNG internally (seed+42)
	const coarsePlateIsOcean = assignOceanLand(
		coarseMesh,
		coarse_r_plate,
		coarsePlateSeeds,
		seed,
		landDistribution,
		continentSizeVariety,
		landCoverage,
	)

	return {
		coarseMesh,
		coarse_r_plate,
		coarsePlateSeeds,
		coarsePlateVec,
		coarsePlateIsOcean,
	}
}

/**
 * Project coarse plate assignments onto a high-res mesh via nearest-neighbor
 * with FBM noise perturbation for fractal plate boundaries.
 *
 * Uses adjacency-walk on the coarse mesh with warm-starting for O(1)
 * amortized cost per region.
 */
export function projectCoarsePlates(
	mesh: SphereMesh,
	coarseMesh: SphereMesh,
	coarse_r_plate: Int32Array,
	seed: number,
	numPlates: number,
): Int32Array {
	const N = mesh.numRegions
	const r_plate = new Int32Array(N)
	const { adjOffset: cOff, adjList: cAdj, r_xyz: coarse_xyz } = coarseMesh
	const { r_xyz } = mesh

	// FBM noise for fractal boundary perturbation
	const noise = new SimplexNoise(seed + 999)
	const coarseEdgeRad = Math.PI / Math.sqrt(coarseMesh.numRegions)
	const lowPlateT = Math.max(0, Math.min(1, (80 - numPlates) / 60))
	const perturbAmp = coarseEdgeRad * (1.5 + 1.0 * lowPlateT)
	const BASE_FREQ = 8

	const NC = coarseMesh.numRegions
	const MAX_WALK = Math.ceil(Math.sqrt(NC))
	let cur = 0

	for (let r = 0; r < N; r++) {
		const ox = r_xyz[3 * r],
			oy = r_xyz[3 * r + 1],
			oz = r_xyz[3 * r + 2]

		// FBM perturbation: shift lookup point for fractal boundaries
		let dx = 0,
			dy = 0,
			dz = 0
		let amp = perturbAmp,
			freq = BASE_FREQ
		for (let oct = 0; oct < 4; oct++) {
			dx += noise.noise3D(ox * freq, oy * freq, oz * freq) * amp
			dy +=
				noise.noise3D(ox * freq + 100, oy * freq + 100, oz * freq + 100) * amp
			dz +=
				noise.noise3D(ox * freq + 200, oy * freq + 200, oz * freq + 200) * amp
			amp *= 0.5
			freq *= 2
		}

		// Project perturbed point back onto unit sphere
		let px = ox + dx,
			py = oy + dy,
			pz = oz + dz
		const len = Math.sqrt(px * px + py * py + pz * pz) || 1
		px /= len
		py /= len
		pz /= len

		// Greedy walk: find nearest coarse region to the perturbed point
		let bestDot =
			px * coarse_xyz[3 * cur] +
			py * coarse_xyz[3 * cur + 1] +
			pz * coarse_xyz[3 * cur + 2]

		let improved = true
		let steps = 0
		while (improved && steps < MAX_WALK) {
			improved = false
			steps++
			for (let i = cOff[cur], iEnd = cOff[cur + 1]; i < iEnd; i++) {
				const nb = cAdj[i]
				const d =
					px * coarse_xyz[3 * nb] +
					py * coarse_xyz[3 * nb + 1] +
					pz * coarse_xyz[3 * nb + 2]
				if (d > bestDot) {
					bestDot = d
					cur = nb
					improved = true
				}
			}
		}

		// Fallback: if greedy walk hit the step limit, brute-force search
		if (steps >= MAX_WALK) {
			for (let c = 0; c < NC; c++) {
				const d =
					px * coarse_xyz[3 * c] +
					py * coarse_xyz[3 * c + 1] +
					pz * coarse_xyz[3 * c + 2]
				if (d > bestDot) {
					bestDot = d
					cur = c
				}
			}
		}

		r_plate[r] = coarse_r_plate[cur]
	}

	return r_plate
}
