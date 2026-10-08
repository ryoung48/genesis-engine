import type { GenesisLandmarks } from "@/model/geography/terrain/landmarks/types"
import type { TreasuryBudget } from "@/model/history/sim/engine/economy/treasury-budget/types"
import type { EventHeap } from "@/model/history/sim/engine/event-heap"
import type { DeathSchedule } from "@/model/history/sim/engine/events/people/death/schedule/types"
import type { CoronationCounters } from "@/model/history/sim/engine/events/succession/coronation/counters/types"
import type { SuccessionContext } from "@/model/history/sim/engine/events/succession/types"
import type {
	JournalTransaction,
	PendingJournal,
} from "@/model/history/sim/engine/journal/types"
import type {
	Assignment,
	WarSide,
} from "@/model/history/sim/engine/military/deployments/types"
import type {
	MilitaryInterval,
	MilitaryTotals,
	Troops,
} from "@/model/history/sim/engine/military/recruitment/types"
import type { OpinionPoliticsTotals } from "@/model/history/sim/engine/opinion-context/types"
import type { MarriageTotals } from "@/model/history/sim/people/family/diagnostics/types"
import type {
	PeopleState,
	SeatChangeReason,
} from "@/model/history/sim/people/types"
import type { SharedRng } from "@/model/shared/random/rng"
import type { DejureTitles, TitleMembers } from "@/model/society/dejure/types"
import type {
	Route,
	RouteEdge,
} from "@/model/society/infrastructure/transport/types"
import type { ProvincePopulation } from "@/model/society/population/types"
import type {
	GenesisNationHierarchy,
	GenesisPartition,
	GenesisProvinces,
	SocietyEra,
} from "@/model/society/types"

export interface RebuildAssignmentParams {
	state: HistoryState
}

export type WarGoal = "conquest" | "independence" | "throne" | "claim"
export type Relation =
	| "NONE"
	| "OVERLORD"
	| "VASSAL"
	| "PU_SENIOR"
	| "PU_JUNIOR"
	| "ALLY"
	| "WAR"
	| "COLONY"
export type Disposition =
	| "RIVAL"
	| "SUSPICIOUS"
	| "NEUTRAL"
	| "FRIENDLY"
	| "TRUSTED"

export interface StartWarParams {
	state: HistoryState
	attacker: number
	defender: number
	rng: SharedRng
	goal: WarGoal
	// [JUSTIFICATION] Only a claim war has a claimant.
	claimant?: number
}

import type { Siege } from "@/model/history/sim/engine/events/siege/types"

export interface War {
	siege: Siege | null
	idx: number
	attacker: number
	defender: number
	startTime: number
	// [JUSTIFICATION] A running war has no end time until it is resolved.
	endTime?: number
	goal: WarGoal
	backers: number[]
	refusedCalls: Set<number>
	originalCrownRuler: number
	claimant: number
	deployed: Record<number, Troops>
	participants: Record<number, WarSide>
	candidates: Record<WarSide, number[]>
	// Whether each candidate passes the diplomatic part of a call to arms;
	// refreshed with candidates.
	callable: Record<WarSide, boolean[]>
	candidatesHierarchyVersion: number
	allocation: Record<number, number>
	occupied: number[]
	battleScore: number
	// Whether the one negotiated peace this war gets has been tried.
	dealConsidered: boolean
	// Allies in the war's last logged coalition; they stay until exhausted,
	// while newcomers must also be out of debt to join.
	allies: Set<number>
}

export interface Indemnity {
	payer: number
	receiver: number
	until: number
}

interface ActiveWarOptions {
	// [JUSTIFICATION] Fixtures and seeded wars default to conquest.
	goal?: WarGoal
	// [JUSTIFICATION] Only a claim war has a claimant; every other war uses -1.
	claimant?: number
	startTime?: number
	nextBattleTime?: number
	occupied?: number[]
	rebellion?: {
		overlord: number
		subject: number
		goal: WarGoal
	}
}

interface LeaderRuntime {
	idx: Int32Array
	birth: Float64Array
	targetUrban: Float32Array
	nameSeed: Int32Array
}

export interface EngineNote {
	tag: string
	time: number
	data: Record<
		string,
		number | number[] | string | (string | null)[] | boolean | undefined
	>
}

export interface RealmCacheEntry {
	population: number
	hierarchyVersion: number
	censusVersion: number
	knowledge: number
	revenue: number
	stateMaintenance: number
	// Grams of silver of output per resident, before extraction.
	outputPerHead: number
}

// Per-province memo of economy terms, each keyed by the inputs it was computed from.
export interface ProvinceEconomyCache {
	capital: Int32Array
	distanceMultiplier: Float64Array
	development: Float64Array
	developmentFactor: Float64Array
	knowledge: Float64Array
	knowledgeFactor: Float64Array
}

export interface CandidatesRefresh {
	hierarchyVersion: number
	wars: number
}

// Running totals of births and deaths applied at their own times.
export interface LifecycleCounters {
	births: number
	deaths: number
	staleDeaths: number
	cancelledDeliveries: number
	peakDeliveries: number
}

export interface HistoryState {
	marriageMarket: Map<number, MarriageTotals>
	opinionPolitics: OpinionPoliticsTotals
	coronations: CoronationCounters
	riverByProvince: Uint8Array
	P: number
	time: number
	era: SocietyEra

	// Live state, written through FIELDS; sovereign/child caches rebuild from
	// parentCurrent when hierarchyDirty.
	parentCurrent: Int32Array
	childOffset: Int32Array
	childList: Int32Array
	sovereignCurrent: Int32Array
	relationsCurrent: Uint8Array
	dispositionsCurrent: Uint8Array
	relationColumns: Set<number>[]
	hierarchyDirty: boolean
	hierarchyVersion: number
	titles: DejureTitles
	titleMembers: TitleMembers
	seatRank: Uint8Array
	districtSeat: Uint8Array
	// Per realm root: the leader index of the accession owed a coronation when
	// its minority regency ends, or -1.
	coronationOwed: Int32Array
	// Per realm root: 1 while the realm holds the lands of a rank above its
	// own without the title; rewritten by the yearly elevation pass.
	compositeRealm: Uint8Array
	districtRank: Uint8Array
	topTier: Uint8Array
	titleFounded: Uint8Array
	titleLapseSince: Float64Array
	_nationAdjCache?: { offset: Int32Array; list: Int32Array }
	_nationAdjCacheVersion?: number

	// Dense live-value mirrors of the per-province timelines.
	// Read/written at state.time; timelines remain authoritative for historical queries.
	assignmentCurrent: Int32Array
	popRuralCurrent: Float32Array
	popUrbanCurrent: Float32Array
	developmentCurrent: Float32Array
	// 0 = iron age, 1 = late medieval, 2 = early modern, 3 = industrial, 4 = information.
	knowledgeCurrent: Float32Array
	knowledgeBaseline: number
	// Bumped at each census; with hierarchyVersion it keys realmCache.
	censusVersion: number
	realmCache: Map<number, RealmCacheEntry>
	provinceEconomyCache: ProvinceEconomyCache
	// Ducats and enrolled troops; meaningful only on sovereign roots.
	treasuryCurrent: Float64Array
	treasuryBudgetCurrent: Map<number, TreasuryBudget>
	levyCurrent: Float64Array
	regularCurrent: Float64Array
	militaryIntervals: Map<number, MilitaryInterval>
	militaryAssignments: Map<number, Assignment[]>
	militaryTotals: MilitaryTotals
	militaryDirty: Set<number>
	militaryAllocationDirty: Set<number>
	militaryStrengthDirty: Set<number>
	militaryReady: boolean
	militaryDepth: number
	// Nations an event concerns; reconcile revisits only the wars they are in.
	militaryTouched: Set<number>
	// Active wars each nation leads, joins or may be called into.
	militaryWarIndex: Map<number, number[]>
	militaryWarIndexStale: boolean
	militaryDiplomacyDirty: boolean
	// Nations whose ties changed since candidates were last refreshed; only wars they lead need a refresh.
	militaryDiplomacyNations: Set<number>
	// Hierarchy version and war count at which every active war's candidates were last refreshed.
	militaryCandidatesRefresh: CandidatesRefresh
	// Field army size at the last census; the live value is MILITARY.armySize.
	armySizeCurrent: Float64Array
	revenueCurrent: Float64Array
	// Time until which a plundered province yields no output loot.
	plunderedUntil: Float64Array
	leaderDynCurrent: Int32Array
	leaderNameSeedCurrent: Int32Array
	leaderClaimCurrent: Uint8Array
	leaderBirthYearCurrent: Float32Array
	occupationCurrent: Int32Array

	// Live current-time mirrors for culture blend fields.
	cultureBlendSecondaryCurrent: Int32Array
	cultureBlendWeightCurrent: Float32Array

	// Live per-province war-index lists (mirror of provinceWars derivation).
	provinceWars: number[][]

	provinceSeeds: Int32Array
	provinceAdjOffset: Int32Array
	provinceAdjList: Int32Array
	provinceSize: Int32Array
	desolate: Uint8Array
	stateless: Uint8Array
	waterAccess: Uint8Array
	regionProvince: Int32Array
	regionAdjOffset: Int32Array
	regionAdjList: Int32Array
	regionIsLand: Uint8Array
	r_xyz: Float32Array
	province_xyz: Float32Array
	planetRadiusKm: number
	// Genesis topography and vegetation codes at each province's seed region.
	provinceTopography: Uint8Array
	provinceVegetation: Uint8Array
	habitability: Float32Array
	culture: Int32Array
	heritageOfCulture: Int32Array
	cultureCount: number
	cultureGenderSystems: Uint8Array
	cultureColors: Float32Array
	religion: Int32Array
	religionCount: number
	religionColors: Float32Array
	nationColors: Float32Array
	governmentType: Uint8Array

	wars: War[]
	truces: Map<number, number>
	indemnities: Indemnity[]
	activeWarIds: Set<number>
	events: EngineNote[]
	journal: JournalTransaction[]
	pendingJournal: PendingJournal
	deathSchedule: DeathSchedule
	lifecycle: LifecycleCounters
	// The seat walk of the death being applied; null outside one.
	successionContext: SuccessionContext | null
	people: PeopleState
	heap: EventHeap
	leaderRuntime: LeaderRuntime
	routes: Route[]
	network: RouteEdge[]
	landmarks: GenesisLandmarks
}

export interface QueueBattleEventParams {
	state: HistoryState
	warIdx: number
	attacker: number
	time: number
}

export interface ResolveWarParams {
	state: HistoryState
	war: War
	transferred: number[]
	receiver: number
}

export interface OccupiedLandParams {
	state: HistoryState
	war: War
}

export interface WarSidesParams {
	war: War
}

export interface WarSides {
	rebels: number
	crown: number
}

export interface DiffYearsParams {
	a: number
	b: number
}

export interface BuildProvinceXyzParams {
	provinceSeeds: Int32Array
	r_xyz: Float32Array
}

export interface ValidateParentArrayParams {
	parent: Int32Array
	provinceCount: number
	context: string
}

export interface ValidateLiveHierarchyParams {
	state: HistoryState
	context: string
}

export interface GetRelationParams {
	state: HistoryState
	a: number
	b: number
}

export interface SetRelationParams {
	state: HistoryState
	a: number
	b: number
	rel: Relation
}

export interface SetDispositionParams {
	state: HistoryState
	a: number
	b: number
	disposition: Disposition
	// [JUSTIFICATION] Low-level state fixtures can set a disposition without an event cause.
	cause?: string
}

export interface GetRulerRelationParams {
	state: HistoryState
	nation: number
}

export interface CanAllyParams {
	state: HistoryState
	a: number
	b: number
}

export interface GetSovereignParams {
	state: HistoryState
	p: number
}

export interface IsSovereignParams {
	state: HistoryState
	p: number
}

export interface GetChildrenParams {
	state: HistoryState
	p: number
}

export interface GetNationProvincesParams {
	state: HistoryState
	root: number
}

export interface GetNationNeighborsParams {
	state: HistoryState
	nation: number
}

export interface GetProvinceNeighborsParams {
	state: HistoryState
	p: number
}

export interface GetWarAlliesParams {
	state: HistoryState
	nation: number
	type: "offensive" | "defensive"
	target: number
}

export interface ReleaseProvinceParams {
	state: HistoryState
	p: number
	rng: SharedRng
	reason: SeatChangeReason
}

export interface ReleaseFactionParams extends ReleaseProvinceParams {
	supporters: number[]
}

export interface IsProvinceConnectedToParentParams {
	state: HistoryState
	province: number
}

export interface ReleaseDisconnectedProvinceParams {
	state: HistoryState
	province: number
	overlord: number
	rng: SharedRng
}

export interface RepartitionNationParams {
	state: HistoryState
	nation: number
	subjects: number[]
}

export interface ClearRealmDiplomacyParams {
	state: HistoryState
	nation: number
}

export interface ReleaseSubjectRelationsParams {
	state: HistoryState
	nation: number
}

export interface FixConnectionsParams {
	state: HistoryState
	nation: number
	rng: SharedRng
}

export interface SettleCutOffParams {
	state: HistoryState
	nation: number
	other: number
	rng: SharedRng
}

export interface CreateActiveWarParams {
	state: HistoryState
	attacker: number
	defender: number
	rng: SharedRng
	options?: ActiveWarOptions
}

export interface ProvinceDistanceSqParams {
	state: HistoryState
	a: number
	b: number
}

export interface CreateHistoryStateParams {
	seed: number
	nations: GenesisNationHierarchy
	provinces: GenesisProvinces
	population: ProvincePopulation
	coastal: Uint8Array
	riverVisible: Uint8Array
	r_xyz: Float32Array
	cultures: GenesisPartition
	// [JUSTIFICATION] Some generated worlds have no heritage partition.
	heritages?: GenesisPartition
	// [JUSTIFICATION] Some generated eras do not create religious partitions.
	religions?: GenesisPartition
	startYear: number
	waterAccess?: Uint8Array
	landmarks?: GenesisLandmarks
	regionProvince?: Int32Array
	regionAdjOffset?: Int32Array
	regionAdjList?: Int32Array
	regionIsLand?: Uint8Array
	era?: SocietyEra
	planetRadiusKm: number
	topography: Uint8Array | null
	vegetation: Uint8Array | null
}

export interface OriginOfParams {
	state: HistoryState
	realm: number
}

export interface ScheduleSuccessionParams {
	state: HistoryState
	p: number
}

export interface InstallRulerParams {
	state: HistoryState
	p: number
	person: number
	claim: number
	reason: SeatChangeReason
}

export interface FoundRulerParams {
	state: HistoryState
	p: number
	age: number
	claim: number
	rng: SharedRng
	reason: SeatChangeReason
}

export interface UnionRealmParams {
	state: HistoryState
	p: number
}

export interface IsRebelGoalParams {
	goal: WarGoal
}

export interface ContinueUnionParams {
	state: HistoryState
	generations: Map<number, number>
}

export interface UnionPairParams {
	state: HistoryState
	junior: number
	senior: number
}

export interface UnionRulerParams {
	state: HistoryState
	p: number
	person: number
}

export interface RealmPairParams {
	state: HistoryState
	a: number
	b: number
}

export interface UniteParams {
	state: HistoryState
	a: number
	b: number
	ruler: number
	// The same person now rules both realms, counting toward a merge.
	shared: boolean
}

export interface UnionLink {
	senior: number
	junior: number
	merge: boolean
}
