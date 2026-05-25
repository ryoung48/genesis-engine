import type { SerializedOrogenWorld } from "@/model/transport/worker-types"

interface LabelNameResolvers {
	nation: (capitalProvince: number) => string
	dynasty: (dynastyId: number) => string
}

export function buildNationLabelNames(
	world: SerializedOrogenWorld | null,
	resolvers: LabelNameResolvers | null,
): string[] | null {
	if (!world?.nations?.seeds || !resolvers) return null
	const count = world.nations.seeds.length
	const names: string[] = new Array(count)
	for (let i = 0; i < count; i++) {
		const capitalProvince = world.nations.seeds[i] ?? -1
		names[i] = capitalProvince >= 0 ? resolvers.nation(capitalProvince) : ""
	}
	return names
}

export function buildNationDynastyLabelNames(
	world: SerializedOrogenWorld | null,
	resolvers: LabelNameResolvers | null,
): string[] | null {
	if (!world?.nations?.seeds || !world.leaderDynasty || !resolvers) return null
	const count = world.nations.seeds.length
	const names: string[] = new Array(count)
	for (let i = 0; i < count; i++) {
		const capitalProvince = world.nations.seeds[i] ?? -1
		const dynastyId =
			capitalProvince >= 0 ? (world.leaderDynasty[capitalProvince] ?? -1) : -1
		names[i] = dynastyId >= 0 ? resolvers.dynasty(dynastyId) : ""
	}
	return names
}
