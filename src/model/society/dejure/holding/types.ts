import type { DejureTitles, TitleMembers } from "@/model/society/dejure/types"

type SeatMoveCause = "seat lost" | "title passed"

export type TitleChange =
	| { kind: "passed"; title: number; from: number; to: number }
	| {
			kind: "moved"
			title: number
			from: number
			to: number
			cause: SeatMoveCause
	  }

export interface SettleTitlesParams {
	titles: DejureTitles
	members: TitleMembers
	provinceCount: number
	ownerOf: Int32Array
	rank: Uint8Array
	habitability: Float32Array
	urbanPop: Float32Array
	waterAccess: Uint8Array
	touched: Iterable<number>
}

export interface SettleTitleParams extends Omit<SettleTitlesParams, "touched"> {
	title: number
}

export interface ShareCounts {
	total: number
	byOwner: Map<number, number>
}

export interface MinToHoldParams {
	tier: number
	total: number
}

export interface NextHolderParams {
	counts: ShareCounts
	tier: number
}

export interface HolderInParams {
	titles: DejureTitles
	provinceCount: number
	ownerOf: Int32Array
	title: number
	previous: number
	realm: number
}
