/**
 * Landmass / water body labeling via connected-component BFS.
 * Each region gets a landmark ID; each landmark has a type and size.
 * O(N) time, typed arrays only.
 */
import type { OrogenPartition, OrogenProvinces, SphereMesh } from ".."
import { buildIdentitySeeds } from "../shared/identity-seeds"

type LandmarkType = "continent" | "island" | "isle" | "ocean" | "sea" | "lake"

export interface OrogenLandmarks {
	/** Per-region landmark index */
	regionLandmark: Int32Array
	/** Per-landmark type code (index into LANDMARK_TYPES) */
	type: Uint8Array
	/** Per-landmark region count */
	size: Int32Array
	/** Dominant culture on the landmark, or the dominant bordering culture for water landmarks */
	dominantCulture?: Int32Array
	/** Deterministic per-landmark display/name seed */
	nameSeeds?: Int32Array
	/** Total number of landmarks */
	count: number
}

export const LANDMARK_TYPES: LandmarkType[] = [
	"continent", // 0
	"island", // 1
	"isle", // 2
	"ocean", // 3
	"sea", // 4
	"lake", // 5
]

const TYPE_CONTINENT = 0
const TYPE_ISLAND = 1
const TYPE_ISLE = 2
const TYPE_OCEAN = 3
const TYPE_SEA = 4
const TYPE_LAKE = 5

export function computeLandmarks(
	mesh: SphereMesh,
	isLand: Uint8Array,
): OrogenLandmarks {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh

	const regionLandmark = new Int32Array(N).fill(-1)
	const sizes: number[] = []
	const isWater: boolean[] = []
	const queue: number[] = []
	let landmarkId = 0

	for (let r = 0; r < N; r++) {
		if (regionLandmark[r] >= 0) continue

		const water = !isLand[r]
		isWater.push(water)
		let size = 0

		queue.length = 0
		queue.push(r)
		regionLandmark[r] = landmarkId
		let head = 0

		while (head < queue.length) {
			const curr = queue[head++]
			size++
			for (let j = adjOffset[curr], jEnd = adjOffset[curr + 1]; j < jEnd; j++) {
				const nb = adjList[j]
				if (regionLandmark[nb] >= 0) continue
				if (water !== !isLand[nb]) continue
				regionLandmark[nb] = landmarkId
				queue.push(nb)
			}
		}

		sizes.push(size)
		landmarkId++
	}

	const count = landmarkId

	// Classify by size relative to total
	const type = new Uint8Array(count)
	for (let i = 0; i < count; i++) {
		const ratio = sizes[i] / N
		if (isWater[i]) {
			if (ratio >= 0.01) type[i] = TYPE_OCEAN
			else if (ratio >= 0.001) type[i] = TYPE_SEA
			else type[i] = TYPE_LAKE
		} else {
			if (ratio >= 0.01) type[i] = TYPE_CONTINENT
			else if (ratio >= 0.001) type[i] = TYPE_ISLAND
			else type[i] = TYPE_ISLE
		}
	}

	return {
		regionLandmark,
		type,
		size: new Int32Array(sizes),
		count,
	}
}

function incrementCount(counts: Map<number, number>, key: number): void {
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

export function assignLandmarkIdentity(params: {
	mesh: SphereMesh
	landmarks: OrogenLandmarks
	provinces?: Pick<OrogenProvinces, "regionProvince">
	cultures?: Pick<OrogenPartition, "assignment">
	isLand: Uint8Array
	seed: number
}): OrogenLandmarks {
	const { mesh, landmarks, provinces, cultures, isLand, seed } = params
	const dominantCulture = new Int32Array(landmarks.count).fill(-1)
	const assignment = cultures?.assignment
	const regionProvince = provinces?.regionProvince
	if (!assignment || !regionProvince) {
		return {
			...landmarks,
			dominantCulture,
			nameSeeds: buildIdentitySeeds(landmarks.count, seed + 6103),
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
		if (cultureId >= 0) incrementCount(internalCounts[landmarkId], cultureId)
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
			if (cultureId >= 0) incrementCount(borderCounts[landmarkId], cultureId)
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
		nameSeeds: buildIdentitySeeds(landmarks.count, seed + 6103),
	}
}
