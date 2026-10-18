import type { Character } from "@/model/people/character/types"
import type { AgeingState } from "@/model/people/health/ageing/types"

export type HealthBand =
	| "Dying"
	| "Near death"
	| "Poor"
	| "Fine"
	| "Good"
	| "Excellent"

export type LifeRow =
	| { timeMs: number; kind: "band"; band: HealthBand }
	| {
			timeMs: number
			kind: "condition"
			condition: string
			before: number
			after: number
	  }

export interface Life {
	birthMs: number
	rows: LifeRow[]
	healthByYear: number[]
	deathMs: number
	cause: string | null
	incapableMs: number
}

export interface LifeParams {
	seed: number
	character: Character
	birthMs: number
	sex: number
	survivesMs: number
	fixedDeathMs: number | null
	horizonMs: number
}

export interface LifeAtParams {
	life: Life
	timeMs: number
}

export interface LifeStatus {
	band: HealthBand | "Dead"
	levels: number[]
}

export interface EffectiveParams {
	character: Character
	base: number
	state: AgeingState
	age: number
}
