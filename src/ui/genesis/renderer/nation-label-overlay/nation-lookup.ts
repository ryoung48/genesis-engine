import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"

export function nationCapitalRegion(
	world: SerializedGenesisWorld,
	nationIdx: number,
): number {
	const nationSeeds = world.nations?.seeds
	if (!nationSeeds || nationIdx < 0 || nationIdx >= nationSeeds.length) {
		return -1
	}
	const capitalProvince = nationSeeds[nationIdx]
	if (capitalProvince < 0) return -1
	const provinceSeeds = world.provinces?.seeds
	if (!provinceSeeds || capitalProvince >= provinceSeeds.length) return -1
	return provinceSeeds[capitalProvince]
}

export function nationCapitalProvince(
	world: SerializedGenesisWorld,
	nationIdx: number,
): number {
	const nationSeeds = world.nations?.seeds
	if (!nationSeeds || nationIdx < 0 || nationIdx >= nationSeeds.length) {
		return -1
	}
	return nationSeeds[nationIdx] ?? -1
}

export function nationProvinceCount(
	world: SerializedGenesisWorld,
	nationIdx: number,
): number {
	const directCount = world.nations?.size?.[nationIdx]
	if (typeof directCount === "number" && directCount > 0) return directCount

	const assignment = world.nations?.assignment
	const provinceCount = world.provinces?.count ?? 0
	if (!assignment || provinceCount <= 0) return 0

	let count = 0
	for (let province = 0; province < provinceCount; province++) {
		if (assignment[province] === nationIdx) count++
	}
	return count
}
