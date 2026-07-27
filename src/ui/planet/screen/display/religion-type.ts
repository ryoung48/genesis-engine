import type { SerializedGenesisWorld } from "@/model/transport/types"

function getReligionIndexForCulture(
	world: Pick<SerializedGenesisWorld, "religions">,
	cultureIdx: number,
): number {
	if (cultureIdx < 0 || !world.religions) return -1
	return world.religions.assignment[cultureIdx] ?? -1
}

function getReligionTypeIndexForCulture(
	world: Pick<SerializedGenesisWorld, "religions" | "religionTypes">,
	cultureIdx: number,
): number {
	if (!world.religionTypes) return -1
	const religionIdx = getReligionIndexForCulture(world, cultureIdx)
	if (religionIdx < 0) return -1
	return world.religionTypes[religionIdx] ?? -1
}

function getReligionColorForCulture(
	world: Pick<SerializedGenesisWorld, "religions">,
	cultureIdx: number,
): readonly [number, number, number] | null {
	const religionIdx = getReligionIndexForCulture(world, cultureIdx)
	if (religionIdx < 0 || !world.religions) return null
	const base = religionIdx * 3
	if (base + 2 >= world.religions.colors.length) return null
	return [
		world.religions.colors[base],
		world.religions.colors[base + 1],
		world.religions.colors[base + 2],
	]
}

export function getReligionTypeIndexForProvince(
	world: Pick<
		SerializedGenesisWorld,
		"cultures" | "religions" | "religionTypes"
	>,
	provinceIdx: number,
): number {
	const cultureIdx = world.cultures?.assignment[provinceIdx] ?? -1
	return getReligionTypeIndexForCulture(world, cultureIdx)
}

export function getReligionColorForProvince(
	world: Pick<SerializedGenesisWorld, "cultures" | "religions">,
	provinceIdx: number,
): readonly [number, number, number] | null {
	const cultureIdx = world.cultures?.assignment[provinceIdx] ?? -1
	return getReligionColorForCulture(world, cultureIdx)
}
