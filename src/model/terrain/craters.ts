/**
 * Impact craters — stamps large circular depressions with rims and ejecta
 * blankets onto the elevation field. Applied after all terrain post-processing
 * so craters remain crisp and visible.
 */

import type { SphereMesh } from ".."
import { createRng, SimplexNoise } from "../shared"

interface Crater {
	cx: number
	cy: number
	cz: number
	radius: number // angular radius in radians
	depth: number // bowl depth (elevation units)
	rimHeight: number // rim elevation boost
	cosThresh: number // early-out: cos(radius * 2.5)
}

export function applyCraters(
	mesh: SphereMesh,
	elevation: Float32Array,
	seed: number,
	intensity: number,
	planetRadiusKm = 3185,
): void {
	if (intensity <= 0) return

	const { numRegions, r_xyz } = mesh
	const rng = createRng(seed + 4242)
	const noise = new SimplexNoise(seed + 4243)

	// Reference radius: 0.5Ã— Earth ≈ 3185 km — current sizes calibrated here
	const refRadius = 3185
	const radiusRatio = planetRadiusKm / refRadius

	// Count scales with √radius — gentle increase so craters stay visible on large planets
	const count = Math.round(intensity * intensity * 120 * Math.sqrt(radiusRatio))
	if (count === 0) return

	// Generate crater list
	const craters: Crater[] = []
	for (let i = 0; i < count; i++) {
		// Uniform random point on sphere
		const theta = 2 * Math.PI * rng.random()
		const cosPhi = 2 * rng.random() - 1
		const sinPhi = Math.sqrt(1 - cosPhi * cosPhi)
		const cx = sinPhi * Math.cos(theta)
		const cy = sinPhi * Math.sin(theta)
		const cz = cosPhi

		// Angular radius scales with 1/√radius — softer than pure inverse
		// so craters remain visually prominent on larger planets
		const baseRadius = 0.04 + rng.random() * 0.11
		const radius = baseRadius / Math.sqrt(radiusRatio)
		// Depth scales with radius (bigger craters are deeper) and intensity
		const depth = (0.15 + rng.random() * 0.25) * (radius / 0.1) * intensity
		const rimHeight = depth * 0.25

		craters.push({
			cx,
			cy,
			cz,
			radius,
			depth,
			rimHeight,
			cosThresh: Math.cos(radius * 2.5),
		})
	}

	// Warp scale for roughening crater edges
	const warpAmount = 0.012

	for (let r = 0; r < numRegions; r++) {
		const rx = r_xyz[3 * r]
		const ry = r_xyz[3 * r + 1]
		const rz = r_xyz[3 * r + 2]

		// Per-cell noise for edge roughening (computed once, reused for all craters)
		const warp = noise.fbm(rx * 30, ry * 30, rz * 30, 3, 0.5) * warpAmount

		let totalDelta = 0

		for (const cr of craters) {
			const dot = cr.cx * rx + cr.cy * ry + cr.cz * rz
			// Early out — cell is too far from crater center
			if (dot < cr.cosThresh) continue

			// Great-circle angular distance + noise warp
			const angDist = Math.acos(Math.min(1, Math.max(-1, dot)))
			const d = angDist + warp
			const t = d / cr.radius // normalized distance (0 = center, 1 = rim)

			let delta = 0

			// Bowl depression: parabolic profile inside the rim
			if (t < 0.85) {
				const u = t / 0.85
				delta -= cr.depth * (1 - u * u)
			}

			// Rim: Gaussian bump centered at t=1
			if (t > 0.6 && t < 1.5) {
				const rimT = (t - 1.0) / 0.15
				delta += cr.rimHeight * Math.exp(-0.5 * rimT * rimT)
			}

			// Ejecta blanket: gentle falloff beyond the rim
			if (t > 0.9 && t < 2.5) {
				const ejT = (t - 1.0) / 0.5
				delta += cr.rimHeight * 0.4 * Math.exp(-0.5 * ejT * ejT)
			}

			totalDelta += delta
		}

		if (totalDelta !== 0) {
			elevation[r] += totalDelta
		}
	}
}
