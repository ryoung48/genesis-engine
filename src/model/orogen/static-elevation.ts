/**
 * Static elevation generator for stagnant lid worlds.
 * Produces terrain without plate tectonics — coronae, volcanic provinces,
 * hemispheric dichotomy, and rift zones composed via simplex noise layers.
 */
import type { SphereMesh } from "./types"
import { SimplexNoise } from "./simplex-noise"
import { createRng } from "./rng"

// ── Helpers ──────────────────────────────────────────────────────────

/** Random unit vector on the sphere */
function randomUnitVec(rng: { random(): number }): [number, number, number] {
	const z = 2 * rng.random() - 1
	const r = Math.sqrt(1 - z * z)
	const theta = 2 * Math.PI * rng.random()
	return [r * Math.cos(theta), r * Math.sin(theta), z]
}

/** Great-circle angular distance between two unit vectors (via dot product) */
function angularDist(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
	return Math.acos(Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz)))
}

// ── Layer generators ─────────────────────────────────────────────────

/**
 * Base terrain: multi-octave simplex noise at continent scale.
 * Provides the broad land/ocean structure.
 */
function addBaseNoise(
	mesh: SphereMesh,
	elevation: Float32Array,
	noise: SimplexNoise,
	roughness: number,
	landDistribution: number,
): void {
	const { numRegions, r_xyz } = mesh
	// Low distribution → low freq → few large features; high → many small
	const baseFreq = 1.2 + landDistribution * 3.8
	const octaves = 4
	const persistence = 0.55 + roughness * 0.2
	for (let r = 0; r < numRegions; r++) {
		const x = r_xyz[3 * r], y = r_xyz[3 * r + 1], z = r_xyz[3 * r + 2]
		let amp = 1, freq = baseFreq, sum = 0, maxAmp = 0
		for (let o = 0; o < octaves; o++) {
			sum += amp * noise.noise3D(x * freq, y * freq, z * freq)
			maxAmp += amp
			amp *= persistence
			freq *= 2.1
		}
		elevation[r] += (sum / maxAmp) * 0.5
	}
}

/**
 * Concentration nudge: biases elevation toward a random center using
 * noise-warped distance so coastlines stay organic (not circular).
 * Strength scales with (1 - landDistribution).
 */
function applyConcentration(
	mesh: SphereMesh,
	elevation: Float32Array,
	center: [number, number, number],
	landDistribution: number,
	noise: SimplexNoise,
): void {
	const concentration = 1 - landDistribution
	if (concentration < 0.05) return

	const { numRegions, r_xyz } = mesh
	const warpAmp = 0.35
	const strength = concentration * 0.7
	// Tighter sigma at higher concentration → more compact continent
	const sigma = 1.2 - concentration * 0.6 // 1.2 at dist=1, 0.6 at dist=0
	const invS2 = -0.5 / (sigma * sigma)

	for (let r = 0; r < numRegions; r++) {
		const x = r_xyz[3 * r], y = r_xyz[3 * r + 1], z = r_xyz[3 * r + 2]
		const dist = angularDist(x, y, z, center[0], center[1], center[2])
		// Noise warp breaks circular symmetry
		const warp = noise.fbm(x * 3 + 7.1, y * 3 + 2.3, z * 3 + 5.9, 3, 0.5) * warpAmp
		const warpedDist = Math.max(0, dist + warp)
		// Gaussian falloff — compact at high concentration
		const weight = Math.exp(warpedDist * warpedDist * invS2)
		elevation[r] += (weight - 0.3) * strength
	}
}

/**
 * Hemispheric dichotomy: one hemisphere depressed relative to the other.
 * Produces Mars-like crustal asymmetry.
 */
function addDichotomy(
	mesh: SphereMesh,
	elevation: Float32Array,
	axis: [number, number, number],
	strength: number,
): void {
	const { numRegions, r_xyz } = mesh
	for (let r = 0; r < numRegions; r++) {
		const dot = r_xyz[3 * r] * axis[0] + r_xyz[3 * r + 1] * axis[1] + r_xyz[3 * r + 2] * axis[2]
		// Smooth sigmoid transition across the boundary
		const t = 1 / (1 + Math.exp(-8 * dot))
		elevation[r] += (t - 0.5) * strength
	}
}

/**
 * Coronae: circular volcanic/tectonic features.
 * Raised annular rim surrounding a collapsed interior.
 */
function addCoronae(
	mesh: SphereMesh,
	elevation: Float32Array,
	seed: number,
	count: number,
): void {
	const rng = createRng(seed + 3001)
	const noise = new SimplexNoise(seed + 3002)
	const { numRegions, r_xyz } = mesh

	for (let c = 0; c < count; c++) {
		const center = randomUnitVec(rng)
		const radius = 0.03 + rng.random() * 0.06 // angular radius in radians
		const rimHeight = 0.08 + rng.random() * 0.12
		const collapseDepth = rimHeight * (0.3 + rng.random() * 0.4)

		for (let r = 0; r < numRegions; r++) {
			const x = r_xyz[3 * r], y = r_xyz[3 * r + 1], z = r_xyz[3 * r + 2]
			const dist = angularDist(x, y, z, center[0], center[1], center[2])
			if (dist > radius * 3) continue

			const t = dist / radius
			// Edge roughening
			const warp = 1.0 + 0.15 * noise.noise3D(x * 30, y * 30, z * 30)

			// Rim: Gaussian ring at t ≈ 1
			const rimT = (t * warp - 1)
			const rim = rimHeight * Math.exp(-rimT * rimT / 0.06)

			// Interior collapse: inverted Gaussian at center
			const collapse = -collapseDepth * Math.exp(-t * t * warp * warp / 0.3)

			// Outer falloff
			const edge = Math.max(0, t - 1.5)
			const falloff = Math.exp(-edge * edge / 0.5)

			elevation[r] += (rim + collapse) * falloff
		}
	}
}

/**
 * Volcanic provinces: broad shield volcanoes.
 * Each is a Gaussian dome with domain-warped shape noise.
 */
function addVolcanicProvinces(
	mesh: SphereMesh,
	elevation: Float32Array,
	seed: number,
	count: number,
): void {
	const rng = createRng(seed + 4001)
	const shapeNoise = new SimplexNoise(seed + 4002)
	const warpNoise = new SimplexNoise(seed + 4003)
	const { numRegions, r_xyz } = mesh

	for (let v = 0; v < count; v++) {
		const center = randomUnitVec(rng)
		const sigma = 0.02 + rng.random() * 0.05
		const height = 0.15 + rng.random() * 0.35
		const cosThresh = Math.cos(sigma * 5)

		for (let r = 0; r < numRegions; r++) {
			const x = r_xyz[3 * r], y = r_xyz[3 * r + 1], z = r_xyz[3 * r + 2]
			const dot = x * center[0] + y * center[1] + z * center[2]
			if (dot < cosThresh) continue

			const angleSq = 2 * (1 - dot)
			const invS2 = -0.5 / (sigma * sigma)

			// Domain warp for non-circular shape
			const wx = warpNoise.noise3D(x * 12, y * 12, z * 12) * 0.3
			const wy = warpNoise.noise3D(x * 12 + 7, y * 12 + 7, z * 12 + 7) * 0.3
			const warpedAngleSq = angleSq * (1 + wx) + wy * wy * 0.01

			let gauss = Math.exp(warpedAngleSq * invS2)

			// Volcanic texture
			const tex = 0.7 + 0.3 * shapeNoise.ridgedFbm(x * 20, y * 20, z * 20, 3, 2.0, 0.5, 1.0)
			gauss *= tex

			// Summit caldera on tall volcanoes
			if (height > 0.3 && angleSq < sigma * sigma * 0.1) {
				gauss -= 0.15 * Math.exp(angleSq * (-0.5 / (sigma * sigma * 0.02)))
			}

			elevation[r] += height * gauss
		}
	}
}

/**
 * Rift zones: linear extensional depressions (chasmata).
 * Uses ridged FBM noise to carve elongated valleys.
 */
function addRiftZones(
	mesh: SphereMesh,
	elevation: Float32Array,
	seed: number,
	count: number,
): void {
	const rng = createRng(seed + 5001)
	const riftNoise = new SimplexNoise(seed + 5002)
	const { numRegions, r_xyz } = mesh

	for (let i = 0; i < count; i++) {
		const center = randomUnitVec(rng)
		// Rift axis: perpendicular direction on the sphere
		const axis = randomUnitVec(rng)
		// Project axis onto tangent plane at center
		const dot = axis[0] * center[0] + axis[1] * center[1] + axis[2] * center[2]
		let tx = axis[0] - dot * center[0]
		let ty = axis[1] - dot * center[1]
		let tz = axis[2] - dot * center[2]
		const tLen = Math.sqrt(tx * tx + ty * ty + tz * tz)
		if (tLen < 1e-6) continue
		tx /= tLen; ty /= tLen; tz /= tLen

		const length = 0.08 + rng.random() * 0.2 // angular half-length
		const width = 0.012 + rng.random() * 0.012
		const depth = 0.05 + rng.random() * 0.08

		for (let r = 0; r < numRegions; r++) {
			const x = r_xyz[3 * r], y = r_xyz[3 * r + 1], z = r_xyz[3 * r + 2]
			const dist = angularDist(x, y, z, center[0], center[1], center[2])
			if (dist > length + width * 4) continue

			// Decompose offset into along-rift and across-rift
			const offX = x - (x * center[0] + y * center[1] + z * center[2]) * center[0]
			const offY = y - (x * center[0] + y * center[1] + z * center[2]) * center[1]
			const offZ = z - (x * center[0] + y * center[1] + z * center[2]) * center[2]
			const along = offX * tx + offY * ty + offZ * tz
			const acrossX = offX - along * tx
			const acrossY = offY - along * ty
			const acrossZ = offZ - along * tz
			const across = Math.sqrt(acrossX * acrossX + acrossY * acrossY + acrossZ * acrossZ)

			// Width modulation with noise
			const warpedWidth = width * (1 + 0.3 * riftNoise.noise3D(x * 15, y * 15, z * 15))
			const acrossProfile = Math.exp(-across * across / (2 * warpedWidth * warpedWidth))

			// Along-axis tapering
			const alongAbs = Math.abs(along)
			const overrun = alongAbs - length
			const alongProfile = alongAbs < length ? 1 : Math.exp(-overrun * overrun / (2 * width * width))

			elevation[r] -= depth * acrossProfile * alongProfile
		}
	}
}

/**
 * Sea-level calibration: shift elevation so that `landCoverage` fraction is above zero.
 */
function calibrateSeaLevel(elevation: Float32Array, landCoverage: number): void {
	const N = elevation.length
	const sorted = Float32Array.from(elevation).sort()
	const targetIdx = Math.max(0, Math.min(N - 1, Math.floor(N * (1 - landCoverage))))
	const offset = sorted[targetIdx]
	for (let r = 0; r < N; r++) {
		elevation[r] -= offset
	}
}

// ── Main entry point ─────────────────────────────────────────────────

export function generateStaticElevation(
	mesh: SphereMesh,
	seed: number,
	roughness: number,
	landCoverage: number,
	landDistribution: number,
): Float32Array {
	const elevation = new Float32Array(mesh.numRegions)
	const rng = createRng(seed + 2000)
	const baseNoise = new SimplexNoise(seed + 2001)
	const concNoise = new SimplexNoise(seed + 2002)

	// 1. Base continent-scale noise (frequency controlled by landDistribution)
	addBaseNoise(mesh, elevation, baseNoise, roughness, landDistribution)

	// 2. Concentration nudge (noise-warped radial bias for low distribution)
	const concentrationCenter = randomUnitVec(rng)
	applyConcentration(mesh, elevation, concentrationCenter, landDistribution, concNoise)

	// 3. Hemispheric dichotomy (random strength 0.05–0.25)
	const dichotomyAxis = randomUnitVec(rng)
	const dichotomyStrength = 0.05 + rng.random() * 0.2
	addDichotomy(mesh, elevation, dichotomyAxis, dichotomyStrength)

	// 4. Coronae (8–15)
	const numCoronae = 8 + Math.floor(rng.random() * 8)
	addCoronae(mesh, elevation, seed, numCoronae)

	// 5. Volcanic provinces (4–8 large shield volcanoes)
	const numVolcanoes = 4 + Math.floor(rng.random() * 5)
	addVolcanicProvinces(mesh, elevation, seed, numVolcanoes)

	// 6. Rift zones (2–5 chasmata)
	const numRifts = 2 + Math.floor(rng.random() * 4)
	addRiftZones(mesh, elevation, seed, numRifts)

	// 7. Calibrate sea level for desired land coverage
	calibrateSeaLevel(elevation, landCoverage)

	return elevation
}
