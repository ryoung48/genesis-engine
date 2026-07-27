import type { RawHeritage } from "@/model/earth/history/data-source/types"

export interface HeritageIndex {
	heritages: RawHeritage[]
	/** culture id -> heritage id */
	cultureToHeritage: Map<string, string>
}
