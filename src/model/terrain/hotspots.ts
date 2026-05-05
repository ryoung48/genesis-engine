/**
 * Hotspot volcanism ΓÇö mantle plumes with drift chains.
 * Faithful port of orogen's dual-component model: broad thermal swell +
 * volcanic peak with domain-warped shape distortion, age-dependent texture,
 * drift elongation, summit calderas, and radial rift-zone ridges.
 */

import { eulerVelocityAt } from "../shared/math"
import { createRng } from "../shared/rng"
import { SimplexNoise } from "../shared/simplex-noise"
import { getLegacyVolcanismEquivalent } from "../shared/volcanism"
import { normalizeMantleField } from "../tectonics/mantle"
import type { SphereMesh } from "../types/mesh"
import type { OrogenTerrainFeatures, TectonicPlate } from "../types/tectonics"
import {
	appendLargeIgneousProvinceSites,
	applyLargeIgneousProvinces,
	buildTangentFrame,
	type LipSite,
} from "./volcanism"

function lerp(min: number, max: number, t: number): number {
	return min + (max - min) * t
}

function findNearestR(
	mesh: SphereMesh,
	px: number,
	py: number,
	pz: number,
): number {
	let bestDot = -2,
		bestR = 0
	for (let r = 0; r < mesh.numRegions; r++) {
		const dot =
			px * mesh.r_xyz[3 * r] +
			py * mesh.r_xyz[3 * r + 1] +
			pz * mesh.r_xyz[3 * r + 2]
		if (dot > bestDot) {
			bestDot = dot
			bestR = r
		}
	}
	return bestR
}

export function applyStaticHotspots(
	mesh: SphereMesh,
	elevation: Float32Array,
	seed: number,
	volcanism: number,
): Float32Array {
	const { numRegions, r_xyz } = mesh
	const hotspotContrib = new Float32Array(numRegions)
	const v = getLegacyVolcanismEquivalent(volcanism)
	const count = Math.round(lerp(3, 14, v))

	const DOME_SIGMA = 0.04
	const DOME_STRENGTH = lerp(0.3, 0.9, v) * v
	const SWELL_SIGMA_MULT = 2.5
	const SWELL_STR_MULT = 0.12

	const hsRng = createRng(seed + 999)
	const hsPosRng = createRng(seed + 1001)
	const hsNoise = new SimplexNoise(seed + 501)
	const hsNoise2 = new SimplexNoise(seed + 502)
	const hsNoise3 = new SimplexNoise(seed + 503)

	interface StaticDome {
		x: number
		y: number
		z: number
		strength: number
		sigma: number
		cosThreshPeak: number
		invS2: number
		swellStrength: number
		cosThreshSwell: number
		invS2Swell: number
		hasCaldera: boolean
		calderaSigma: number
		calderaDepth: number
		invS2Caldera: number
		riftAngles: number[]
		ux: number
		uy: number
		uz: number
		vx: number
		vy: number
		vz: number
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

		let refX = 0
		const refY = 0
		let refZ = 1
		if (Math.abs(hz) > 0.9) {
			refX = 1
			refZ = 0
		}
		const rd = refX * hx + refY * hy + refZ * hz
		let ux = refX - rd * hx
		let uy = refY - rd * hy
		let uz = refZ - rd * hz
		const uLen = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1
		ux /= uLen
		uy /= uLen
		uz /= uLen
		const vx = hy * uz - hz * uy
		const vy = hz * ux - hx * uz
		const vz = hx * uy - hy * ux

		const numRifts = 3 + Math.floor(hsRng.random() * 3)
		const baseRiftAngle = hsNoise3.noise3D(hx * 10, hy * 10, hz * 10) * Math.PI
		const riftAngles: number[] = []
		for (let i = 0; i < numRifts; i++) {
			riftAngles.push(baseRiftAngle + (2 * Math.PI * i) / numRifts)
		}

		const hasCaldera = strength * boost > 0.15
		const calderaSigma = sigma * 0.25
		const calderaDepth = strength * boost * 0.2

		const swSigma = sigma * SWELL_SIGMA_MULT
		domes.push({
			x: hx,
			y: hy,
			z: hz,
			strength: strength * boost,
			sigma,
			cosThreshPeak: Math.cos(sigma * 5.5),
			invS2: -0.5 / (sigma * sigma),
			swellStrength: strength * SWELL_STR_MULT,
			cosThreshSwell: Math.cos(swSigma * 3),
			invS2Swell: -0.5 / (swSigma * swSigma),
			hasCaldera,
			calderaSigma,
			calderaDepth,
			invS2Caldera: -0.5 / (calderaSigma * calderaSigma),
			riftAngles,
			ux,
			uy,
			uz,
			vx,
			vy,
			vz,
		})
	}

	for (let r = 0; r < numRegions; r++) {
		const rx = r_xyz[3 * r]
		const ry = r_xyz[3 * r + 1]
		const rz = r_xyz[3 * r + 2]

		let nearSwell = false
		let nearPeak = false
		for (const dm of domes) {
			const cdot = dm.x * rx + dm.y * ry + dm.z * rz
			if (cdot > dm.cosThreshSwell) {
				nearSwell = true
				if (cdot > dm.cosThreshPeak) {
					nearPeak = true
					break
				}
			}
		}
		if (!nearSwell) continue

		let shapeWarpSq = 1
		if (nearPeak) {
			const warpScale = 8
			const wx =
				hsNoise2.fbm(
					rx * warpScale + 5.1,
					ry * warpScale + 3.7,
					rz * warpScale + 9.2,
					2,
				) * 0.4
			const wy =
				hsNoise2.fbm(
					rx * warpScale + 11.3,
					ry * warpScale + 7.1,
					rz * warpScale + 2.9,
					2,
				) * 0.4
			const wz =
				hsNoise2.fbm(
					rx * warpScale + 1.7,
					ry * warpScale + 13.5,
					rz * warpScale + 6.4,
					2,
				) * 0.4
			const shapeWarp =
				1 +
				0.4 *
					hsNoise.fbm(
						(rx + wx) * 20 + 3.2,
						(ry + wy) * 20 + 7.8,
						(rz + wz) * 20 + 1.5,
						4,
					)
			shapeWarpSq = shapeWarp * shapeWarp
		}

		let totalUplift = 0
		let totalSwellUplift = 0
		for (const dm of domes) {
			const dot = dm.x * rx + dm.y * ry + dm.z * rz

			if (dot > dm.cosThreshSwell) {
				const swAngleSq = 2 * (1 - dot)
				totalSwellUplift +=
					dm.swellStrength * Math.exp(swAngleSq * dm.invS2Swell)
			}

			if (dot < dm.cosThreshPeak) continue

			const offX = rx - dot * dm.x
			const offY = ry - dot * dm.y
			const offZ = rz - dot * dm.z
			const parComp = offX * dm.ux + offY * dm.uy + offZ * dm.uz
			const perpComp = offX * dm.vx + offY * dm.vy + offZ * dm.vz
			const angleSq = parComp * parComp + perpComp * perpComp

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
				gauss *= 1 + 0.5 * maxRift
			}

			totalUplift += dm.strength * gauss
			if (dm.hasCaldera) {
				totalUplift -= dm.calderaDepth * Math.exp(angleSq * dm.invS2Caldera)
			}
		}

		const combinedUplift = totalSwellUplift + totalUplift
		if (combinedUplift > 0.001) {
			const texBase =
				0.7 * hsNoise.ridgedFbm(rx * 12, ry * 12, rz * 12, 4, 2, 0.5, 1)
			const texDetail =
				0.3 * hsNoise.ridgedFbm(rx * 30, ry * 30, rz * 30, 3, 2, 0.5, 1)
			const volc = 0.4 + 0.8 * (texBase + texDetail)
			const uplift = totalSwellUplift + Math.max(0, totalUplift) * volc
			elevation[r] += uplift
			hotspotContrib[r] = uplift
		}
	}

	return hotspotContrib
}

interface Dome {
	x: number
	y: number
	z: number
	strength: number
	baseStrength: number
	sigma: number
	chainIndex: number
	chainLength: number
	dx: number
	dy: number
	dz: number
	ux: number
	uy: number
	uz: number
	vx: number
	vy: number
	vz: number
	riftAngles: number[]
	// Pre-computed
	cosThreshPeak: number
	invS2: number
	swellSigma: number
	swellStrength: number
	cosThreshSwell: number
	invS2Swell: number
	driftStretch: number
	hasCaldera: boolean
	calderaSigma: number
	calderaDepth: number
	invS2Caldera: number
	ageFactor: number
	isContinental: boolean
}

export function applyHotspots(
	mesh: SphereMesh,
	plates: TectonicPlate[],
	plateAssignment: Int32Array,
	elevation: Float32Array,
	mantleUpwelling: Float32Array,
	terrainFeatures: OrogenTerrainFeatures | undefined,
	seed: number,
	volcanism: number,
): Float32Array {
	const { numRegions, r_xyz } = mesh
	const hotspotContrib = new Float32Array(numRegions)
	const dominantMagnitude = terrainFeatures?.dominantMagnitude
	const NUM_HOTSPOTS = 5
	const CHAIN_LENGTH = 6
	const CHAIN_DECAY = 0.65
	const CHAIN_SPACING = 0.06
	const DOME_SIGMA = 0.006
	const DOME_STRENGTH = 0.6
	const SWELL_SIGMA_MULT = 2
	const SWELL_STR_MULT = 0.1
	const CONT_HOTSPOT_SIGMA_MULT = 2.5
	const CONT_HOTSPOT_STRENGTH_MULT = 0.4
	const CONT_HOTSPOT_CALDERA_SIGMA_FRAC = 0.35
	const CONT_HOTSPOT_CALDERA_DEPTH_FRAC = 0.3
	const CONT_HOTSPOT_SWELL_MULT = 1.5
	const DOME_OCEAN_BOOST = 1.8
	const DOME_DRIFT_STRETCH = 1.05
	const DOME_CALDERA_STRENGTH_MIN = 0.15
	const DOME_SATELLITE_COUNT = 2
	const DOME_SATELLITE_OFFSET = 0.8
	const DOME_SATELLITE_SIGMA = 0.5
	const DOME_SATELLITE_STRENGTH = 0.35
	const HOTSPOT_UPWELLING_CANDIDATES = 8
	const HOTSPOT_UPWELLING_JITTER = 0.3
	const DOME_AGE_BROADENING = 0.03
	void volcanism
	const hsRng = createRng(seed + 999)
	const hsPosRng = createRng(seed + 1001)
	const hsNoise = new SimplexNoise(seed + 501)
	const hsNoise2 = new SimplexNoise(seed + 502)
	const hsNoise3 = new SimplexNoise(seed + 503)
	const mantleNorm = normalizeMantleField(mantleUpwelling)

	// FBM helpers
	function fbm(
		noise: SimplexNoise,
		x: number,
		y: number,
		z: number,
		octaves: number,
	): number {
		return noise.fbm(x, y, z, octaves, 0.5)
	}

	function ridgedFbm(
		noise: SimplexNoise,
		x: number,
		y: number,
		z: number,
		octaves: number,
	): number {
		return noise.ridgedFbm(x, y, z, octaves, 2.0, 0.5, 1.0)
	}

	const markFeature = (r: number, feature: number, delta: number) => {
		if (!terrainFeatures || !dominantMagnitude || Math.abs(delta) <= 1e-5)
			return
		terrainFeatures.featureMask[r] |= 1 << (feature - 1)
		if (Math.abs(delta) > dominantMagnitude[r]) {
			dominantMagnitude[r] = Math.abs(delta)
			terrainFeatures.dominantFeature[r] = feature
		}
	}

	const riftAnglesForDome = (
		ci: number,
		cl: number,
		baseAngle: number,
	): number[] => {
		if (ci === 0)
			return [baseAngle, baseAngle + Math.PI * 0.6, baseAngle - Math.PI * 0.6]
		if (ci === 1) return [baseAngle, baseAngle + Math.PI]
		if (ci <= Math.floor(cl * 0.4)) return [baseAngle]
		return []
	}

	const domes: Dome[] = []
	const lipSites: LipSite[] = []

	const spawnSatellites = (parent: Dome) => {
		for (let s = 0; s < DOME_SATELLITE_COUNT; s++) {
			const angle = hsRng.random() * 2 * Math.PI
			const offDist =
				parent.sigma * DOME_SATELLITE_OFFSET * (0.5 + hsRng.random() * 0.5)
			const offX = Math.cos(angle) * parent.ux + Math.sin(angle) * parent.vx
			const offY = Math.cos(angle) * parent.uy + Math.sin(angle) * parent.vy
			const offZ = Math.cos(angle) * parent.uz + Math.sin(angle) * parent.vz
			const cosA = Math.cos(offDist)
			const sinA = Math.sin(offDist)
			let sx = parent.x * cosA + offX * sinA
			let sy = parent.y * cosA + offY * sinA
			let sz = parent.z * cosA + offZ * sinA
			const sLen = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1
			sx /= sLen
			sy /= sLen
			sz /= sLen
			const satFrame = buildTangentFrame(
				sx,
				sy,
				sz,
				parent.dx,
				parent.dy,
				parent.dz,
			)
			domes.push({
				x: sx,
				y: sy,
				z: sz,
				strength: parent.strength * DOME_SATELLITE_STRENGTH,
				baseStrength: parent.baseStrength * DOME_SATELLITE_STRENGTH,
				sigma: parent.sigma * DOME_SATELLITE_SIGMA,
				chainIndex: parent.chainIndex,
				chainLength: parent.chainLength,
				dx: parent.dx,
				dy: parent.dy,
				dz: parent.dz,
				...satFrame,
				riftAngles: [],
				isContinental: parent.isContinental,
			} as Dome)
		}
	}

	for (let h = 0; h < NUM_HOTSPOTS; h++) {
		const hStrength = DOME_STRENGTH * (0.4 + hsRng.random() * 1.2)
		const hSigma = DOME_SIGMA * (0.4 + hsRng.random() * 1.2)
		const hDecay = CHAIN_DECAY + (hsRng.random() - 0.5) * 0.35
		const hLength = Math.max(
			3,
			CHAIN_LENGTH + Math.round((hsRng.random() - 0.5) * 10),
		)

		let hx = 0
		let hy = 0
		let hz = 1
		if (mantleNorm) {
			let bestScore = -Infinity
			for (let c = 0; c < HOTSPOT_UPWELLING_CANDIDATES; c++) {
				const theta = 2 * Math.PI * hsPosRng.random()
				const cosPhiVal = 2 * hsPosRng.random() - 1
				const sinPhiVal = Math.sqrt(1 - cosPhiVal * cosPhiVal)
				const cx = sinPhiVal * Math.cos(theta)
				const cy = sinPhiVal * Math.sin(theta)
				const cz = cosPhiVal
				const candidateRegion = findNearestR(mesh, cx, cy, cz)
				const score =
					mantleNorm[candidateRegion] +
					(hsPosRng.random() - 0.5) * HOTSPOT_UPWELLING_JITTER
				if (score > bestScore) {
					bestScore = score
					hx = cx
					hy = cy
					hz = cz
				}
			}
		} else {
			const theta = 2 * Math.PI * hsPosRng.random()
			const cosPhiVal = 2 * hsPosRng.random() - 1
			const sinPhiVal = Math.sqrt(1 - cosPhiVal * cosPhiVal)
			hx = sinPhiVal * Math.cos(theta)
			hy = sinPhiVal * Math.sin(theta)
			hz = cosPhiVal
		}

		const centerR = findNearestR(mesh, hx, hy, hz)
		const plate = plates[plateAssignment[centerR]]
		const drift = eulerVelocityAt(plate.pole, plate.omega, hx, hy, hz)
		const driftLen = Math.sqrt(
			drift[0] * drift[0] + drift[1] * drift[1] + drift[2] * drift[2],
		)
		if (driftLen < 1e-6) continue
		drift[0] /= driftLen
		drift[1] /= driftLen
		drift[2] /= driftLen

		const isOceanHotspot = plate.isOcean
		const isContinental = !isOceanHotspot
		const sigmaScale = isContinental ? CONT_HOTSPOT_SIGMA_MULT : 1.0
		const strengthScale = isContinental ? CONT_HOTSPOT_STRENGTH_MULT : 1.0
		const oceanBoost = isOceanHotspot ? DOME_OCEAN_BOOST : 1.0
		const effectiveSigma = hSigma * sigmaScale
		const effectiveStrength = hStrength * strengthScale * oceanBoost

		const baseRiftAngle = hsNoise3.noise3D(hx * 10, hy * 10, hz * 10) * Math.PI

		const frame0 = buildTangentFrame(hx, hy, hz, drift[0], drift[1], drift[2])
		domes.push({
			x: hx,
			y: hy,
			z: hz,
			strength: effectiveStrength,
			baseStrength: hStrength * strengthScale,
			sigma: effectiveSigma,
			chainIndex: 0,
			chainLength: hLength,
			dx: drift[0],
			dy: drift[1],
			dz: drift[2],
			...frame0,
			riftAngles: riftAnglesForDome(0, hLength, baseRiftAngle),
			isContinental,
		} as Dome)
		spawnSatellites(domes[domes.length - 1])

		// Chain trail
		let perpX = drift[1] * hz - drift[2] * hy
		let perpY = drift[2] * hx - drift[0] * hz
		let perpZ = drift[0] * hy - drift[1] * hx
		const perpLen =
			Math.sqrt(perpX * perpX + perpY * perpY + perpZ * perpZ) || 1
		perpX /= perpLen
		perpY /= perpLen
		perpZ /= perpLen

		let cx = hx,
			cy = hy,
			cz = hz
		let str = effectiveStrength
		let baseStr = hStrength * strengthScale
		for (let c = 0; c < hLength; c++) {
			const ci = c + 1
			const decayJitter = hDecay * (0.7 + hsRng.random() * 0.6)
			str *= decayJitter
			baseStr *= decayJitter
			const stepSpacing = CHAIN_SPACING * (0.3 + hsRng.random() * 1.4)
			const ageBroadening = 1.0 + ci * DOME_AGE_BROADENING
			const stepSigma =
				effectiveSigma * (0.5 + hsRng.random() * 1.0) * ageBroadening
			const wobble = (hsRng.random() - 0.5) * 0.8
			const ddx = -drift[0] + perpX * wobble
			const ddy = -drift[1] + perpY * wobble
			const ddz = -drift[2] + perpZ * wobble
			const dot = ddx * cx + ddy * cy + ddz * cz
			let tx = ddx - dot * cx,
				ty = ddy - dot * cy,
				tz = ddz - dot * cz
			const tLen = Math.sqrt(tx * tx + ty * ty + tz * tz)
			if (tLen < 1e-6) break
			tx /= tLen
			ty /= tLen
			tz /= tLen
			const cosA = Math.cos(stepSpacing)
			const sinA = Math.sin(stepSpacing)
			cx = cx * cosA + tx * sinA
			cy = cy * cosA + ty * sinA
			cz = cz * cosA + tz * sinA
			const nL = Math.sqrt(cx * cx + cy * cy + cz * cz)
			cx /= nL
			cy /= nL
			cz /= nL

			const frameC = buildTangentFrame(cx, cy, cz, drift[0], drift[1], drift[2])
			domes.push({
				x: cx,
				y: cy,
				z: cz,
				strength: str,
				baseStrength: baseStr,
				sigma: stepSigma,
				chainIndex: ci,
				chainLength: hLength,
				dx: drift[0],
				dy: drift[1],
				dz: drift[2],
				...frameC,
				riftAngles: riftAnglesForDome(ci, hLength, baseRiftAngle),
				isContinental,
			} as Dome)
			if (ci <= Math.ceil(hLength * 0.4)) {
				spawnSatellites(domes[domes.length - 1])
			}
		}

		const lipRegion = findNearestR(mesh, cx, cy, cz)
		const upwelling = mantleNorm ? Math.max(0, mantleNorm[lipRegion]) : 0.5
		appendLargeIgneousProvinceSites(lipSites, {
			x: cx,
			y: cy,
			z: cz,
			drift: [drift[0], drift[1], drift[2]],
			upwelling,
			volcanism,
			isOcean:
				plates[plateAssignment[lipRegion]]?.isOcean ??
				elevation[lipRegion] <= 0,
			random: () => hsRng.random(),
		})
	}

	// Pre-compute per-dome constants
	for (const dm of domes) {
		dm.cosThreshPeak = Math.cos(dm.sigma * 5.5)
		dm.invS2 = -0.5 / (dm.sigma * dm.sigma)
		const swellMultiplier = dm.isContinental ? CONT_HOTSPOT_SWELL_MULT : 1.0
		const swSigma = dm.sigma * SWELL_SIGMA_MULT * swellMultiplier
		dm.swellSigma = swSigma
		dm.swellStrength = dm.baseStrength * SWELL_STR_MULT
		dm.cosThreshSwell = Math.cos(swSigma * 3)
		dm.invS2Swell = -0.5 / (swSigma * swSigma)
		dm.driftStretch = 1.0 / DOME_DRIFT_STRETCH
		dm.hasCaldera =
			dm.chainIndex <= 1 && dm.strength > DOME_CALDERA_STRENGTH_MIN
		dm.calderaSigma =
			dm.sigma * (dm.isContinental ? CONT_HOTSPOT_CALDERA_SIGMA_FRAC : 0.25)
		dm.calderaDepth =
			dm.strength * (dm.isContinental ? CONT_HOTSPOT_CALDERA_DEPTH_FRAC : 0.2)
		dm.invS2Caldera = -0.5 / (dm.calderaSigma * dm.calderaSigma)
		dm.ageFactor = dm.chainLength > 0 ? dm.chainIndex / dm.chainLength : 0
	}

	const domeGrid: number[][] = new Array(18 * 36)
	for (let d = 0; d < domes.length; d++) {
		const dm = domes[d]
		const lat = Math.asin(Math.max(-1, Math.min(1, dm.y)))
		const lon = Math.atan2(dm.x, dm.z)
		const bi = Math.max(
			0,
			Math.min(17, Math.floor(((lat + Math.PI / 2) / Math.PI) * 18)),
		)
		const bj = Math.max(
			0,
			Math.min(35, Math.floor(((lon + Math.PI) / (2 * Math.PI)) * 36)),
		)
		const bin = bi * 36 + bj
		domeGrid[bin] ??= []
		domeGrid[bin].push(d)
	}

	for (let r = 0; r < numRegions; r++) {
		const rx = r_xyz[3 * r]
		const ry = r_xyz[3 * r + 1]
		const rz = r_xyz[3 * r + 2]
		const rLat = Math.asin(Math.max(-1, Math.min(1, ry)))
		const rLon = Math.atan2(rx, rz)
		const rbi = Math.max(
			0,
			Math.min(17, Math.floor(((rLat + Math.PI / 2) / Math.PI) * 18)),
		)
		const rbj = Math.max(
			0,
			Math.min(35, Math.floor(((rLon + Math.PI) / (2 * Math.PI)) * 36)),
		)

		let totalUplift = 0
		let totalSwellUplift = 0
		let weightedAge = 0
		let ageWeightSum = 0
		let nearPeak = false
		let shapeWarpSq = 1
		let hasContrib = false

		for (let di = -1; di <= 1; di++) {
			const bi = rbi + di
			if (bi < 0 || bi >= 18) continue
			for (let dj = -1; dj <= 1; dj++) {
				const bj = (((rbj + dj) % 36) + 36) % 36
				const cell = domeGrid[bi * 36 + bj]
				if (!cell) continue
				for (const domeIndex of cell) {
					const dm = domes[domeIndex]
					const cdot = dm.x * rx + dm.y * ry + dm.z * rz
					if (cdot > dm.cosThreshSwell) hasContrib = true
					if (cdot > dm.cosThreshPeak && !nearPeak) nearPeak = true
				}
			}
		}
		if (!hasContrib) continue

		if (nearPeak) {
			const wx =
				fbm(hsNoise2, rx * 8 + 5.1, ry * 8 + 3.7, rz * 8 + 9.2, 2) * 0.4
			const wy =
				fbm(hsNoise2, rx * 8 + 11.3, ry * 8 + 7.1, rz * 8 + 2.9, 2) * 0.4
			const wz =
				fbm(hsNoise2, rx * 8 + 1.7, ry * 8 + 13.5, rz * 8 + 6.4, 2) * 0.4
			const shapeWarp =
				1 +
				0.4 *
					fbm(
						hsNoise,
						(rx + wx) * 20 + 3.2,
						(ry + wy) * 20 + 7.8,
						(rz + wz) * 20 + 1.5,
						4,
					)
			shapeWarpSq = shapeWarp * shapeWarp
		}

		for (let di = -1; di <= 1; di++) {
			const bi = rbi + di
			if (bi < 0 || bi >= 18) continue
			for (let dj = -1; dj <= 1; dj++) {
				const bj = (((rbj + dj) % 36) + 36) % 36
				const cell = domeGrid[bi * 36 + bj]
				if (!cell) continue
				for (const domeIndex of cell) {
					const dm = domes[domeIndex]
					const dot = dm.x * rx + dm.y * ry + dm.z * rz

					if (dot > dm.cosThreshSwell) {
						const swAngleSq = 2 * (1 - dot)
						totalSwellUplift +=
							dm.swellStrength * Math.exp(swAngleSq * dm.invS2Swell)
					}

					if (dot < dm.cosThreshPeak) continue

					const offX = rx - dot * dm.x
					const offY = ry - dot * dm.y
					const offZ = rz - dot * dm.z
					const parComp = offX * dm.ux + offY * dm.uy + offZ * dm.uz
					const perpComp = offX * dm.vx + offY * dm.vy + offZ * dm.vz
					const stretchedParSq =
						parComp * dm.driftStretch * (parComp * dm.driftStretch)
					const angleSq = stretchedParSq + perpComp * perpComp

					let gauss = Math.exp(angleSq * shapeWarpSq * dm.invS2)
					if (dm.riftAngles.length > 0 && gauss > 0.01) {
						const angle = Math.atan2(perpComp, parComp)
						let maxRift = 0
						for (const riftAngle of dm.riftAngles) {
							let da = angle - riftAngle
							da = da - Math.round(da / (2 * Math.PI)) * 2 * Math.PI
							const c2 = Math.cos(da)
							const riftFactor = c2 * c2 * c2 * c2
							if (riftFactor > maxRift) maxRift = riftFactor
						}
						gauss *= 1 + 0.5 * maxRift
					}

					const peakUplift = dm.strength * gauss
					totalUplift += peakUplift
					weightedAge += dm.ageFactor * peakUplift
					ageWeightSum += peakUplift

					if (dm.hasCaldera) {
						totalUplift -= dm.calderaDepth * Math.exp(angleSq * dm.invS2Caldera)
					}
				}
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

	const lipContrib = applyLargeIgneousProvinces({
		mesh,
		elevation,
		lipSites,
		seed,
		markFeature,
	})
	for (let r = 0; r < numRegions; r++) {
		if (lipContrib[r] > 0) hotspotContrib[r] += lipContrib[r]
	}

	return hotspotContrib
}
