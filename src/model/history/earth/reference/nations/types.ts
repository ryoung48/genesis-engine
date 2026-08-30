import type {
	RawDiplomacyEvent,
	RawNationEvents,
	RawNationReference,
	RawOrganizationEvent,
	RawProvinceEvents,
	RawWar,
} from "@/model/history/earth/data-source/types"

export interface Nation {
	id: number
	/** EU4 country tag. Reference/display only -- never used as a map key or
	 * compared in logic; all nation identity in the fold layer is the numeric
	 * id. */
	tag: string
	name: string
	color: [number, number, number]
	/** tag === "REB" -- EU4's generic rebel actor, present as a belligerent in
	 * war data. Replaces the old isRebelTag() string check. */
	isRebel: boolean
	governmentType: string | null
	cultureId: string | null
	religionId: string | null
}

export interface NationTable {
	/** Indexed by Nation.id. */
	nations: Nation[]
	/** Build-time only -- consumed by the normalize step to rewrite raw
	 * tag-keyed event data onto numeric ids, then discarded. Nothing in the
	 * fold layer or the UI receives this. */
	idByTag: Map<string, number>
}

export interface BuildNationTableParams {
	nationEvents: RawNationEvents
	provinceEvents: RawProvinceEvents
	wars: RawWar[]
	diplomacy: RawDiplomacyEvent[]
	organizationEvents: RawOrganizationEvent[]
	nationReference: Map<string, RawNationReference>
}
