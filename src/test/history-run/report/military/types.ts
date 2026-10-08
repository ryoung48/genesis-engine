import type { EconomyLookupParams } from "@/model/history/sim/engine/economy/types"
import type { PeaceOutcome } from "@/model/history/sim/engine/events/peace/types"
import type {
	EngineNote,
	HistoryState,
	Relation,
	WarGoal,
} from "@/model/history/sim/engine/state/types"
import type { GovernmentFamily } from "@/model/society/types"

export type DistanceBand = "near" | "mid" | "far"
export type TreasuryRole = "vassal" | "overlord" | "free"

export type WarEnding = "capital" | "settlement" | "stalled" | "exhaustion"

export type MilitaryReport = Record<string, number>

export interface TieKindParams {
	tie: Relation
}

export interface FiscalProbe {
	surplus: (params: EconomyLookupParams) => number
	safe: (params: EconomyLookupParams) => number
	maintenance: (params: EconomyLookupParams) => number
	leakage: (params: EconomyLookupParams) => number
}

export interface CompletedWar {
	years: number
	government: GovernmentFamily
	attackerWon: boolean
	ending: WarEnding
	outcome: PeaceOutcome
	payment: number
	goal: WarGoal
	backers: number
	inVassal: boolean
	rebelIndependent: boolean
	score: number
	capitalHeld: boolean
	enforced: boolean
	reason: string
	defenderIndemnity: boolean
	attackerIndemnity: boolean
}

export interface BattleSample {
	kind: string
	attackerWon: boolean
	attackerLossPct: number
	defenderLossPct: number
	// Null when both sides had equal effective strength.
	weakerWon: boolean | null
	result: string
	initial: string
	routed: boolean
	shortfall: number
	topography: string
	vegetation: string
	water: boolean
	knowledge: number
	casualties: number
}

export interface FiscalTotals {
	revenue: number
	maintenance: number
	army: number
	leakage: number
	tributePaid: number
	tributeReceived: number
	indemnityPaid: number
	indemnityReceived: number
	unpaid: number
}

export interface TreasuryTotals {
	ratios: number[]
	positiveYears: number
	negative: number
	aboveSafe: number
	aboveFiveSafe: number
	nonPositiveSurplus: number
	nonPositiveNegative: number
}

export interface WarStartTreasury {
	government: GovernmentFamily
	band: DistanceBand
	inSurplus: number
	inSafe: number
}

export interface RaidTotals {
	count: number
	success: number
	loot: number
	atSafe: number
}

export interface MilitaryWindow {
	siegeStarts: number
	siegeEndings: { outcome: string; phases: number }[]
	sovereignYears: Record<GovernmentFamily, number>
	atWarYears: Record<GovernmentFamily, number>
	armyShare: Record<GovernmentFamily, number[]>
	armySize: Record<GovernmentFamily, number[]>
	deployed: Record<GovernmentFamily, number[]>
	strengthAfterWar: Record<GovernmentFamily, number[]>
	warStarts: Record<GovernmentFamily, number>
	rebellions: Record<GovernmentFamily, number>
	rebellionsByGoal: Record<
		"independence" | "throne",
		Record<GovernmentFamily, number>
	>
	backingRepaid: Record<
		"vassal" | "alliance" | "trusted" | "disposition",
		number
	>
	backersViaOverlord: number
	backersOverlord: number
	backersDisloyalVassal: number
	tributeWithheld: number
	callsRefused: number
	dispositionAid: number
	dispositionAbandoned: number
	throneVassalFreed: number
	vassalsChained: number
	mixedGovernmentUnions: number
	unionsContinued: number
	claimCandidates: number
	claimsPressed: number
	tiePairs: Record<string, number>
	firstTiePairs: Record<string, number>
	lastTiePairs: Record<string, number>
	dispositionPairs: Record<string, number>
	vassalDispositionPairs: Record<string, number>
	lastDispositionPairs: Record<string, number>
	lastVassalDispositionPairs: Record<string, number>
	vassalageEnded: number
	vassalageEndedByDisposition: Record<string, number>
	vassalageEndedByCause: Record<string, number>
	counterWars: number
	peacefulAnnexations: number
	provincesReleased: number
	cutOffJoined: number
	cutOffJoinedWars: number
	vassalSamples: number
	vassalPairs: number
	alliances: number
	alliancesFormed: number
	alliancesEnded: number
	vassalsFormed: number
	invalidAlliances: number
	relationPairs: Record<string, number>
	completed: CompletedWar[]
	battles: BattleSample[]
	repeatStrength: number[]
	raids: Record<GovernmentFamily, RaidTotals>
	fiscal: Record<GovernmentFamily, FiscalTotals>
	treasury: Record<GovernmentFamily, TreasuryTotals>
	treasuryByRole: Record<TreasuryRole, TreasuryTotals>
	treasuryByBand: Record<DistanceBand, number[]>
	warStartTreasury: WarStartTreasury[]
	sacks: number[]
	firstBattleRealm: number
	firstBattleBelowExhaustion: number
	longPeaceRealm: number
	longPeaceNegative: number
	recoveryYears: number[]
	recoveryCensored: number
}

export interface MilitaryTracker {
	probe: FiscalProbe
	warGovernment: Map<number, GovernmentFamily>
	warInVassal: Map<number, boolean>
	warBattles: Map<number, number>
	lastStrength: Map<number, number>
	firstBattle: Set<number>
	vassalageEnded: EngineNote[]
	recovering: Map<number, number>
	peaceYears: Map<number, number>
	window: MilitaryWindow
}

export interface AttachParams {
	engine: HistoryState
	probe: FiscalProbe
}

export interface AttachedTracker {
	tracker: MilitaryTracker
	detach: () => void
}

export interface ObserveNoteParams {
	engine: HistoryState
	tracker: MilitaryTracker
	note: EngineNote
}

export interface SampleParams {
	engine: HistoryState
	tracker: MilitaryTracker
	sampleRelations: boolean
}

export interface SummarizeParams {
	tracker: MilitaryTracker
}

export interface DistanceBandParams {
	engine: HistoryState
	nation: number
}

export interface LogMilitaryParams {
	reports: { from: number; to: number; military: MilitaryReport }[]
	log: (line: string) => void
}

export interface QuantileParams {
	values: number[]
	q: number
}

export interface RatioParams {
	count: number
	total: number
}

export interface ExhaustionFloorParams {
	engine: HistoryState
	nation: number
	probe: FiscalProbe
}

export interface WarEndingParams {
	engine: HistoryState
	note: EngineNote
}
