import type { DynastyNameParams } from "@/model/society/language/names/types"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
export interface LabelNameResolvers {
	nation: (capitalProvince: number) => string
	dynasty: (params: DynastyNameParams) => string
	province: (provinceIdx: number) => string
	culture: (cultureId: number) => string
	heritage: (heritageId: number) => string
	religion: (religionId: number) => string
}

export interface SettlementLabelNamesParams {
	world: SerializedGenesisWorld | null
	resolvers: LabelNameResolvers | null
	routeEndpoints: ReadonlySet<number>
}
