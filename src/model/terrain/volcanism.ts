import type { BoundaryInfo, SphereMesh } from ".."
import { SimplexNoise } from "../shared/simplex-noise"
import { getVolcanismOverdrive } from "../shared/volcanism"
import { OROGEN_TERRAIN_FEATURE } from "../types/tectonics"

const VOLC_MIN_SPACING = 0.015
const VOLC_SIGMA_BASE = 0.003
const VOLC_HEIGHT_BASE = 0.18
const VOLC_HEIGHT_VAR_BASE = 0.7
const VOLC_HEIGHT_VAR_RANGE = 0.6
const VOLC_SIGMA_VAR_BASE = 0.6
const VOLC_SIGMA_VAR_RANGE = 0.8
const VOLC_SUBDUCT_THRESH = 0.45

const LIP_SIGMA = 0.08
const LIP_HEIGHT = 0.03
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

export interface LipSite extends TangentFrame {
	x: number
	y: number
	z: number
	height: number
	sigma: number
	aspect: number
}

export type TerrainFeatureMarker = (
	region: number,
	feature: number,
	delta: number,
) => void

export function getVolcanicArcSpacing(volcanism: number): number {
	return VOLC_MIN_SPACING * (1 - 0.65 * getVolcanismOverdrive(volcanism))
}

export function getLipUpwellingThreshold(volcanism: number): number {
	return 0.02 * (1 - getVolcanismOverdrive(volcanism))
}

export function getLipSpawnChance(_volcanism: number): number {
	return 1
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
	const arcVolcNoise = new SimplexNoise(seed + 713)
	const minSpacingSq = getVolcanicArcSpacing(volcanism) ** 2
	const overdrive = getVolcanismOverdrive(volcanism)
	const coneHeightMultiplier = 1 + 0.35 * overdrive

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
			height:
				VOLC_HEIGHT_BASE *
				(0.5 + candidate.stressLocal) *
				heightVar *
				coneHeightMultiplier,
			invS2: -0.5 / (sigma * sigma),
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
					if (dot < 0.9999) continue
					const angleSq = Math.max(0, 2 * (1 - dot))
					const gauss = Math.exp(angleSq * volc.invS2)
					if (gauss > 0.01) volcUplift += volc.height * gauss
				}
			}
		}
		if (volcUplift > 0.001) {
			elevation[r] += volcUplift
			uplift[r] = volcUplift
			markFeature(r, OROGEN_TERRAIN_FEATURE.VOLCANIC_ARC, volcUplift)
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
	const overdrive = getVolcanismOverdrive(volcanism)
	const landBoost = isOcean ? 0.6 : 1.0
	const lipHeight =
		LIP_HEIGHT *
		(0.5 + random()) *
		(0.5 + upwelling) *
		landBoost *
		(1 + 0.45 * overdrive)
	const baseLipSigma =
		LIP_SIGMA * (0.7 + 0.6 * random()) * (1 + 0.55 * overdrive)
	const lipFrame = buildTangentFrame(x, y, z, drift[0], drift[1], drift[2])
	const lipAspect = 1.5 + random() * 1.5

	lipSites.push({
		x,
		y,
		z,
		height: lipHeight,
		sigma: baseLipSigma,
		aspect: lipAspect,
		...lipFrame,
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

		const lobeAngle = random() * Math.PI
		const lobeCa = Math.cos(lobeAngle)
		const lobeSa = Math.sin(lobeAngle)
		lipSites.push({
			x: lx,
			y: ly,
			z: lz,
			height: lipHeight * LIP_LOBE_STRENGTH * (0.5 + random() * 0.5),
			sigma: baseLipSigma * LIP_LOBE_SIGMA * (0.6 + random() * 0.8),
			ux: lobeCa * lipFrame.ux + lobeSa * lipFrame.vx,
			uy: lobeCa * lipFrame.uy + lobeSa * lipFrame.vy,
			uz: lobeCa * lipFrame.uz + lobeSa * lipFrame.vz,
			vx: -lobeSa * lipFrame.ux + lobeCa * lipFrame.vx,
			vy: -lobeSa * lipFrame.uy + lobeCa * lipFrame.vy,
			vz: -lobeSa * lipFrame.uz + lobeCa * lipFrame.vz,
			aspect: 1.2 + random() * 1.3,
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

	const lipWarpNoise = new SimplexNoise(seed + 7771)
	const lipWarpAmp = 0.08

	for (let r = 0; r < mesh.numRegions; r++) {
		const rx = mesh.r_xyz[3 * r]
		const ry = mesh.r_xyz[3 * r + 1]
		const rz = mesh.r_xyz[3 * r + 2]

		const wx = rx + lipWarpNoise.noise3D(rx * 6, ry * 6, rz * 6) * lipWarpAmp
		const wy =
			ry +
			lipWarpNoise.noise3D(rx * 6 + 40, ry * 6 + 40, rz * 6 + 40) * lipWarpAmp
		const wz =
			rz +
			lipWarpNoise.noise3D(rx * 6 + 80, ry * 6 + 80, rz * 6 + 80) * lipWarpAmp
		const wl = Math.sqrt(wx * wx + wy * wy + wz * wz) || 1
		const wrx = wx / wl
		const wry = wy / wl
		const wrz = wz / wl

		let total = 0
		for (const lip of lipSites) {
			const dot = wrx * lip.x + wry * lip.y + wrz * lip.z
			if (dot < 0.9) continue

			const dx = wrx - lip.x * dot
			const dy = wry - lip.y * dot
			const dz = wrz - lip.z * dot
			const du = dx * lip.ux + dy * lip.uy + dz * lip.uz
			const dv = dx * lip.vx + dy * lip.vy + dz * lip.vz
			const ellipDist = (du * du) / (lip.aspect * lip.aspect) + dv * dv
			const invS2 = -0.5 / (lip.sigma * lip.sigma)
			const gauss = Math.exp(ellipDist * invS2)
			if (gauss > 0.01) total += lip.height * gauss
		}

		if (total > 0.001) {
			elevation[r] += total
			uplift[r] = total
			markFeature(r, OROGEN_TERRAIN_FEATURE.LARGE_IGNEOUS_PROVINCE, total)
		}
	}

	return uplift
}
