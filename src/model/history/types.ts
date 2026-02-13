interface Note {
	time: number
	tag: "rebellion" | "succession" | "war started" | "battle" | "war ended"
	agents: number[]
}

interface Rebellion extends Note {
	tag: "rebellion"
	overlord: number
	subject: number
	disconnected?: boolean
	succession?: boolean // True if this rebellion was triggered by a succession event
}

interface Succession extends Note {
	tag: "succession"
	nation: number
	leader: number // The leader index who died
	successor: number // The new leader index
}

interface WarStarted extends Note {
	tag: "war started"
	attacker: number
	defender: number
	war: number
	odds: number // Attack odds (0-1)
}

// Victory degree based on how decisive the battle was
// For the winner: decisive > victory > pyrrhic (barely won)
// For the loser: crushing < defeat < close (almost won)
export type VictoryDegree =
	| "decisive"
	| "victory"
	| "pyrrhic"
	| "close"
	| "defeat"
	| "crushing"

interface Battle extends Note {
	tag: "battle"
	war: number
	province: number
	attacker: number // The nation attacking in this battle
	defender: number // The nation defending in this battle
	winner: number // The nation that won the battle
	odds: number // Attack odds (0-1)
	margin: number // How far the roll was from the threshold (0-1)
	victoryDegree: VictoryDegree // How decisive the victory/defeat was
	attackerCost: number // Wealth cost to the attacker
	defenderCost: number // Wealth cost to the defender
}

interface WarEnded extends Note {
	tag: "war ended"
	war: number
	attacker: number
	defender: number
	winner: number // The nation that won (attacker or defender)
	transferred: number[] // Provinces transferred to winner
	stalemate?: string
}

export type HistoryNote =
	| Rebellion
	| Succession
	| WarStarted
	| Battle
	| WarEnded

type BaseEvent = { time: number }

export interface WarEvent extends BaseEvent {
	type: "war"
	nation: number
	previous: number
}

export interface BattleEvent extends BaseEvent {
	type: "battle"
	war: number
	attacker: number
	defender: number
}

export interface SuccessionEvent extends BaseEvent {
	type: "succession"
	province: number
	idx: number
}

export interface TaxEvent extends BaseEvent {
	type: "tax"
	nation: number
	previous: number
}

export interface CensusEvent extends BaseEvent {
	type: "census"
	previous: number
}

export type FutureEvent =
	| WarEvent
	| BattleEvent
	| SuccessionEvent
	| TaxEvent
	| CensusEvent
