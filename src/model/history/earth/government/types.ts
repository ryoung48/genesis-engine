export type EarthHistoryGovernmentFamily =
	| "tribal"
	| "monarchy"
	| "republic"
	| "theocracy"

export interface BlendRgbParams {
	a: readonly [number, number, number]
	b: readonly [number, number, number]
	t: number
}

export interface HistoryGovernmentLabelParams {
	governmentType: string | null
	governmentReform: string | null | undefined
}

export interface GovernmentReformLabelParams {
	governmentReform: string | null | undefined
}
