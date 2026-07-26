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
	rng: HistoryRng
	victory?: boolean
	stalemate?: string
}
