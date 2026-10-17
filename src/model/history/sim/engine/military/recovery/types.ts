export interface RecoveryParams {
	holdings: number
	target: number
	rate: number
	years: number
}

export interface RecoveryResult {
	holdings: number
	replacements: number
	soldierYears: number
}
