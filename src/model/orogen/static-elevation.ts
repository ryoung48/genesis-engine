/**
 * Static elevation generator for stagnant lid worlds.
 * Produces terrain from a single base simplex-noise field.
 */

import { SimplexNoise } from "./simplex-noise"
import type { SphereMesh } from "./types"

/**
 * Base terrain: multi-octave simplex noise at continent scale.
 * Provides the broad land/ocean structure.
 */
function addBaseNoise(
	mesh: SphereMesh,
	elevation: Float32Array,
	baseNoise: SimplexNoise,
	detailNoise: SimplexNoise,
	roughness: number,
	plateOceanMask: Uint8Array,
): void {
	const { numRegions, r_xyz } = mesh
	const persistence = 0.52 + roughness * 0.18
	for (let r = 0; r < numRegions; r++) {
		const x = r_xyz[3 * r],
			y = r_xyz[3 * r + 1],
			z = r_xyz[3 * r + 2]
		const warpX =
			detailNoise.fbm(x * 1.6 + 17.3, y * 1.6 + 9.1, z * 1.6 + 23.7, 2, 0.5) *
			0.3
		const warpY =
			detailNoise.fbm(x * 1.6 + 31.9, y * 1.6 + 14.7, z * 1.6 + 5.3, 2, 0.5) *
			0.3
		const warpZ =
			detailNoise.fbm(x * 1.6 + 7.1, y * 1.6 + 28.4, z * 1.6 + 12.9, 2, 0.5) *
			0.3
		const wx = x + warpX
		const wy = y + warpY
		const wz = z + warpZ

		const mega = Math.max(
			0,
			baseNoise.fbm(
				wx * 0.7 + 88.3,
				wy * 0.7 + 44.1,
				wz * 0.7 + 61.7,
				3,
				persistence,
			),
		)
		const broad = Math.max(
			0,
			baseNoise.fbm(wx * 1.4, wy * 1.4, wz * 1.4, 5, persistence),
		)
		const mid = Math.max(
			0,
			detailNoise.fbm(
				wx * 2.6 + 51.2,
				wy * 2.6 + 19.8,
				wz * 2.6 + 37.4,
				4,
				persistence,
			),
		)
		const ridgeMask =
			0.35 +
			0.65 *
				Math.max(
					0,
					detailNoise.fbm(
						wx * 2.4 + 12.1,
						wy * 2.4 + 33.6,
						wz * 2.4 + 18.5,
						3,
						0.5,
					),
				)
		const ridged =
			Math.max(
				0,
				detailNoise.ridgedFbm(
					wx * 3.5 + 41.2,
					wy * 3.5 + 13.8,
					wz * 3.5 + 29.4,
					4,
					2.0,
					0.5,
					1.0,
				) - 0.45,
			) * ridgeMask
		const detail = Math.max(
			0,
			baseNoise.fbm(wx * 7.0 + 63.5, wy * 7.0 + 22.7, wz * 7.0 + 48.1, 3, 0.5),
		)
		const fine = Math.max(
			0,
			detailNoise.fbm(
				wx * 12.0 + 71.6,
				wy * 12.0 + 18.4,
				wz * 12.0 + 52.3,
				3,
				0.48,
			),
		)

		const noise =
			mega * 0.35 +
			broad * 0.5 +
			mid * 0.4 +
			ridged * 0.3 +
			(detail + fine * 0.6) * 0.18
		const sign = plateOceanMask[r] ? -1 : 1
		elevation[r] += sign * noise
	}
}

/**
 * Plate-based land/ocean calibration: uses a smooth signed distance field
 * from plate boundaries to bias elevation. Near plate boundaries noise alone
 * shapes the coastline; deep in each plate type the bias guarantees the
 * correct sign (positive = land, negative = ocean).
 */
function applyPlateBias(
	mesh: SphereMesh,
	elevation: Float32Array,
	plateOceanMask: Uint8Array,
	seed: number,
): void {
	const N = mesh.numRegions
	const { adjOffset, adjList, r_xyz } = mesh

	// BFS distance from plate boundaries (land/ocean transitions)
	const dist = new Float32Array(N).fill(Infinity)
	const queue: number[] = []
	for (let r = 0; r < N; r++) {
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			if (plateOceanMask[adjList[j]] !== plateOceanMask[r]) {
				dist[r] = 0
				queue.push(r)
				break
			}
		}
	}

	let head = 0
	while (head < queue.length) {
		const r = queue[head++]
		const d = dist[r] + 1
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (d < dist[nb]) {
				dist[nb] = d
				queue.push(nb)
			}
		}
	}

	const scaleFactor = Math.sqrt(N / 10000)
	const interiorStrength = 0.18

	// Continental shelf parameters (uniform style — no subduction distinction)
	const shelfEnd = Math.max(3, Math.round(5 * scaleFactor))
	const slopeEnd = shelfEnd + Math.max(4, Math.round(7 * scaleFactor))

	for (let r = 0; r < N; r++) {
		if (plateOceanMask[r]) {
			// Ocean: continental shelf → slope → abyssal plain
			const dc = dist[r]
			if (dc < shelfEnd) {
				const t = dc / shelfEnd
				elevation[r] += -0.03 - 0.04 * t
			} else if (dc < slopeEnd) {
				const t = (dc - shelfEnd) / (slopeEnd - shelfEnd)
				elevation[r] += -0.07 - 0.25 * t
			} else {
				elevation[r] += -0.32
			}
		} else {
			// Land: interior uplift
			const transWidth = Math.max(2, Math.round(4 * scaleFactor))
			const d = Math.min(dist[r], transWidth) / transWidth
			const coastalBlend = d * d * (3 - 2 * d)
			elevation[r] += interiorStrength * coastalBlend
		}
	}

	// Coastal roughening — fractal noise near the coast
	const coastRoughenDist = Math.max(8, Math.round(8 * scaleFactor))
	const cNoise = new SimplexNoise(seed + 77)
	const cNoise2 = new SimplexNoise(seed + 133)
	const cNoise3 = new SimplexNoise(seed + 211)

	for (let r = 0; r < N; r++) {
		if (dist[r] > coastRoughenDist) continue
		const x = r_xyz[3 * r],
			y = r_xyz[3 * r + 1],
			z = r_xyz[3 * r + 2]
		const t = dist[r] / coastRoughenDist

		// Layer 1: Low-frequency coastal warping (broad bays/peninsulas)
		const falloff1 = (1 - t) * (1 - t)
		const n1low = cNoise.fbm(x * 5 + 22.4, y * 5 + 14.8, z * 5 + 31.6, 4, 0.55)
		elevation[r] += n1low * 0.14 * falloff1

		// Layer 2: Mid-frequency coastal noise
		const n1mid = cNoise2.fbm(x * 14 + 3.7, y * 14 + 7.1, z * 14 + 2.3, 5, 0.55)
		elevation[r] += n1mid * 0.1 * falloff1

		// Layer 3: High-frequency coastal jaggedness
		const n1hi = cNoise3.fbm(x * 28 + 41.2, y * 28 + 17.9, z * 28 + 8.6, 4, 0.5)
		elevation[r] += n1hi * 0.05 * falloff1

		// Layer 4: Ridged coastal features (headlands/cliffs)
		const ridgeN = cNoise.ridgedFbm(
			x * 10 + 55.3,
			y * 10 + 32.1,
			z * 10 + 19.7,
			3,
			2.0,
			0.5,
			1.0,
		)
		elevation[r] += (ridgeN - 0.5) * 0.07 * falloff1

		// Layer 5: Coastline-aware domain warping
		const falloffW = Math.max(0, 1 - t * 1.3)
		if (falloffW > 0) {
			const warpAmt = 0.4 * falloffW
			const dwx =
				cNoise3.fbm(x * 6 + 11.3, y * 6 + 4.7, z * 6 + 8.2, 3, 0.6) * warpAmt
			const dwy =
				cNoise3.fbm(x * 6 + 2.9, y * 6 + 9.4, z * 6 + 1.6, 3, 0.6) * warpAmt
			const dwz =
				cNoise3.fbm(x * 6 + 7.5, y * 6 + 0.3, z * 6 + 5.9, 3, 0.6) * warpAmt
			const origN = cNoise.fbm(x * 8, y * 8, z * 8, 4, 0.5) * 0.08
			const warpN =
				cNoise.fbm((x + dwx) * 8, (y + dwy) * 8, (z + dwz) * 8, 4, 0.5) * 0.08
			elevation[r] += (warpN - origN) * falloffW
		}

		// Layer 6: Island scattering near ocean coasts
		if (
			plateOceanMask[r] &&
			dist[r] > 0 &&
			dist[r] <= Math.max(4, Math.round(4 * scaleFactor))
		) {
			const islandN = cNoise2.fbm(
				x * 35 + 5.1,
				y * 35 + 9.3,
				z * 35 + 2.7,
				4,
				0.5,
			)
			const threshold = 0.2
			if (islandN > threshold) {
				const excess = (islandN - threshold) / (1 - threshold)
				const distFade = 1 - dist[r] / Math.max(4, Math.round(4 * scaleFactor))
				elevation[r] += excess * excess * 0.22 * distFade
			}
		}
	}
}

export function generateStaticElevation(
	mesh: SphereMesh,
	seed: number,
	roughness: number,
	_landCoverage: number,
	_volcanism: number,
	plateOceanMask: Uint8Array,
): Float32Array {
	const elevation = new Float32Array(mesh.numRegions)
	const baseNoise = new SimplexNoise(seed + 2001)
	const detailNoise = new SimplexNoise(seed + 2002)

	addBaseNoise(
		mesh,
		elevation,
		baseNoise,
		detailNoise,
		roughness,
		plateOceanMask,
	)
	applyPlateBias(mesh, elevation, plateOceanMask, seed)

	return elevation
}
