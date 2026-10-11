import type { DejureTitles, TitleMembers } from "@/model/society/dejure/types"

export interface FullyHeldChildrenParams {
	titles: DejureTitles
	members: TitleMembers
	provinceCount: number
	ownerOf: Int32Array
	holder: number
	tier: number
	orphansOnly: boolean
}

export interface WholeHeldParams {
	members: TitleMembers
	ownerOf: Int32Array
	holder: number
	title: number
}

export interface OrphanParams {
	childHeld: boolean
	parentHeld: boolean
}

export interface DuchyGroupsParams {
	titles: DejureTitles
	provinceCount: number
	ownerOf: Int32Array
	// Provinces whose duchy was destroyed.
	gap: Uint8Array
	adjOffset: Int32Array
	adjList: Int32Array
	habitability: Float32Array
	urbanPop: Float32Array
	waterAccess: Uint8Array
}

export interface QualifyingParams {
	titles: DejureTitles
	members: TitleMembers
	provinceCount: number
	ownerOf: Int32Array
}

export interface QualifiedFounding {
	holder: number
	tier: number
	children: number[]
}

export interface SameAboveParams {
	titles: DejureTitles
	provinceCount: number
	a: number
	b: number
}

export interface TrimDuchyParams {
	group: number[]
	params: DuchyGroupsParams
}

export interface QualifiesParams {
	members: TitleMembers
	children: number[]
	tier: number
}

export interface FoundTitleParams {
	titles: DejureTitles
	members: TitleMembers
	provinceCount: number
	ownerOf: Int32Array
	rank: Uint8Array
	habitability: Float32Array
	urbanPop: Float32Array
	waterAccess: Uint8Array
	holder: number
	tier: number
	children: number[]
}

export interface FoundedTitle {
	title: number
	tier: number
	seat: number
	holder: number
	children: number[]
	ancestors: number[]
	sources: number[]
}

export interface DissolveTitleParams {
	titles: DejureTitles
	members: TitleMembers
	provinceCount: number
	title: number
}

export interface DissolvedTitle {
	title: number
	tier: number
	children: number[]
	ancestors: number[]
}
