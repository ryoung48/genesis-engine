import type { SerializedGenesisWorld } from "@/model/transport/worker-types"

interface LabelNameResolvers {
	nation: (capitalProvince: number) => string
	dynasty: (dynastyId: number) => string
	province: (provinceIdx: number) => string
	culture: (cultureId: number) => string
	heritage: (heritageId: number) => string
	faith: (faithId: number) => string
	religion: (religionId: number) => string
}

export function buildNationLabelNames(
	world: SerializedGenesisWorld | null,
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

const SETTLEMENT_MIN_LABEL_POP = 1_000

export function buildSettlementLabelNames(
	world: SerializedGenesisWorld | null,
	resolvers: LabelNameResolvers | null,
): string[] | null {
	if (!world?.settlementRegions || !world.urbanPopulation || !resolvers)
		return null
	const provinceCount = world.provinces?.count ?? world.settlementRegions.length
	const names: string[] = new Array(provinceCount)
	for (let p = 0; p < provinceCount; p++) {
		const settlementRegion = world.settlementRegions[p] ?? -1
		const pop = world.urbanPopulation[p] ?? 0
		names[p] =
			settlementRegion >= 0 && pop >= SETTLEMENT_MIN_LABEL_POP
				? resolvers.province(p)
				: ""
	}
	return names
}

export function buildCultureLabelNames(
	world: SerializedGenesisWorld | null,
	resolvers: LabelNameResolvers | null,
): string[] | null {
	if (!world?.cultures || !resolvers) return null
	const count = world.cultures.count
	const names: string[] = new Array(count)
	for (let c = 0; c < count; c++) {
		names[c] = resolvers.culture(c)
	}
	return names
}

export function buildHeritageLabelNames(
	world: SerializedGenesisWorld | null,
	resolvers: LabelNameResolvers | null,
): string[] | null {
	if (!world?.heritages || !resolvers) return null
	const count = world.heritages.count
	const names: string[] = new Array(count)
	for (let h = 0; h < count; h++) {
		names[h] = resolvers.heritage(h)
	}
	return names
}

export function buildFaithLabelNames(
	world: SerializedGenesisWorld | null,
	resolvers: LabelNameResolvers | null,
): string[] | null {
	if (!world?.faiths || !resolvers) return null
	const count = world.faiths.count
	const names: string[] = new Array(count)
	for (let f = 0; f < count; f++) {
		names[f] = resolvers.faith(f)
	}
	return names
}

export function buildReligionLabelNames(
	world: SerializedGenesisWorld | null,
	resolvers: LabelNameResolvers | null,
): string[] | null {
	if (!world?.religions || !resolvers) return null
	const count = world.religions.count
	const names: string[] = new Array(count)
	for (let r = 0; r < count; r++) {
		names[r] = resolvers.religion(r)
	}
	return names
}

export function buildNationDynastyLabelNames(
	world: SerializedGenesisWorld | null,
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
