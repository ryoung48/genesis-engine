import type {
	ComputeLandmarksParams,
	GenesisLandmarks,
	IncrementCountParams,
	LandmarkType,
} from "@/model/geography/terrain/landmarks/types"
import type { SphereMesh } from "@/model/mesh/types"
import { IDENTITY_SEEDS } from "@/model/shared/random/identity-seeds"
import type { GenesisPartition, GenesisProvinces } from "@/model/society/types"

const landmarkTypes: LandmarkType[] = [
	"continent", // 0
	"island", // 1
	"isle", // 2
	"ocean", // 3
	"sea", // 4
	"lake", // 5
]

const LANDMARK_TYPE_CONTINENT = 0

const LANDMARK_TYPE_ISLAND = 1

const LANDMARK_TYPE_ISLE = 2

const landmarkTypeOcean = 3

const landmarkTypeSea = 4

const landmarkTypeLake = 5

function computeLandmarks({
	mesh,
	isLand,
}: ComputeLandmarksParams): GenesisLandmarks {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh

	const { regionArea } = mesh
	const regionLandmark = new Int32Array(N).fill(-1)
	const sizes: number[] = []
	const areaFractions: number[] = []
	const isWater: boolean[] = []
	const queue: number[] = []
	let landmarkId = 0

	for (let r = 0; r < N; r++) {
		if (regionLandmark[r] >= 0) continue

		const water = !isLand[r]
		isWater.push(water)
		let size = 0
		let area = 0

		queue.length = 0
		queue.push(r)
		regionLandmark[r] = landmarkId
		let head = 0

		while (head < queue.length) {
			const curr = queue[head++]
			size++
			area += regionArea[curr]
			for (let j = adjOffset[curr], jEnd = adjOffset[curr + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (regionLandmark[nb] >= 0) continue
				if (water !== !isLand[nb]) continue
				regionLandmark[nb] = landmarkId
				queue.push(nb)
			}
		}

		sizes.push(size)
		areaFractions.push(area / (4 * Math.PI))
		landmarkId++
	}

	const count = landmarkId

	// Classify by share of total surface area, not cell count: imported meshes
	// pack more, smaller cells onto land, which would promote islands to
	// continents and demote oceans to seas.
	const type = new Uint8Array(count)
	for (let i = 0; i < count; i++) {
		const ratio = areaFractions[i]
		if (isWater[i]) {
			if (ratio >= 0.01) type[i] = landmarkTypeOcean
			else if (ratio >= 0.001) type[i] = landmarkTypeSea
			else type[i] = landmarkTypeLake
		} else {
			if (ratio >= 0.01) type[i] = LANDMARK_TYPE_CONTINENT
			else if (ratio >= 0.001) type[i] = LANDMARK_TYPE_ISLAND
			else type[i] = LANDMARK_TYPE_ISLE
		}
	}

	return {
		regionLandmark,
		type,
		size: new Int32Array(sizes),
		count,
	}
}

function incrementCount({ counts, key }: IncrementCountParams): void {
	counts.set(key, (counts.get(key) ?? 0) + 1)
}

function pickDominantCulture(counts: Map<number, number>): number {
	let culture = -1
	let size = -1
	for (const [candidate, count] of counts) {
		if (
			count > size ||
			(count === size && (culture < 0 || candidate < culture))
		) {
			culture = candidate
			size = count
		}
	}
	return culture
}

function assignLandmarkIdentity(params: {
	mesh: SphereMesh
	landmarks: GenesisLandmarks
	provinces?: Pick<GenesisProvinces, "regionProvince">
	cultures?: Pick<GenesisPartition, "assignment">
	isLand: Uint8Array
	seed: number
}): GenesisLandmarks {
	const { mesh, landmarks, provinces, cultures, isLand, seed } = params
	const dominantCulture = new Int32Array(landmarks.count).fill(-1)
	const assignment = cultures?.assignment
	const regionProvince = provinces?.regionProvince
	if (!assignment || !regionProvince) {
		return {
			...landmarks,
			dominantCulture,
			nameSeeds: IDENTITY_SEEDS.buildIdentitySeeds({
				count: landmarks.count,
				seed: seed + 6103,
			}),
		}
	}

	const internalCounts = Array.from(
		{ length: landmarks.count },
		() => new Map<number, number>(),
	)
	const borderCounts = Array.from(
		{ length: landmarks.count },
		() => new Map<number, number>(),
	)

	for (let region = 0; region < mesh.numRegions; region++) {
		const landmarkId = landmarks.regionLandmark[region]
		if (landmarkId < 0 || !isLand[region]) continue
		const provinceId = regionProvince[region] ?? -1
		const cultureId = provinceId >= 0 ? (assignment[provinceId] ?? -1) : -1
		if (cultureId >= 0)
			incrementCount({ counts: internalCounts[landmarkId], key: cultureId })
	}

	for (let region = 0; region < mesh.numRegions; region++) {
		if (isLand[region]) continue
		const landmarkId = landmarks.regionLandmark[region]
		if (landmarkId < 0 || internalCounts[landmarkId].size > 0) continue
		for (
			let edge = mesh.adjOffset[region], end = mesh.adjOffset[region + 1];
			edge < end;
			edge++
		) {
			const neighbor = mesh.adjList[edge]
			if (!isLand[neighbor]) continue
			const provinceId = regionProvince[neighbor] ?? -1
			const cultureId = provinceId >= 0 ? (assignment[provinceId] ?? -1) : -1
			if (cultureId >= 0)
				incrementCount({ counts: borderCounts[landmarkId], key: cultureId })
		}
	}

	for (let landmarkId = 0; landmarkId < landmarks.count; landmarkId++) {
		const counts =
			internalCounts[landmarkId].size > 0
				? internalCounts[landmarkId]
				: borderCounts[landmarkId]
		dominantCulture[landmarkId] = pickDominantCulture(counts)
	}

	return {
		...landmarks,
		dominantCulture,
		nameSeeds: IDENTITY_SEEDS.buildIdentitySeeds({
			count: landmarks.count,
			seed: seed + 6103,
		}),
	}
}

export const LANDMARKS = {
	landmarkTypes,
	landmarkTypeOcean,
	computeLandmarks,
	assignLandmarkIdentity,
	landmarkTypeSea,
	landmarkTypeLake,
}
