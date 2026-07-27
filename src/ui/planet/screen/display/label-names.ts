import { SETTLEMENT_TUNING } from "@/model/society/settlement-tuning"
import type { SerializedGenesisWorld } from "@/model/transport/types"

interface LabelNameResolvers {
	nation: (capitalProvince: number) => string
	dynasty: (dynastyId: number) => string
	province: (provinceIdx: number) => string
	culture: (cultureId: number) => string
	heritage: (heritageId: number) => string
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

export function buildSettlementLabelNames(
	world: SerializedGenesisWorld | null,
	resolvers: LabelNameResolvers | null,
): string[] | null {
	if (!world?.settlementRegions || !world.urbanPopulation || !resolvers)
		return null
	const { townMin } = SETTLEMENT_TUNING.getSettlementEraTuning(
		world.params?.era,
	)
	const provinceCount = world.provinces?.count ?? world.settlementRegions.length
	const names: string[] = new Array(provinceCount)
	for (let p = 0; p < provinceCount; p++) {
		const settlementRegion = world.settlementRegions[p] ?? -1
		const pop = world.urbanPopulation[p] ?? 0
		names[p] =
			settlementRegion >= 0 && pop >= townMin ? resolvers.province(p) : ""
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
