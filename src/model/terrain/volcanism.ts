import type { BoundaryInfo, SphereMesh } from ".."
import { SimplexNoise } from "../shared/simplex-noise"
import { GENESIS_TERRAIN_FEATURE } from "../types/tectonics"

const VOLC_MIN_SPACING = 0.015
const VOLC_SIGMA_BASE = 0.005
const VOLC_HEIGHT_BASE = 0.4
const VOLC_HEIGHT_VAR_BASE = 0.7
const VOLC_HEIGHT_VAR_RANGE = 0.6
const VOLC_SIGMA_VAR_BASE = 0.6
const VOLC_SIGMA_VAR_RANGE = 0.8
const VOLC_SUBDUCT_THRESH = 0.45

const LIP_SIGMA = 0.12
const LIP_HEIGHT = 0.02
const LIP_LOBE_COUNT = 6
const LIP_LOBE_OFFSET = 0.6
const LIP_LOBE_SIGMA = 0.6
const LIP_LOBE_STRENGTH = 0.9

interface TangentFrame {
	ux: number
	uy: number
	uz: number
	vx: number
	vy: number
	vz: number
}

export interface LipSite {
	x: number
	y: number
	z: number
	height: number
	sigma: number
}

export type TerrainFeatureMarker = (
	region: number,
	feature: number,
	delta: number,
) => void

function getVolcanismFrequency(volcanism: number): number {
	return Math.max(0, volcanism)
}

export function getScaledFeatureCount(
	baseCount: number,
	volcanism: number,
): number {
	const frequency = getVolcanismFrequency(volcanism)
	if (frequency <= 0) return 0
	return Math.max(1, Math.round(baseCount * Math.sqrt(frequency)))
}

export function getVolcanicActivityThreshold(
	baseThreshold: number,
	volcanism: number,
	minThreshold = 0.05,
): number {
	const frequency = getVolcanismFrequency(volcanism)
	if (frequency <= 0) return 1.1
	if (frequency < 1)
		return baseThreshold + (1 - baseThreshold) * (1 - frequency)
	return Math.max(minThreshold, baseThreshold / Math.sqrt(frequency))
}

export function getVolcanicArcSpacing(volcanism: number): number {
	const frequency = getVolcanismFrequency(volcanism)
	if (frequency <= 0) return Number.POSITIVE_INFINITY
	return VOLC_MIN_SPACING / Math.sqrt(frequency)
}

export function getLipUpwellingThreshold(volcanism: number): number {
	return getVolcanicActivityThreshold(0.2, volcanism, 0.05)
}

export function getLipSpawnChance(volcanism: number): number {
	const frequency = getVolcanismFrequency(volcanism)
	if (frequency <= 0) return 0
	return Math.min(1, frequency)
}

export function buildTangentFrame(
	px: number,
	py: number,
	pz: number,
	dx: number,
	dy: number,
	dz: number,
): TangentFrame {
	const dd = dx * px + dy * py + dz * pz
	let ux = dx - dd * px
	let uy = dy - dd * py
	let uz = dz - dd * pz
	const uLen = Math.sqrt(ux * ux + uy * uy + uz * uz) || 1
	ux /= uLen
	uy /= uLen
	uz /= uLen
	const vx = py * uz - pz * uy
	const vy = pz * ux - px * uz
	const vz = px * uy - py * ux
	return { ux, uy, uz, vx, vy, vz }
}

interface VolcanicArcParams {
	mesh: SphereMesh
	elevation: Float32Array
	boundary: BoundaryInfo
	maxStress: number
	seed: number
	volcanism: number
	markFeature: TerrainFeatureMarker
}

export function applyVolcanicArcs({
	mesh,
	elevation,
	boundary,
	maxStress,
	seed,
	volcanism,
	markFeature,
}: VolcanicArcParams): Float32Array {
	const { numRegions, r_xyz } = mesh
	const uplift = new Float32Array(numRegions)
	if (volcanism <= 0) return uplift
	const arcVolcNoise = new SimplexNoise(seed + 713)
	const minSpacingSq = getVolcanicArcSpacing(volcanism) ** 2

	const candidates: Array<{
		x: number
		y: number
		z: number
		score: number
		stressLocal: number
	}> = []

	for (let r = 0; r < numRegions; r++) {
		if (
			boundary.r_boundaryType[r] === 1 &&
			boundary.r_hasOcean[r] === 1 &&
			boundary.r_subductFactor[r] < VOLC_SUBDUCT_THRESH
		) {
			const stressLocal =
				maxStress > 1e-6 ? Math.min(1, boundary.r_stress[r] / maxStress) : 0
			const x = r_xyz[3 * r]
			const y = r_xyz[3 * r + 1]
			const z = r_xyz[3 * r + 2]
			const score =
				stressLocal + 0.3 * arcVolcNoise.noise3D(x * 8, y * 8, z * 8)
			candidates.push({
				x,
				y,
				z,
				score,
				stressLocal,
			})
		}
	}
	candidates.sort((a, b) => b.score - a.score)

	const volcPositions: Array<{
		x: number
		y: number
		z: number
		height: number
		invS2: number
		cosThresh: number
	}> = []

	for (const candidate of candidates) {
		let tooClose = false
		for (const volc of volcPositions) {
			const dot =
				candidate.x * volc.x + candidate.y * volc.y + candidate.z * volc.z
			const distSq = Math.max(0, 2 * (1 - dot))
			if (distSq < minSpacingSq) {
				tooClose = true
				break
			}
		}
		if (tooClose) continue

		const heightVar =
			VOLC_HEIGHT_VAR_BASE +
			VOLC_HEIGHT_VAR_RANGE *
				arcVolcNoise.noise3D(
					candidate.x * 10,
					candidate.y * 10,
					candidate.z * 10,
				)
		const sigmaVar =
			VOLC_SIGMA_VAR_BASE +
			VOLC_SIGMA_VAR_RANGE *
				arcVolcNoise.noise3D(
					candidate.x * 5 + 17.3,
					candidate.y * 5 + 9.1,
					candidate.z * 5 + 4.7,
				)
		const sigma = VOLC_SIGMA_BASE * sigmaVar
		volcPositions.push({
			x: candidate.x,
			y: candidate.y,
			z: candidate.z,
			height: VOLC_HEIGHT_BASE * (0.5 + candidate.stressLocal) * heightVar,
			invS2: -0.5 / (sigma * sigma),
			cosThresh: Math.cos(sigma * 4),
		})
	}

	const latBins = 36
	const lonBins = 72
	const volcGrid: number[][] = new Array(latBins * lonBins)
	for (let i = 0; i < volcPositions.length; i++) {
		const volc = volcPositions[i]
		const lat = Math.asin(Math.max(-1, Math.min(1, volc.y)))
		const lon = Math.atan2(volc.x, volc.z)
		const bi = Math.max(
			0,
			Math.min(
				latBins - 1,
				Math.floor(((lat + Math.PI / 2) / Math.PI) * latBins),
			),
		)
		const bj = Math.max(
			0,
			Math.min(
				lonBins - 1,
				Math.floor(((lon + Math.PI) / (2 * Math.PI)) * lonBins),
			),
		)
		const bin = bi * lonBins + bj
		volcGrid[bin] ??= []
		volcGrid[bin].push(i)
	}

	for (let r = 0; r < numRegions; r++) {
		const rx = r_xyz[3 * r]
		const ry = r_xyz[3 * r + 1]
		const rz = r_xyz[3 * r + 2]
		const rLat = Math.asin(Math.max(-1, Math.min(1, ry)))
		const rLon = Math.atan2(rx, rz)
		const rbi = Math.max(
			0,
			Math.min(
				latBins - 1,
				Math.floor(((rLat + Math.PI / 2) / Math.PI) * latBins),
			),
		)
		const rbj = Math.max(
			0,
			Math.min(
				lonBins - 1,
				Math.floor(((rLon + Math.PI) / (2 * Math.PI)) * lonBins),
			),
		)

		let volcUplift = 0
		for (let di = -1; di <= 1; di++) {
			const bi = rbi + di
			if (bi < 0 || bi >= latBins) continue
			for (let dj = -1; dj <= 1; dj++) {
				const bj = (((rbj + dj) % lonBins) + lonBins) % lonBins
				const cell = volcGrid[bi * lonBins + bj]
				if (!cell) continue
				for (const volcIndex of cell) {
					const volc = volcPositions[volcIndex]
					const dot = rx * volc.x + ry * volc.y + rz * volc.z
					if (dot < volc.cosThresh) continue
					const angleSq = Math.max(0, 2 * (1 - dot))
					const gauss = Math.exp(angleSq * volc.invS2)
					if (gauss > 0.01) volcUplift += volc.height * gauss
				}
			}
		}
		if (volcUplift > 0.001) {
			elevation[r] += volcUplift
			uplift[r] = volcUplift
			markFeature(r, GENESIS_TERRAIN_FEATURE.VOLCANIC_ARC, volcUplift)
		}
	}

	return uplift
}

interface AppendLipSitesParams {
	x: number
	y: number
	z: number
	drift: [number, number, number]
	upwelling: number
	volcanism: number
	isOcean: boolean
	random: () => number
}

export function appendLargeIgneousProvinceSites(
	lipSites: LipSite[],
	{
		x,
		y,
		z,
		drift,
		upwelling,
		isOcean,
		random,
		volcanism,
	}: AppendLipSitesParams,
): void {
	void volcanism
	const landBoost = isOcean ? 0.6 : 1.0
	const baseLipStr =
		LIP_HEIGHT * (0.5 + random()) * (0.5 + upwelling) * landBoost
	const baseLipSigma = LIP_SIGMA * (0.7 + 0.6 * random())
	const lipFrame = buildTangentFrame(x, y, z, drift[0], drift[1], drift[2])

	lipSites.push({
		x,
		y,
		z,
		height: baseLipStr,
		sigma: baseLipSigma,
	})

	for (let i = 0; i < LIP_LOBE_COUNT; i++) {
		const angle = random() * 2 * Math.PI
		const lobeOffset = baseLipSigma * LIP_LOBE_OFFSET * (0.4 + random() * 0.6)
		const ca = Math.cos(angle)
		const sa = Math.sin(angle)
		const offX = ca * lipFrame.ux + sa * lipFrame.vx
		const offY = ca * lipFrame.uy + sa * lipFrame.vy
		const offZ = ca * lipFrame.uz + sa * lipFrame.vz
		const cosD = Math.cos(lobeOffset)
		const sinD = Math.sin(lobeOffset)
		let lx = x * cosD + offX * sinD
		let ly = y * cosD + offY * sinD
		let lz = z * cosD + offZ * sinD
		const ll = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1
		lx /= ll
		ly /= ll
		lz /= ll

		lipSites.push({
			x: lx,
			y: ly,
			z: lz,
			height: baseLipStr * LIP_LOBE_STRENGTH * (0.5 + random() * 0.5),
			sigma: baseLipSigma * LIP_LOBE_SIGMA * (0.6 + random() * 0.8),
		})
	}
}

interface LargeIgneousProvinceParams {
	mesh: SphereMesh
	elevation: Float32Array
	lipSites: LipSite[]
	seed: number
	markFeature: TerrainFeatureMarker
}

export function applyLargeIgneousProvinces({
	mesh,
	elevation,
	lipSites,
	seed,
	markFeature,
}: LargeIgneousProvinceParams): Float32Array {
	const uplift = new Float32Array(mesh.numRegions)
	if (lipSites.length === 0) return uplift
	void seed

	for (let r = 0; r < mesh.numRegions; r++) {
		const rx = mesh.r_xyz[3 * r]
		const ry = mesh.r_xyz[3 * r + 1]
		const rz = mesh.r_xyz[3 * r + 2]

		let total = 0
		for (const lip of lipSites) {
			const dot = rx * lip.x + ry * lip.y + rz * lip.z
			const angleSq = Math.max(0, 2 * (1 - dot))
			const invS2 = -0.5 / (lip.sigma * lip.sigma)
			const gauss = Math.exp(angleSq * invS2)
			if (gauss > 0.01) total += lip.height * gauss
		}

		if (total > 0.001) {
			elevation[r] += total
			uplift[r] = total
			markFeature(r, GENESIS_TERRAIN_FEATURE.LARGE_IGNEOUS_PROVINCE, total)
		}
	}

	return uplift
}
