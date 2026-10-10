import type { NationIdentity } from "@/model/history/record/types"

export interface LifetimeWindow {
	from: number
	to: number
}

export interface LifetimeParams {
	nations: NationIdentity[]
	windows: LifetimeWindow[]
}

export interface LifetimeSummary {
	from: number
	to: number
	ended: number
	alive: number
	mean: number
	p10: number
	p25: number
	p50: number
	p75: number
	p90: number
}
