import type { RawHeritage } from "@/model/history/earth/data-source/types"

export interface HeritageIndex {
	heritages: RawHeritage[]
	/** culture id -> heritage id */
	cultureToHeritage: Map<string, string>
}
