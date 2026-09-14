import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type {
	AllocationCountInput,
	WorldTypeAllocation,
	WorldTypeAllocationInput,
} from "@/model/celestial/system/generation/world-type-allocation/types"

function allocateCount({
	totalCount,
	starCapacityByIndex,
	eligibleIndices,
}: AllocationCountInput): number[] {
	const allocated = Array.from({ length: starCapacityByIndex.length }, () => 0)
	if (totalCount === 0 || eligibleIndices.length === 0) return allocated
	const totalCapacity = eligibleIndices.reduce(
		(sum, index) => sum + starCapacityByIndex[index]!,
		0,
	)
	let remaining = totalCount
	for (let position = 0; position < eligibleIndices.length; position++) {
		const index = eligibleIndices[position]!
		const isPrimary = position === 0
		const isOutermost = position === eligibleIndices.length - 1
		const allocation = isOutermost
			? remaining
			: totalCount * (starCapacityByIndex[index]! / totalCapacity)
		allocated[index] = isPrimary
			? Math.ceil(allocation)
			: Math.floor(allocation)
		remaining -= allocated[index]!
	}
	return allocated
}

function allocate({
	worldTypeCounts,
	stars,
}: WorldTypeAllocationInput): WorldTypeAllocation[] {
	const starCapacityByIndex = stars.map((star) =>
		Math.max(
			0,
			ORBIT_BODY.auToOrbitNumber({ au: star.maxOrbitalDistanceAU }) -
				ORBIT_BODY.auToOrbitNumber({ au: star.mao }),
		),
	)
	const eligibleIndices = stars
		.map((star, index) => ({ star, index }))
		.filter(
			({ star, index }) =>
				star.acceptsBodies && starCapacityByIndex[index]! > 0,
		)
		.sort((a, b) => a.star.orbitalDistanceAU - b.star.orbitalDistanceAU)
		.map(({ index }) => index)
	const gasGiantCountByIndex = allocateCount({
		totalCount: worldTypeCounts.gasGiantCount,
		starCapacityByIndex,
		eligibleIndices,
	})
	const beltCountByIndex = allocateCount({
		totalCount: worldTypeCounts.beltCount,
		starCapacityByIndex,
		eligibleIndices,
	})
	const terrestrialCountByIndex = allocateCount({
		totalCount: worldTypeCounts.terrestrialCount,
		starCapacityByIndex,
		eligibleIndices,
	})
	return [...stars.entries()].map<WorldTypeAllocation>(([index]) => {
		const gasGiantCount = gasGiantCountByIndex[index]!
		const beltCount = beltCountByIndex[index]!
		const terrestrialCount = terrestrialCountByIndex[index]!
		return {
			starCapacity: starCapacityByIndex[index]!,
			gasGiantCount,
			beltCount,
			terrestrialCount,
			emptyOrbitCount: 0,
			anomalousOrbitReservations: [],
			orbitSlots: [],
			baselineNumber: null,
			baselineOrbitNumber: null,
			totalWorlds: gasGiantCount + beltCount + terrestrialCount,
		}
	})
}

export const WORLD_TYPE_ALLOCATION = {
	allocate,
}
