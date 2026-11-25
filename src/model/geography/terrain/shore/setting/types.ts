export type ShoreSetting = "none" | "delta" | "estuary" | "fjord"

export interface ShoreSettingParams {
	coastal: Uint8Array
	relief: Uint8Array
	flow: Float32Array
	tidalRange: Float32Array
	glaciated: Uint8Array
	exposureLeeM: Float32Array
}

export interface SettingOfParams {
	relief: number
	flowM3s: number
	tidalRangeM: number
	glaciated: boolean
	leeClass: number
}
