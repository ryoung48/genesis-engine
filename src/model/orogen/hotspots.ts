/**
 * Hotspot volcanism — mantle plumes with drift chains.
 * Faithful port of orogen's dual-component model: broad thermal swell +
 * volcanic peak with domain-warped shape distortion, age-dependent texture,
 * drift elongation, summit calderas, and radial rift-zone ridges.
 */
import type { SphereMesh, TectonicPlate } from "./types"
import { createRng } from "./rng"
import { SimplexNoise } from "./simplex-noise"

function clampUnit(value: number): number {
	return Math.max(0, Math.min(1, value))
}

function lerp(min: number, max: number, t: number): number {
	return min + (max - min) * t
}

function mapActiveHotspotCount(volcanism: number): number {
	const v = clampUnit(volcanism)
	return Math.round(v <= 0.5 ? lerp(2, 5, v / 0.5) : lerp(5, 10, (v - 0.5) / 0.5))
}

function mapActiveChainLength(volcanism: number): number {
	const v = clampUnit(volcanism)
	return Math.round(v <= 0.5 ? lerp(3, 6, v / 0.5) : lerp(6, 10, (v - 0.5) / 0.5))
}

function mapActiveDomeStrength(volcanism: number): number {
	const v = clampUnit(volcanism)
	return v <= 0.5 ? lerp(0, 0.6, v / 0.5) : lerp(0.6, 0.9, (v - 0.5) / 0.5)
}

/**
 * Static hotspots for stagnant lid worlds — dome features without
 * plate-velocity-driven chain trails.
 */
export function applyStaticHotspots(
	mesh: SphereMesh,
	elevation: Float32Array,
	seed: number,
	volcanism: number,
): Float32Array {
	const { numRegions, r_xyz } = mesh
	const hotspotContrib = new Float32Array(numRegions)
	const v = clampUnit(volcanism)
	const count = Math.round(lerp(3, 14, v))

	const DOME_SIGMA = 0.008
	const DOME_STRENGTH = lerp(0.3, 0.9, v) * v
	const SWELL_SIGMA_MULT = 2.5
	const SWELL_STR_MULT = 0.12

	const hsRng = createRng(seed + 999)
	const hsPosRng = createRng(seed + 1001)
	const hsNoise = new SimplexNoise(seed + 501)
	const hsNoise2 = new SimplexNoise(seed + 502)

	interface StaticDome {
		x: number; y: number; z: number
		strength: number; sigma: number
		cosThreshPeak: number; invS2: number
		swellStrength: number; cosThreshSwell: number; invS2Swell: number
	}

	const domes: StaticDome[] = []

	for (let h = 0; h < count; h++) {
		const strength = DOME_STRENGTH * (0.4 + hsRng.random() * 1.2)
		const sigma = DOME_SIGMA * (0.5 + hsRng.random() * 1.0)

		const theta = 2 * Math.PI * hsPosRng.random()
		const cosPhiVal = 2 * hsPosRng.random() - 1
		const sinPhiVal = Math.sqrt(1 - cosPhiVal * cosPhiVal)
		const hx = sinPhiVal * Math.cos(theta)
		const hy = sinPhiVal * Math.sin(theta)
		const hz = cosPhiVal

		const isOcean = elevation[findNearestR(mesh, hx, hy, hz)] <= 0
		const boost = isOcean ? 1.8 : 1.0

		const swSigma = sigma * SWELL_SIGMA_MULT
		domes.push({
			x: hx, y: hy, z: hz,
			strength: strength * boost,
			sigma,
			cosThreshPeak: Math.cos(sigma * 5.5),
			invS2: -0.5 / (sigma * sigma),
			swellStrength: strength * SWELL_STR_MULT,
			cosThreshSwell: Math.cos(swSigma * 3),
			invS2Swell: -0.5 / (swSigma * swSigma),
		})
	}

	for (let r = 0; r < numRegions; r++) {
		const rx = r_xyz[3 * r], ry = r_xyz[3 * r + 1], rz = r_xyz[3 * r + 2]

		let nearSwell = false, nearPeak = false
		for (const dm of domes) {
			const cdot = dm.x * rx + dm.y * ry + dm.z * rz
			if (cdot > dm.cosThreshSwell) {
				nearSwell = true
				if (cdot > dm.cosThreshPeak) { nearPeak = true; break }
			}
		}
		if (!nearSwell) continue

		let shapeWarpSq = 1.0
		if (nearPeak) {
			const warpScale = 8
			const wx = hsNoise2.fbm(rx * warpScale + 5.1, ry * warpScale + 3.7, rz * warpScale + 9.2, 2) * 0.4
			const wy = hsNoise2.fbm(rx * warpScale + 11.3, ry * warpScale + 7.1, rz * warpScale + 2.9, 2) * 0.4
			const wz = hsNoise2.fbm(rx * warpScale + 1.7, ry * warpScale + 13.5, rz * warpScale + 6.4, 2) * 0.4
			const shapeWarp = 1.0 + 0.40 * hsNoise.fbm((rx + wx) * 20 + 3.2, (ry + wy) * 20 + 7.8, (rz + wz) * 20 + 1.5, 4)
			shapeWarpSq = shapeWarp * shapeWarp
		}

		let totalUplift = 0, totalSwellUplift = 0
		for (const dm of domes) {
			const dot = dm.x * rx + dm.y * ry + dm.z * rz
			if (dot > dm.cosThreshSwell) {
				const swAngleSq = 2 * (1 - dot)
				totalSwellUplift += dm.swellStrength * Math.exp(swAngleSq * dm.invS2Swell)
			}
			if (dot < dm.cosThreshPeak) continue
			const angleSq = 2 * (1 - dot)
			totalUplift += dm.strength * Math.exp(angleSq * shapeWarpSq * dm.invS2)
		}

		const combinedUplift = totalSwellUplift + totalUplift
		if (combinedUplift > 0.001) {
			const texBase = 0.7 * hsNoise.ridgedFbm(rx * 12, ry * 12, rz * 12, 4, 2.0, 0.5, 1.0)
			const texDetail = 0.3 * hsNoise.ridgedFbm(rx * 30, ry * 30, rz * 30, 3, 2.0, 0.5, 1.0)
			const volc = 0.4 + 0.8 * (texBase + texDetail)
			const uplift = totalSwellUplift + Math.max(0, totalUplift) * volc
			elevation[r] += uplift
			hotspotContrib[r] = uplift
		}
	}

	return hotspotContrib
}

function findNearestR(mesh: SphereMesh, px: number, py: number, pz: number): number {
	let bestDot = -2, bestR = 0
	for (let r = 0; r < mesh.numRegions; r++) {
		const dot = px * mesh.r_xyz[3 * r] + py * mesh.r_xyz[3 * r + 1] + pz * mesh.r_xyz[3 * r + 2]
		if (dot > bestDot) { bestDot = dot; bestR = r }
	}
	return bestR
}

function plateVelocityAt(
	plate: TectonicPlate,
	x: number,
	y: number,
	z: number,
): [number, number, number] {
	const [px, py, pz] = plate.pole
	const w = plate.omega
	return [w * (py * z - pz * y), w * (pz * x - px * z), w * (px * y - py * x)]
}

interface Dome {
	x: number; y: number; z: number
	strength: number; baseStrength: number; sigma: number
	chainIndex: number; chainLength: number
	dx: number; dy: number; dz: number
	ux: number; uy: number; uz: number
	vx: number; vy: number; vz: number
	riftAngles: number[]
	// Pre-computed
	cosThreshPeak: number; invS2: number
	swellSigma: number; swellStrength: number
	cosThreshSwell: number; invS2Swell: number
	driftStretch: number
	hasCaldera: boolean; calderaSigma: number
	calderaDepth: number; invS2Caldera: number
	ageFactor: number
}

export function applyHotspots(
	mesh: SphereMesh,
	plates: TectonicPlate[],
	plateAssignment: Int32Array,
	elevation: Float32Array,
	seed: number,
	volcanism: number,
): Float32Array {
	const { numRegions, r_xyz } = mesh
	const hotspotContrib = new Float32Array(numRegions)
	const v = clampUnit(volcanism)

	const NUM_HOTSPOTS = mapActiveHotspotCount(v)
	const CHAIN_LENGTH = mapActiveChainLength(v)
	const CHAIN_DECAY = 0.75
	const CHAIN_SPACING = 0.06
	const DOME_SIGMA = 0.006
	const DOME_STRENGTH = mapActiveDomeStrength(v)
	const SWELL_SIGMA_MULT = 2
	const SWELL_STR_MULT = 0.10

	// Deterministic RNGs matching source: makeRng(seed + 999), makeRng(seed + 1001)
	const hsRng = createRng(seed + 999)
	const hsPosRng = createRng(seed + 1001)
	const hsNoise = new SimplexNoise(seed + 501)
	const hsNoise2 = new SimplexNoise(seed + 502)
	const hsNoise3 = new SimplexNoise(seed + 503)

	// FBM helpers
	function fbm(noise: SimplexNoise, x: number, y: number, z: number, octaves: number): number {
		return noise.fbm(x, y, z, octaves, 0.5)
	}

	function ridgedFbm(noise: SimplexNoise, x: number, y: number, z: number, octaves: number): number {
		return noise.ridgedFbm(x, y, z, octaves, 2.0, 0.5, 1.0)
	}

	const buildTangentFrame = (px: number, py: number, pz: number, dx: number, dy: number, dz: number) => {
		const dd = dx * px + dy * py + dz * pz
		let ux = dx - dd * px, uy = dy - dd * py, uz = dz - dd * pz
		const uLen = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1
		ux /= uLen; uy /= uLen; uz /= uLen
		const vx = py * uz - pz * uy, vy = pz * ux - px * uz, vz = px * uy - py * ux
		return { ux, uy, uz, vx, vy, vz }
	}

	const findNearestR = (px: number, py: number, pz: number): number => {
		let bestDot = -2, bestR = 0
		for (let r = 0; r < numRegions; r++) {
			const dot = px * r_xyz[3 * r] + py * r_xyz[3 * r + 1] + pz * r_xyz[3 * r + 2]
			if (dot > bestDot) { bestDot = dot; bestR = r }
		}
		return bestR
	}

	const riftAnglesForDome = (ci: number, cl: number, baseAngle: number): number[] => {
		if (ci === 0) return [baseAngle, baseAngle + Math.PI * 0.6, baseAngle - Math.PI * 0.6]
		if (ci === 1) return [baseAngle, baseAngle + Math.PI]
		if (ci <= Math.floor(cl * 0.4)) return [baseAngle]
		return []
	}

	const domes: Dome[] = []

	for (let h = 0; h < NUM_HOTSPOTS; h++) {
		const hStrength = DOME_STRENGTH * (0.4 + hsRng.random() * 1.2)
		const hSigma = DOME_SIGMA * (0.4 + hsRng.random() * 1.2)
		const hDecay = CHAIN_DECAY + (hsRng.random() - 0.5) * 0.35
		const hLength = Math.max(3, CHAIN_LENGTH + Math.round((hsRng.random() - 0.5) * 10))

		const theta = 2 * Math.PI * hsPosRng.random()
		const cosPhiVal = 2 * hsPosRng.random() - 1
		const sinPhiVal = Math.sqrt(1 - cosPhiVal * cosPhiVal)
		const hx = sinPhiVal * Math.cos(theta)
		const hy = sinPhiVal * Math.sin(theta)
		const hz = cosPhiVal

		const centerR = findNearestR(hx, hy, hz)
		const plate = plates[plateAssignment[centerR]]
		const drift = plateVelocityAt(plate, hx, hy, hz)
		const driftLen = Math.sqrt(drift[0] * drift[0] + drift[1] * drift[1] + drift[2] * drift[2])
		if (driftLen < 1e-6) continue
		drift[0] /= driftLen; drift[1] /= driftLen; drift[2] /= driftLen

		const isOceanHotspot = plate.isOcean
		const oceanBoost = isOceanHotspot ? 1.8 : 1.0

		const baseRiftAngle = hsNoise3.noise3D(hx * 10, hy * 10, hz * 10) * Math.PI

		const frame0 = buildTangentFrame(hx, hy, hz, drift[0], drift[1], drift[2])
		domes.push({
			x: hx, y: hy, z: hz,
			strength: hStrength * oceanBoost, baseStrength: hStrength,
			sigma: hSigma,
			chainIndex: 0, chainLength: hLength,
			dx: drift[0], dy: drift[1], dz: drift[2],
			...frame0,
			riftAngles: riftAnglesForDome(0, hLength, baseRiftAngle),
		} as Dome)

		// Chain trail
		let perpX = drift[1] * hz - drift[2] * hy
		let perpY = drift[2] * hx - drift[0] * hz
		let perpZ = drift[0] * hy - drift[1] * hx
		const perpLen = Math.sqrt(perpX * perpX + perpY * perpY + perpZ * perpZ) || 1
		perpX /= perpLen; perpY /= perpLen; perpZ /= perpLen

		let cx = hx, cy = hy, cz = hz
		let str = hStrength * oceanBoost
		let baseStr = hStrength
		for (let c = 0; c < hLength; c++) {
			const ci = c + 1
			const decayJitter = hDecay * (0.7 + hsRng.random() * 0.6)
			str *= decayJitter
			baseStr *= decayJitter
			const stepSpacing = CHAIN_SPACING * (0.3 + hsRng.random() * 1.4)
			const ageBroadening = 1.0 + ci * 0.06
			const stepSigma = hSigma * (0.5 + hsRng.random() * 1.0) * ageBroadening
			const wobble = (hsRng.random() - 0.5) * 0.8
			const ddx = -drift[0] + perpX * wobble
			const ddy = -drift[1] + perpY * wobble
			const ddz = -drift[2] + perpZ * wobble
			const dot = ddx * cx + ddy * cy + ddz * cz
			let tx = ddx - dot * cx, ty = ddy - dot * cy, tz = ddz - dot * cz
			const tLen = Math.sqrt(tx * tx + ty * ty + tz * tz)
			if (tLen < 1e-6) break
			tx /= tLen; ty /= tLen; tz /= tLen
			const cosA = Math.cos(stepSpacing)
			const sinA = Math.sin(stepSpacing)
			cx = cx * cosA + tx * sinA
			cy = cy * cosA + ty * sinA
			cz = cz * cosA + tz * sinA
			const nL = Math.sqrt(cx * cx + cy * cy + cz * cz)
			cx /= nL; cy /= nL; cz /= nL

			const frameC = buildTangentFrame(cx, cy, cz, drift[0], drift[1], drift[2])
			domes.push({
				x: cx, y: cy, z: cz,
				strength: str, baseStrength: baseStr,
				sigma: stepSigma,
				chainIndex: ci, chainLength: hLength,
				dx: drift[0], dy: drift[1], dz: drift[2],
				...frameC,
				riftAngles: riftAnglesForDome(ci, hLength, baseRiftAngle),
			} as Dome)
		}
	}

	// Pre-compute per-dome constants
	for (const dm of domes) {
		dm.cosThreshPeak = Math.cos(dm.sigma * 5.5)
		dm.invS2 = -0.5 / (dm.sigma * dm.sigma)
		const swSigma = dm.sigma * SWELL_SIGMA_MULT
		dm.swellSigma = swSigma
		dm.swellStrength = dm.baseStrength * SWELL_STR_MULT
		dm.cosThreshSwell = Math.cos(swSigma * 3)
		dm.invS2Swell = -0.5 / (swSigma * swSigma)
		dm.driftStretch = 1.0 / 1.4
		dm.hasCaldera = dm.chainIndex <= 1 && dm.strength > 0.15
		dm.calderaSigma = dm.sigma * 0.25
		dm.calderaDepth = dm.strength * 0.20
		dm.invS2Caldera = -0.5 / (dm.calderaSigma * dm.calderaSigma)
		dm.ageFactor = dm.chainLength > 0 ? dm.chainIndex / dm.chainLength : 0
	}

	// Apply dome uplift
	for (let r = 0; r < numRegions; r++) {
		const rx = r_xyz[3 * r], ry = r_xyz[3 * r + 1], rz = r_xyz[3 * r + 2]

		let nearSwell = false, nearPeak = false
		for (const dm of domes) {
			const cdot = dm.x * rx + dm.y * ry + dm.z * rz
			if (cdot > dm.cosThreshSwell) {
				nearSwell = true
				if (cdot > dm.cosThreshPeak) { nearPeak = true; break }
			}
		}
		if (!nearSwell) continue

		let shapeWarpSq = 1.0
		if (nearPeak) {
			const warpScale = 8
			const wx = fbm(hsNoise2, rx * warpScale + 5.1, ry * warpScale + 3.7, rz * warpScale + 9.2, 2) * 0.4
			const wy = fbm(hsNoise2, rx * warpScale + 11.3, ry * warpScale + 7.1, rz * warpScale + 2.9, 2) * 0.4
			const wz = fbm(hsNoise2, rx * warpScale + 1.7, ry * warpScale + 13.5, rz * warpScale + 6.4, 2) * 0.4
			const shapeWarp = 1.0 + 0.40 * fbm(hsNoise, (rx + wx) * 20 + 3.2, (ry + wy) * 20 + 7.8, (rz + wz) * 20 + 1.5, 4)
			shapeWarpSq = shapeWarp * shapeWarp
		}

		let totalUplift = 0, totalSwellUplift = 0
		let weightedAge = 0, ageWeightSum = 0

		for (const dm of domes) {
			const dot = dm.x * rx + dm.y * ry + dm.z * rz

			if (dot > dm.cosThreshSwell) {
				const swAngleSq = 2 * (1 - dot)
				totalSwellUplift += dm.swellStrength * Math.exp(swAngleSq * dm.invS2Swell)
			}

			if (dot < dm.cosThreshPeak) continue

			const offX = rx - dot * dm.x, offY = ry - dot * dm.y, offZ = rz - dot * dm.z
			const parComp = offX * dm.ux + offY * dm.uy + offZ * dm.uz
			const perpComp = offX * dm.vx + offY * dm.vy + offZ * dm.vz
			const stretchedParSq = (parComp * dm.driftStretch) ** 2
			const angleSq = stretchedParSq + perpComp * perpComp

			let gauss = Math.exp(angleSq * shapeWarpSq * dm.invS2)

			if (dm.riftAngles.length > 0 && gauss > 0.01) {
				const angle = Math.atan2(perpComp, parComp)
				let maxRift = 0
				for (const ra of dm.riftAngles) {
					let da = angle - ra
					da = da - Math.round(da / (2 * Math.PI)) * 2 * Math.PI
					const c2 = Math.cos(da)
					const riftFactor = c2 ** 4
					if (riftFactor > maxRift) maxRift = riftFactor
				}
				gauss *= 1.0 + 0.5 * maxRift
			}

			const peakUplift = dm.strength * gauss
			totalUplift += peakUplift
			weightedAge += dm.ageFactor * peakUplift
			ageWeightSum += peakUplift

			if (dm.hasCaldera) {
				totalUplift -= dm.calderaDepth * Math.exp(angleSq * dm.invS2Caldera)
			}
		}

		const combinedUplift = totalSwellUplift + totalUplift
		if (combinedUplift > 0.001) {
			const age = ageWeightSum > 0 ? weightedAge / ageWeightSum : 0
			const texBase = 0.7 * ridgedFbm(hsNoise, rx * 12, ry * 12, rz * 12, 4)
			const texDetail = 0.3 * ridgedFbm(hsNoise, rx * 30, ry * 30, rz * 30, 3)
			const texRaw = texBase + texDetail
			const texMin = 0.4 + age * 0.3
			const texMax = 1.2 - age * 0.2
			const volc = texMin + (texMax - texMin) * texRaw

			const uplift = totalSwellUplift + Math.max(0, totalUplift) * volc
			elevation[r] += uplift
			hotspotContrib[r] = uplift
		}
	}

	return hotspotContrib
}
