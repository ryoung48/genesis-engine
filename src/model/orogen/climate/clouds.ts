/**
 * Procedural cloud coverage generation on a sphere mesh.
 *
 * 1. Large cloud masses: low-freq FBM, domain-warped, thresholded for soft blobs
 * 2. Internal texture: higher-freq FBM varies density within masses
 * 3. Small puffy clusters: mid-freq sparse blobs
 * 4. Swirl: hemisphere-aware spiral distortion for weather systems
 * 5. Precipitation mask: suppress clouds over dry land regions
 * 6. Pressure + ocean scaling: thicker atmospheres on wet worlds → denser cloud cover
 */
import type { OrogenParams, OrogenRainfall } from "../types"
import { SimplexNoise } from "../simplex-noise"

function norm(v: number): number {
	return Math.max(-1, Math.min(1, v))
}

function smoothstep(lo: number, hi: number, x: number): number {
	const t = Math.max(0, Math.min(1, (x - lo) / (hi - lo)))
	return t * t * (3 - 2 * t)
}

function tangentFrame(x: number, y: number, z: number) {
	let ex: number, ey: number, ez: number
	if (Math.abs(z) < 0.99) {
		const m = Math.sqrt(x * x + y * y) || 1
		ex = y / m; ey = -x / m; ez = 0
	} else {
		const m = Math.sqrt(z * z + x * x) || 1
		ex = -z / m; ey = 0; ez = x / m
	}
	return {
		ex, ey, ez,
		nx: y * ez - z * ey,
		ny: z * ex - x * ez,
		nz: x * ey - y * ex,
	}
}

export function computeClouds(
	mesh: { numRegions: number; r_xyz: Float32Array },
	rainfall: OrogenRainfall,
	isLand: Uint8Array,
	params: OrogenParams,
): Float32Array {
	const N = mesh.numRegions
	const { r_xyz } = mesh
	const seed = params.seed

	const shapeNoise = new SimplexNoise(seed + 6000)
	const detailNoise = new SimplexNoise(seed + 6001)
	const warpNoiseA = new SimplexNoise(seed + 6003)
	const warpNoiseB = new SimplexNoise(seed + 6004)
	const puffNoise = new SimplexNoise(seed + 6005)
	const puffMask = new SimplexNoise(seed + 6006)
	const blendNoise = new SimplexNoise(seed + 6007)
	const coverageNoise = new SimplexNoise(seed + 6008)
	const swirlLocNoise = new SimplexNoise(seed + 6009)
	const swirlAngNoise = new SimplexNoise(seed + 6010)

	const clouds = new Float32Array(N)

	const hoursPerDay = params.hoursPerDay ?? 24
	const rotationSign = hoursPerDay >= 0 ? 1 : -1

	// Pressure & ocean fraction scaling
	const pressure = params.pressure ?? 1.0
	let landCount = 0
	for (let r = 0; r < N; r++) if (isLand[r]) landCount++
	const oceanFraction = 1 - landCount / N

	// pressureFactor: 0 at ≤0.5 bar, 1 at 1 bar, ramps up with sqrt above 1 bar
	// oceanMoisture: 0..1, how much evaporation feeds clouds
	// Combined into a density boost: at 1 bar + 70% ocean → ~1.0 (no change)
	const pressureFactor = pressure <= 0.5 ? 0 : Math.sqrt(Math.max(0, pressure))
	const oceanMoisture = Math.pow(oceanFraction, 0.6) // diminishing returns above ~50% ocean
	// cloudBoost: ~1.0 for Earth-like, up to ~2.5 for 10bar water worlds, down to ~0.4 for thin/dry
	const cloudBoost = pressureFactor * (0.3 + 0.7 * oceanMoisture)
	// Coverage threshold shifts: lower = more area gets clouds
	const covLoBase = -0.2
	const covHiBase = 0.3
	const covShift = -0.3 * Math.min(1, (cloudBoost - 1) * 0.8) // shifts down for high boost
	const covLo = covLoBase + covShift
	const covHi = covHiBase + covShift
	// Cloud mass threshold shifts similarly
	const massLoBase = -0.15
	const massHiBase = 0.35
	const massShift = -0.25 * Math.min(1, (cloudBoost - 1) * 0.8)
	const massLo = massLoBase + massShift
	const massHi = massHiBase + massShift
	// Dry-land suppression weakens at high pressure (moisture everywhere)
	const dryLandMin = Math.min(1, 0.3 * Math.max(0, cloudBoost - 1))

	for (let r = 0; r < N; r++) {
		const x = r_xyz[3 * r]
		const y = r_xyz[3 * r + 1]
		const z = r_xyz[3 * r + 2]

		// (1) Large-scale coverage zones
		const cov = norm(coverageNoise.fbm(x * 1.2, y * 1.2, z * 1.2, 3, 0.5))
		const coverage = smoothstep(covLo, covHi, cov)
		if (coverage < 0.001) continue

		// (2) Domain warp for organic shapes
		const { ex, ey, ez, nx, ny, nz } = tangentFrame(x, y, z)
		const dE = norm(warpNoiseA.fbm(x * 1.5 + 31.7, y * 1.5 + 47.3, z * 1.5 + 19.1, 4, 0.5)) * 0.18
		const dN = norm(warpNoiseB.fbm(x * 1.5 + 73.1, y * 1.5 + 11.9, z * 1.5 + 59.3, 4, 0.5)) * 0.18
		let wx = x + ex * dE + nx * dN
		let wy = y + ey * dE + ny * dN
		let wz = z + ez * dE + nz * dN

		// (3) Large cloud masses: low-freq blobs
		const shape = norm(shapeNoise.fbm(wx * 2, wy * 2, wz * 2, 5, 0.5))
		// Wide smoothstep for soft puffy edges
		let cloudMass = smoothstep(massLo, massHi, shape)

		// (4) Internal texture: detail within masses
		const detail = norm(detailNoise.fbm(wx * 7, wy * 7, wz * 7, 4, 0.45))
		const texture = detail * 0.25 + 0.75 // 0.5 to 1.0
		const largeCloud = cloudMass * texture

		// (5) Small puffy clusters: more of them, scattered everywhere
		const pv = norm(puffNoise.fbm(x * 10, y * 10, z * 10, 4, 0.45))
		const pm = norm(puffMask.fbm(x * 2.5, y * 2.5, z * 2.5, 3, 0.5))
		// Wide smoothstep range for soft, feathered puff edges
		const puffShape = smoothstep(-0.15, 0.6, pv)
		const puffCloud = puffShape * smoothstep(-0.2, 0.4, pm)

		// (6) Blend — give puffs more weight so they're visible
		const bt = norm(blendNoise.fbm(x * 3, y * 3, z * 3, 3, 0.5)) * 0.5 + 0.5
		let cloud = largeCloud * (1 - bt * 0.5) + puffCloud * bt * 0.6

		// Soft coverage fade
		cloud *= smoothstep(0.0, 0.3, coverage)

		// (7) Precipitation mask: only for land, weakened at high pressure
		if (isLand[r]) {
			const dryMask = smoothstep(30, 250, rainfall.annual[r])
			cloud *= dryLandMin + (1 - dryLandMin) * dryMask
		}

		// (8) Density boost from pressure + ocean moisture
		cloud *= cloudBoost

		clouds[r] = Math.max(0, Math.min(1, cloud))
	}

	return clouds
}
