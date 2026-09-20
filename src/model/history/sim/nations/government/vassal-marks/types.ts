import type { SizedMarkShares } from "@/model/society/eras/types"

export interface AssignVassalMarksParams {
	markShares: SizedMarkShares
	nationGovernment: Uint8Array
	assignment: Int32Array
	sizes: number[]
	parent: Int32Array
	depth: Int32Array
	childOffset: Int32Array
	childList: Int32Array
	adjOffset: Int32Array
	adjList: Int32Array
	migrationWave: Float32Array | undefined
	habitability: Float32Array
	waterAccess: Uint8Array
	urbanPop: Float32Array
}

export interface MarkContext extends AssignVassalMarksParams {
	provinceCount: number
	order: Int32Array
	mark: Int16Array
	resolved: Uint8Array
	civicTaken: Uint8Array
	wave: Float32Array
}

export interface SubtreeStats {
	size: Int32Array
	waveSum: Float64Array
	habSum: Float64Array
	uniform: Int16Array
}

export interface SubtreeCandidate {
	province: number
	size: number
	wave: number
	habitability: number
}

export interface SubtreePassParams {
	ctx: MarkContext
	candidates: SubtreeCandidate[]
	quota: number
	target: number
	wavePreference: "high" | "low"
}

export interface SinglePassParams {
	ctx: MarkContext
	candidates: number[]
	quota: number
	target: number
	rank: (province: number) => [number, number]
}

export interface SubtreeCandidatesParams {
	ctx: MarkContext
	stats: SubtreeStats
	provinces: number[]
}

export interface CountProvincesParams {
	ctx: MarkContext
	source: number
	nationFilter: (nation: number) => boolean
}

export interface SingleCandidatesParams {
	ctx: MarkContext
	minNationSize: number
}

export interface BlockAroundParams {
	ctx: MarkContext
	blocked: Uint8Array
	root: number
}
