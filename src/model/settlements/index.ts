import {
	LANDMARK_TYPE_LAKE,
	LANDMARK_TYPE_OCEAN,
	LANDMARK_TYPE_SEA,
} from "@/model/terrain"
import type {
	SettlementAnchors,
	GetLargestAdjacentWaterRegionParams,
	InlandPriorityParams,
	ComputeSettlementAnchorsParams,
} from "@/model/settlements/types"

const LAKE_TOPOGRAPHY = 6

const WATER_LANDMARK_TYPES = new Set([
	LANDMARK_TYPE_OCEAN,
	LANDMARK_TYPE_SEA,
	LANDMARK_TYPE_LAKE,
])

function getLargestAdjacentWaterRegion({
	world,
	region,
}: GetLargestAdjacentWaterRegionParams): {
	landmark: number
	waterRegion: number
	size: number
} | null {
	const landmarks = world.landmarks
	if (!landmarks) return null

	let bestLandmark = -1
	let bestWaterRegion = -1
	let bestSize = -1
	for (
		let i = world.mesh.adjOffset[region],
			end = world.mesh.adjOffset[region + 1];
		i < end;
		i++
	) {
		const neighbor = world.mesh.adjList[i]
		if (world.isLand[neighbor]) continue
		const landmark = landmarks.regionLandmark[neighbor]
		if (landmark < 0 || !WATER_LANDMARK_TYPES.has(landmarks.type[landmark])) {
			continue
		}
		const size = landmarks.size[landmark]
		if (
			size > bestSize ||
			(size === bestSize && (bestLandmark < 0 || landmark < bestLandmark))
		) {
			bestLandmark = landmark
			bestWaterRegion = neighbor
			bestSize = size
		}
	}

	return bestLandmark >= 0
		? {
				landmark: bestLandmark,
				waterRegion: bestWaterRegion,
				size: bestSize,
			}
		: null
}

function inlandPriority({ world, region }: InlandPriorityParams): 1 | 2 | 3 {
	const { topography } = world
	if (topography) {
		for (
			let i = world.mesh.adjOffset[region],
				end = world.mesh.adjOffset[region + 1];
			i < end;
			i++
		) {
			if (topography[world.mesh.adjList[i]] === LAKE_TOPOGRAPHY) return 1
		}
	}
	if (world.rivers?.visible[region]) return 2
	return 3
}

function computeSettlementAnchors({
	world,
	activeProvinceMask,
}: ComputeSettlementAnchorsParams): SettlementAnchors {
	const provinces = world.provinces
	if (!provinces) {
		return {
			settlementRegions: new Int32Array(0),
			settlementWaterLandmarks: new Int32Array(0),
			settlementPortRegions: new Int32Array(0),
		}
	}

	const settlementRegions = new Int32Array(provinces.count).fill(-1)
	const settlementWaterLandmarks = new Int32Array(provinces.count).fill(-1)
	const settlementPortRegions = new Int32Array(provinces.count).fill(-1)
	const bestPriority = new Int8Array(provinces.count).fill(99)
	const bestWaterSize = new Int32Array(provinces.count).fill(-1)
	const bestDist = new Float32Array(provinces.count).fill(Infinity)
	const provinceHasCoast = new Uint8Array(provinces.count)
	const { r_xyz } = world.mesh

	const seedX = new Float32Array(provinces.count)
	const seedY = new Float32Array(provinces.count)
	const seedZ = new Float32Array(provinces.count)
	for (let province = 0; province < provinces.count; province++) {
		const seedRegion = provinces.seeds[province]
		if (seedRegion < 0 || seedRegion >= world.mesh.numRegions) continue
		const xyzIndex = seedRegion * 3
		seedX[province] = r_xyz[xyzIndex]
		seedY[province] = r_xyz[xyzIndex + 1]
		seedZ[province] = r_xyz[xyzIndex + 2]
	}

	for (let region = 0; region < world.mesh.numRegions; region++) {
		const province = provinces.regionProvince[region]
		if (province < 0 || provinces.desolate[province] || !world.isLand[region]) {
			continue
		}
		if (activeProvinceMask && !activeProvinceMask[province]) continue
		if (world.coastal[region]) provinceHasCoast[province] = 1
	}

	for (let region = 0; region < world.mesh.numRegions; region++) {
		const province = provinces.regionProvince[region]
		if (province < 0 || provinces.desolate[province] || !world.isLand[region]) {
			continue
		}
		if (activeProvinceMask && !activeProvinceMask[province]) continue

		const adjacentWater = world.coastal[region]
			? getLargestAdjacentWaterRegion({ world, region })
			: null
		if (provinceHasCoast[province] && !adjacentWater) continue

		const priority = provinceHasCoast[province]
			? 0
			: inlandPriority({ world, region })
		if (priority > bestPriority[province]) continue

		const xyzIndex = region * 3
		const dx = r_xyz[xyzIndex] - seedX[province]
		const dy = r_xyz[xyzIndex + 1] - seedY[province]
		const dz = r_xyz[xyzIndex + 2] - seedZ[province]
		const dist = dx * dx + dy * dy + dz * dz
		const waterSize = adjacentWater?.size ?? -1

		const shouldReplace =
			priority < bestPriority[province] ||
			(priority === bestPriority[province] &&
				(waterSize > bestWaterSize[province] ||
					(waterSize === bestWaterSize[province] && dist < bestDist[province])))

		if (!shouldReplace) continue

		settlementRegions[province] = region
		settlementWaterLandmarks[province] = adjacentWater?.landmark ?? -1
		settlementPortRegions[province] = adjacentWater?.waterRegion ?? -1
		bestPriority[province] = priority
		bestWaterSize[province] = waterSize
		bestDist[province] = dist
	}

	return {
		settlementRegions,
		settlementWaterLandmarks,
		settlementPortRegions,
	}
}

export const COMPUTE_SETTLEMENT_REGIONS = {
	computeSettlementAnchors,
}
