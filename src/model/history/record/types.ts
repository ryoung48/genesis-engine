import type {
	RawDiplomacyEvent,
	RawNationEvents,
	RawOrganizationEvent,
	RawProvinceEvents,
	RawWar,
} from "@/model/history/earth/data-source/types"
import type { Eu4ProvinceMap } from "@/model/history/earth/import/eu4-province-map/types"
import type { Nation } from "@/model/history/earth/reference/nations/types"
import type { LonLat } from "@/model/history/earth/types"
import type { PeopleRecord } from "@/model/history/record/people/types"
import type { TreasuryBudget } from "@/model/history/sim/engine/economy/treasury-budget/types"
import type { BattleOutcome } from "@/model/history/sim/engine/military/types"
import type {
	PartitionRow,
	WorldFrame,
} from "@/model/history/world-frame/types"
import type { GenesisProvinces } from "@/model/society/types"

export interface RevoltComment {
	nation: string
	cause: string
	person: number
	throne: boolean
}

export type HistoryComment = string | RevoltComment | null

export interface HistoryEvent {
	timeMs: number
	kind: string
	payload: Record<string, unknown>
	comment: HistoryComment
}

export interface ProvinceEventLog {
	base: {
		ownerId: number
		parentId: number
		controllerId: number
		cultureId: number
		cultureBlendSecondaryId: number
		religionId: number
		inHolyRomanEmpire: boolean
	}
	events: HistoryEvent[]
}

export interface NationEventLog {
	base: {
		reforms: string[]
		capitalProvinceId: number
		initialGovernment: string
	}
	events: HistoryEvent[]
}

export interface DiplomacyEventRecord {
	timeMs: number
	kind: string
	firstId: number
	secondId: number
	subjectType: string | null
	// [JUSTIFICATION] Only a procedural royal marriage names the married
	// couple; every other event has no people.
	spouses?: [number, number]
}

export interface WarParticipantEventRecord {
	timeMs: number
	nationId: number
	kind: "warStart" | "warEnd"
	side: "attacker" | "defender"
	comment: string | null
}

export interface BattleParticipant {
	countryId: number
	commander: string | null
	infantry: number | null
	cavalry: number | null
	artillery: number | null
	losses: number | null
}

export type ParticipantRole =
	| "vassal"
	| "overlord"
	| "union partner"
	| "ally"
	| "backer"

export interface BattleContribution {
	countryId: number
	troops: number
	// Relation to the side's lead; null for the lead and for Earth wars.
	role: ParticipantRole | null
}

export interface SimulatedBattle {
	// Each coalition member's deployed troops after the battle.
	contributions: BattleContribution[]
	outcome: BattleOutcome
	preBattleWinProbability: number
	powerShare: number
	topography: string
	vegetation: string
}

export interface Battle {
	timeMs: number
	name: string
	locationProvinceId: number
	attacker: BattleParticipant
	defender: BattleParticipant
	attackerDeployed: number | null
	defenderDeployed: number | null
	attackerWon: boolean
	comment: string | null
	// Null for recorded Earth battles, which carry no simulated roll.
	simulated: SimulatedBattle | null
}

export interface WarRecord {
	id: number
	name: string
	casusBelli: string
	warGoalType: string
	warGoalId: number
	warGoalProvinceId: number
	rebel: boolean
	events: WarParticipantEventRecord[]
	battles: Battle[]
	// Each realm's troops when the war was declared; empty for Earth wars.
	mobilization: BattleContribution[]
}

export interface OrgMembershipEventRecord {
	timeMs: number
	nationId: number
	kind: "join" | "leave"
	payload: { orgId: string; role: string | null }
}

export interface OrgSiteEventRecord {
	timeMs: number
	provinceId: number
	kind: "siteStart" | "siteEnd"
	payload: { orgId: string; name: string; role: string }
}

export type OrganizationEventRecord =
	| OrgMembershipEventRecord
	| OrgSiteEventRecord

export interface CensusKeyframe {
	timeMs: number
	urban: Float32Array
	rural: Float32Array
	development: Float32Array
	economy: CensusEconomy
}

export interface CensusDeployment {
	warId: number
	troops: number
}

export interface CensusEconomy {
	roots: Int32Array
	treasury: Float32Array
	revenue: Float32Array
	manpower: Float32Array
	maxManpower: Float32Array
	army: Float32Array
	// Each realm's deployed troops per active war.
	deployments: CensusDeployment[][]
	budgets: Array<TreasuryBudget | null>
}

export interface TitleBase {
	count: number
	tier: Uint8Array
	seat: Int32Array
	holder: Int32Array
	regionOf: Int32Array
}

export type TitleEventRecord =
	| { timeMs: number; kind: "passed"; title: number; from: number; to: number }
	| {
			timeMs: number
			kind: "moved"
			title: number
			from: number
			to: number
			cause: string
	  }
	| {
			timeMs: number
			kind: "created"
			title: number
			tier: number
			seat: number
			holder: number
			children: number[]
			ancestors: number[]
	  }
	| {
			timeMs: number
			kind: "destroyed"
			title: number
			children: number[]
			ancestors: number[]
	  }

export interface RaidRecord {
	timeMs: number
	raiderId: number
	victimId: number
	provinceId: number
	success: boolean
	loot: number
	raiderParty: number
	response: number
	raiderLosses: number
	victimLosses: number
}

export interface HistoryEvents {
	provinceEvents: Map<number, ProvinceEventLog>
	nationEvents: (NationEventLog | undefined)[]
	wars: WarRecord[]
	diplomacy: DiplomacyEventRecord[]
	organizationEvents: OrganizationEventRecord[]
	censuses: CensusKeyframe[]
	titleEvents: TitleEventRecord[]
	raids: RaidRecord[]
}

export interface NationIdentity {
	id: number
	name: string
	color: readonly [number, number, number]
	birthTimeMs: number
	deathTimeMs: number
	isRebel: boolean
	tag: string | null
}

export interface HistoryRecordCommon {
	minTimeMs: number
	maxTimeMs: number
	nations: NationIdentity[]
	cultures: PartitionRow[]
	religions: PartitionRow[]
}

export type HistoryRecord = HistoryRecordCommon & {
	origin: "earth" | "procedural"
	events: HistoryEvents
	// [JUSTIFICATION] Earth records have no de jure title layer.
	titles: TitleBase | null
	// [JUSTIFICATION] Earth records have no simulated people.
	people: PeopleRecord | null
}

export interface ProvinceMeta {
	name: string | null
	wasteland: boolean
	area: string | null
	region: string | null
	superregion: string | null
}

export type ProvinceMap = Eu4ProvinceMap

export type FrameCache = Map<number, WorldFrame>

export interface HistoryState {
	record: HistoryRecord
	frameCache: FrameCache
	provinceMap: ProvinceMap
	provinceMeta: ProvinceMeta[]
	provinceCoords: LonLat[]
}

export interface BuildEarthRecordParams {
	provinceEvents: RawProvinceEvents
	nationEvents: RawNationEvents
	wars: RawWar[]
	diplomacy: RawDiplomacyEvent[]
	organizationEvents: RawOrganizationEvent[]
	nations: Nation[]
	idByTag: Map<string, number>
	cultures: PartitionRow[]
	religions: PartitionRow[]
}

export interface CreateHistoryStateParams {
	record: HistoryRecord
	provinceMap: ProvinceMap
	provinceMeta: ProvinceMeta[]
	provinceCoords: LonLat[]
}

export interface FrameAtParams {
	state: HistoryState
	timeMs: number
}

export interface LoadEarthStateParams {
	provinces: GenesisProvinces
}

export interface LoadedEarthState {
	state: HistoryState
}
