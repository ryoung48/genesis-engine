import type {
	ArmyTradition,
	EconomyLookupParams,
} from "@/model/history/sim/engine/economy/types"
import type {
	EngineNote,
	HistoryState,
} from "@/model/history/sim/engine/state/types"

export type DistanceBand = "near" | "mid" | "far"

export type WarEnding = "capital" | "settlement" | "stalemate" | "exhaustion"

export type MilitaryReport = Record<string, number>

export interface FiscalProbe {
	surplus: (params: EconomyLookupParams) => number
	safe: (params: EconomyLookupParams) => number
	maintenance: (params: EconomyLookupParams) => number
	leakage: (params: EconomyLookupParams) => number
}

export interface CompletedWar {
	years: number
	tradition: ArmyTradition
	attackerWon: boolean
	ending: WarEnding
	rebel: boolean
	rebelIndependent: boolean
}

export interface BattleSample {
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
	tradition: ArmyTradition
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
	sovereignYears: Record<ArmyTradition, number>
	atWarYears: Record<ArmyTradition, number>
	armyShare: Record<ArmyTradition, number[]>
	armySize: Record<ArmyTradition, number[]>
	deployed: Record<ArmyTradition, number[]>
	manpowerAfterWar: Record<ArmyTradition, number[]>
	warStarts: Record<ArmyTradition, number>
	rebellions: Record<ArmyTradition, number>
	vassalageEnded: number
	counterWars: number
	vassalSamples: number
	vassalPairs: number
	relationPairs: Record<string, number>
	completed: CompletedWar[]
	battles: BattleSample[]
	repeatStrength: number[]
	raids: Record<ArmyTradition, RaidTotals>
	fiscal: Record<ArmyTradition, FiscalTotals>
	treasury: Record<ArmyTradition, TreasuryTotals>
	treasuryByBand: Record<DistanceBand, number[]>
	warStartTreasury: WarStartTreasury[]
	sacks: number[]
	firstBattleSettled: number
	firstBattleBelowExhaustion: number
	longPeaceSettled: number
	longPeaceNegative: number
	recoveryYears: number[]
	recoveryCensored: number
}

export interface MilitaryTracker {
	probe: FiscalProbe
	warTradition: Map<number, ArmyTradition>
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
