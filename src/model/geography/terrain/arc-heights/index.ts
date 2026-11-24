import { TERRAIN_FEATURES } from "@/model/geography/tectonics/terrain-features"
import { ARC_CRUST } from "@/model/geography/terrain/arc-crust"
import type {
	ArcHeightKmParams,
	HopsFromParams,
	StampArcHeightsParams,
} from "@/model/geography/terrain/arc-heights/types"
import { HEIGHT_SCALE } from "@/model/geography/terrain/height-scale"
import { SimplexNoise } from "@/model/shared/math/simplex-noise"

const ARC_YOUNG_KM = -2
const ARC_MATURE_KM = 0
const ARC_OCEAN_MATURE_KM = -0.2
const ARC_COAST_KM = 300
const ARC_OCEAN_KM = 1000
const ARC_MATURE_MYR = 40
const ARC_ISLAND_KM = 200
const ARC_STRAIT_KM = 20
const ARC_ISLAND_AMP_KM = 1
const ARC_STRAIT_DEPTH_KM = -0.1
const ARC_GAP_KM = 330
const ARC_GAP_THRESHOLD = 0.2
const ARC_GAP_SOFT = 0.2
const ARC_GAP_SEA_KM = -0.8
const ARC_CUT_NEAR_KM = 45
const ARC_CUT_FAR_KM = 120
const SHELF_SEA_FLOOR_KM = -0.25
const SHELF_SEA_SOFT_KM = 0.12
const BLEND_KM = 60
const SEED_ISLAND = 311

function smooth01(x: number): number {
	const t = Math.min(1, Math.max(0, x))
	return t * t * (3 - 2 * t)
}

function seaDepthKm(ageMyr: number): number {
	return Math.min(6.4, 2.6 + 0.345 * Math.sqrt(Math.max(0, ageMyr)))
}

function arcHeightKm({
	ageMyr,
	kmToContinent,
	island,
}: ArcHeightKmParams): number {
	const m = Math.min(1, Math.max(0, ageMyr / ARC_MATURE_MYR))
	const t = Math.min(
		1,
		Math.max(0, (ARC_OCEAN_KM - kmToContinent) / (ARC_OCEAN_KM - ARC_COAST_KM)),
	)
	const matureAt =
		ARC_OCEAN_MATURE_KM +
		(ARC_MATURE_KM - ARC_OCEAN_MATURE_KM) * t * t * (3 - 2 * t)
	return (
		ARC_YOUNG_KM +
		(matureAt - ARC_YOUNG_KM) * m ** 0.7 +
		ARC_ISLAND_AMP_KM * m * island
	)
}

function softFloor({
	h,
	floor,
	soft,
}: {
	h: number
	floor: number
	soft: number
}): number {
	return h >= floor + soft
		? h
		: floor + soft * Math.exp((h - floor - soft) / soft)
}

function hopsFrom({
	mesh,
	sources,
	maxHops,
	through,
}: HopsFromParams): Int16Array {
	const { numRegions, adjOffset, adjList } = mesh
	const hops = new Int16Array(numRegions).fill(-1)
	let frontier: number[] = []
	for (let c = 0; c < numRegions; c++) {
		if (!sources[c]) continue
		hops[c] = 0
		frontier.push(c)
	}
	for (let hop = 1; hop <= maxHops && frontier.length; hop++) {
		const next: number[] = []
		for (const c of frontier) {
			for (let k = adjOffset[c]; k < adjOffset[c + 1]; k++) {
				const nb = adjList[k]
				if (hops[nb] >= 0 || !through[nb]) continue
				hops[nb] = hop
				next.push(nb)
			}
		}
		frontier = next
	}
	return hops
}

function stamp({
	mesh,
	planetRadiusKm,
	seed,
	crust,
	elev,
	maxElevKm,
	maxDepthKm,
	markFeature,
}: StampArcHeightsParams): void {
	const { numRegions, r_xyz, neighborDist } = mesh
	let edgeSum = 0
	for (let k = 0; k < neighborDist.length; k++)
		edgeSum += 2 * Math.asin(Math.min(1, neighborDist[k] / 2))
	const edgeKm = (edgeSum / Math.max(1, neighborDist.length)) * planetRadiusKm

	const isArc = new Uint8Array(numRegions)
	const isSea = new Uint8Array(numRegions)
	const footprint = new Uint8Array(numRegions)
	const continent = new Uint8Array(numRegions)
	const everywhere = new Uint8Array(numRegions).fill(1)
	for (let c = 0; c < numRegions; c++) {
		const type = crust.crustType[c]
		if (type === ARC_CRUST.CRUST.CONTINENT) continent[c] = 1
		else if (type === ARC_CRUST.CRUST.ARC) isArc[c] = 1
		else if (crust.formedAtMyr[c] < 0) isSea[c] = 1
		footprint[c] = isArc[c] | isSea[c]
	}
	let any = false
	for (let c = 0; c < numRegions && !any; c++) if (footprint[c]) any = true
	if (!any) return

	const contHops = hopsFrom({
		mesh,
		sources: continent,
		maxHops: Math.ceil(ARC_OCEAN_KM / edgeKm),
		through: everywhere,
	})
	const outside = new Uint8Array(numRegions)
	const inwardArc = new Uint8Array(numRegions)
	for (let c = 0; c < numRegions; c++) {
		outside[c] = footprint[c] ? 0 : 1
		inwardArc[c] = isArc[c]
	}
	const blendHops = hopsFrom({
		mesh,
		sources: outside,
		maxHops: Math.ceil(BLEND_KM / edgeKm) + 1,
		through: footprint,
	})
	const notArc = new Uint8Array(numRegions)
	for (let c = 0; c < numRegions; c++) notArc[c] = isArc[c] ? 0 : 1
	const arcEdgeHops = hopsFrom({
		mesh,
		sources: notArc,
		maxHops: Math.ceil(ARC_CUT_FAR_KM / edgeKm) + 1,
		through: inwardArc,
	})

	const noise = new SimplexNoise(seed + SEED_ISLAND)
	const f = planetRadiusKm / ARC_ISLAND_KM
	const fGap = planetRadiusKm / ARC_GAP_KM
	const heightOf = (km: number) =>
		HEIGHT_SCALE.heightKmToElev({ heightKm: km, maxElevKm, maxDepthKm })
	const kmOf = (e: number) =>
		HEIGHT_SCALE.elevToHeightKm({ elev: e, maxElevKm, maxDepthKm })

	for (let c = 0; c < numRegions; c++) {
		if (!footprint[c]) continue
		const w = smooth01(
			(((blendHops[c] < 0 ? 1e3 : blendHops[c]) - 0.5) * edgeKm) / BLEND_KM,
		)
		if (w <= 0) continue
		const x = r_xyz[3 * c]
		const y = r_xyz[3 * c + 1]
		const z = r_xyz[3 * c + 2]
		const existingKm = kmOf(elev[c])
		let targetKm: number
		if (isArc[c]) {
			const island =
				0.7 * noise.noise3D(x * f + 21.7, y * f + 5.3, z * f + 13.1) +
				0.3 * noise.noise3D(x * f * 2 + 3.9, y * f * 2 + 17.7, z * f * 2 + 9.4)
			targetKm = arcHeightKm({
				ageMyr: -crust.formedAtMyr[c],
				kmToContinent: contHops[c] < 0 ? Infinity : contHops[c] * edgeKm,
				island,
			})
			const gap = smooth01(
				(ARC_GAP_THRESHOLD -
					noise.noise3D(x * fGap + 41.3, y * fGap + 7.9, z * fGap + 29.6)) /
					ARC_GAP_SOFT,
			)
			targetKm = targetKm * (1 - gap) + ARC_GAP_SEA_KM * gap
			const inland = (arcEdgeHops[c] < 0 ? 1e3 : arcEdgeHops[c]) * edgeKm
			const cut =
				ARC_STRAIT_KM *
				smooth01((0.05 - island) / 0.5) *
				smooth01((ARC_CUT_FAR_KM - inland) / (ARC_CUT_FAR_KM - ARC_CUT_NEAR_KM))
			if (inland - cut <= 0) targetKm = Math.min(targetKm, ARC_STRAIT_DEPTH_KM)
			const wArc = Math.max(w, gap)
			const newKm = existingKm * (1 - wArc) + targetKm * wArc
			const delta = heightOf(newKm) - elev[c]
			elev[c] += delta
			const feature =
				crust.arcType[c] === ARC_CRUST.ARC_TYPE.SUNDA
					? TERRAIN_FEATURES.genesisTerrainFeature.SUNDA_SPLIT_ARC
					: crust.arcType[c] === ARC_CRUST.ARC_TYPE.CONTINENTAL
						? TERRAIN_FEATURES.genesisTerrainFeature.CONTINENTAL_SPLIT_ARC
						: TERRAIN_FEATURES.genesisTerrainFeature.ISLAND_ARC
			markFeature(c, feature, delta)
			continue
		}
		const ageMyr = -crust.formedAtMyr[c]
		const deepKm = -seaDepthKm(ageMyr)
		targetKm = crust.shelfSea[c]
			? softFloor({
					h: deepKm,
					floor: SHELF_SEA_FLOOR_KM,
					soft: SHELF_SEA_SOFT_KM,
				})
			: deepKm
		const newKm = Math.min(existingKm, existingKm * (1 - w) + targetKm * w)
		const delta = heightOf(newKm) - elev[c]
		elev[c] += delta
		markFeature(c, TERRAIN_FEATURES.genesisTerrainFeature.BACK_ARC_BASIN, delta)
	}
}

export const ARC_HEIGHTS = { arcHeightKm, seaDepthKm, stamp }
