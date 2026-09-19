import type { GenesisLandmarks } from "@/model/geography/terrain/landmarks/types"
import type { DerivedCache } from "@/model/history/sim/engine/derive/types"
import type { EventHeap } from "@/model/history/sim/engine/event-heap"
import type {
	JournalTransaction,
	PendingJournal,
} from "@/model/history/sim/engine/journal/types"
import type { Relation } from "@/model/history/sim/engine/state"
import type { SharedRng } from "@/model/shared/random/rng"
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

export interface StartWarParams {
	state: HistoryState
	attacker: number
	defender: number
	rng: SharedRng
	rebel: boolean
}

export interface War {
	idx: number
	attacker: number
	defender: number
	startTime: number
	endTime?: number
	rebel: boolean
	/** Provinces currently occupied by the attacker in this war. */
	occupied: number[]
}

interface ActiveWarOptions {
	rebel?: boolean
	startTime?: number
	nextBattleTime?: number
	occupied?: number[]
	rebellion?: {
		overlord: number
		subject: number
	}
}

interface LeaderRuntime {
	idx: Int32Array
	birth: Float64Array
	end: Float64Array
	targetUrban: Float32Array
	nameSeed: Int32Array
}

export interface HistoryNote {
	tag: string
	time: number
	data: Record<string, number | number[] | string | boolean | undefined>
}

export interface HistoryState {
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
	relationColumns: Set<number>[]
	hierarchyDirty: boolean
	hierarchyVersion: number
	_nationAdjCache?: { offset: Int32Array; list: Int32Array }
	_nationAdjCacheVersion?: number

	// Dense live-value mirrors of the per-province timelines.
	// Read/written at state.time; timelines remain authoritative for historical queries.
	assignmentCurrent: Int32Array
	popRuralCurrent: Float32Array
	popUrbanCurrent: Float32Array
	developmentCurrent: Float32Array
	consumptionCurrent: Float32Array
	// Battle costs accumulate at double precision; consumptionCurrent is the
	// float32 view every reader sees.
	consumptionExact: Float64Array
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
	habitability: Float32Array
	culture: Int32Array
	cultureCount: number
	cultureColors: Float32Array
	religion: Int32Array
	religionCount: number
	religionColors: Float32Array
	nationColors: Float32Array
	/** Per-province government type index into GOVERNMENT_TYPES (eras.ts) */
	governmentType: Uint8Array

	wars: War[]
	events: HistoryNote[]
	journal: JournalTransaction[]
	pendingJournal: PendingJournal
	nextDynasty: number
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
	defender: number
	time: number
}

export interface WealthCurrentParams {
	state: HistoryState
	p: number
	exclude?: number
	freedom?: boolean
	cache?: DerivedCache
}

export interface WarStrengthCoalitionParams {
	state: HistoryState
	attacker: number
	defender: number
	exclude?: number
	cache?: DerivedCache
}

export interface ResolveWarParams {
	state: HistoryState
	war: War
	rng: SharedRng
	victory?: boolean
	stalemate?: string
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

export interface GetRulerRelationParams {
	state: HistoryState
	nation: number
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

export interface WealthOptimalParams {
	state: HistoryState
	p: number
}

export interface WarStrengthSoloParams {
	state: HistoryState
	p: number
	exclude?: number
	cache?: DerivedCache
}

export interface GetWarAlliesParams {
	state: HistoryState
	nation: number
	type: "offensive" | "defensive"
	target: number
}

export interface WarThreatParams {
	state: HistoryState
	attacker: number
	defender: number
	exclude?: number
}

export interface ReleaseProvinceParams {
	state: HistoryState
	p: number
	rng: SharedRng
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

export interface AddTerritoryParams {
	state: HistoryState
	nation: number
	subjects: number[]
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
	nations: GenesisNationHierarchy
	provinces: GenesisProvinces
	population: ProvincePopulation
	coastal: Uint8Array
	riverVisible: Uint8Array
	r_xyz: Float32Array
	cultures: GenesisPartition
	// [JUSTIFICATION] Some generated eras do not create religious partitions.
	religions?: GenesisPartition
	startYear: number
	rng: SharedRng
	waterAccess?: Uint8Array
	landmarks?: GenesisLandmarks
	regionProvince?: Int32Array
	regionAdjOffset?: Int32Array
	regionAdjList?: Int32Array
	regionIsLand?: Uint8Array
	era?: SocietyEra
}

export interface SpawnLeaderParams {
	state: HistoryState
	p: number
	rng: SharedRng
	end?: number
}

export interface InitDynastiesParams {
	state: HistoryState
	rng: SharedRng
}
