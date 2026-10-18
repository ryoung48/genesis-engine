import type { RulerFact } from "@/model/people/anchors/types"
import type { PeopleStore } from "@/model/people/store/types"

export interface LinkParams {
	store: PeopleStore
	first: RulerFact
	second: RulerFact
}

export interface SideParams {
	store: PeopleStore
	mothersSide: RulerFact
	fathersSide: RulerFact
}
