import type { HistoryRecord } from "@/model/history/record/types"
import type { WorldFrame } from "@/model/history/world-frame/types"
import type { AnchorIndex } from "@/model/people/anchors/types"
import type { ReligionDoctrine } from "@/model/people/doctrine/types"
import type { PersonKey } from "@/model/people/keys/types"
import type { Chain, Marriage } from "@/model/people/marriage/types"
import type { SeatList } from "@/model/people/nobility/types"
import type { PersonNames, PersonStub } from "@/model/people/stub/types"
import type { LanguageNames } from "@/model/society/language/names"

export interface PeopleGeography {
	provinceAdjOffset: Int32Array
	provinceAdjList: Int32Array
	locationProvince: Int32Array
	locationCount: number
}

export interface PeopleContext {
	// [JUSTIFICATION] Worlds without province data have no seats.
	geography: PeopleGeography | null
	frameAt: (timeMs: number) => WorldFrame
	// [JUSTIFICATION] Worlds without religions have no doctrines.
	doctrine: ReligionDoctrine | null
}

export interface BuildCounters {
	l1: Set<PersonKey>
	l2: Set<PersonKey>
	l3: Set<PersonKey>
}

export interface PeopleStore {
	record: HistoryRecord
	worldSeed: number
	horizonMs: number
	generator: LanguageNames
	// [JUSTIFICATION] The context arrives with the first page request.
	context: PeopleContext | null
	// [JUSTIFICATION] The anchor index is built on the first page request.
	index: AnchorIndex | null
	stubs: Map<PersonKey, PersonStub>
	chains: Map<PersonKey, Chain>
	claims: Map<PersonKey, Marriage[]>
	holders: Map<string, PersonKey>
	seats: Map<string, SeatList>
	rings: Map<string, number[]>
	seeded: Set<string>
	pairs: Set<string>
	tiers: Map<string, number>
	depth: number
	baseChains: Map<PersonKey, Chain>
	kin: Map<string, Marriage[]>
	marriages: Map<string, Marriage>
	names: Map<PersonKey, PersonNames>
	houses: Map<string, string>
	builds: BuildCounters
}

export interface SnappedFrameParams {
	store: PeopleStore
	timeMs: number
}

export interface StoreOfParams {
	record: HistoryRecord
}
