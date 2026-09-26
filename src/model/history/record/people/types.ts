import type {
	JournalPeople,
	JournalPerson,
} from "@/model/history/sim/engine/journal/types"

export interface RecordPerson {
	id: number
	sex: number
	birthTimeMs: number
	deathTimeMs: number
	father: number
	mother: number
	dynasty: number
	nameSeed: number
	home: number
	name: string
	// [JUSTIFICATION] Outsider spouses belong to no ruling house.
	house: string | null
}

export interface PersonNames {
	name: string
	// [JUSTIFICATION] Outsider spouses belong to no ruling house.
	house: string | null
}

export interface DescribePersonParams {
	person: JournalPerson
	houseHome: number
}

export interface RecordMarriage {
	husband: number
	wife: number
	startTimeMs: number
}

export interface RecordTenure {
	person: number
	seat: number
	sovereign: boolean
	startTimeMs: number
	endTimeMs: number
}

export interface PeopleRecord {
	persons: Map<number, RecordPerson>
	childrenOf: Map<number, number[]>
	marriages: RecordMarriage[]
	marriagesOf: Map<number, number[]>
	tenures: RecordTenure[]
	tenuresOf: Map<number, number[]>
	tenuresOfSeat: Map<number, number[]>
	// Home realm of each house's first recorded member; house names use it.
	dynastyHome: Map<number, number>
}

export interface AppendPeopleParams {
	record: PeopleRecord
	rows: JournalPeople
	timeMs: number
	recordTime: (engineTimeMs: number) => number
	describe: (params: DescribePersonParams) => PersonNames
}

export interface PushIndexParams {
	index: Map<number, number[]>
	key: number
	value: number
}
