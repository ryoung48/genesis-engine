import type { LocationOptions } from "@/model/society/infrastructure/trade/trade-goods/types"

export interface ConfineParams {
	goods: number[]
	options: LocationOptions
	material: Uint8Array
	landmass: Int32Array
	coastal: Uint8Array
	xyz: Float32Array
}

export interface HomeLandmassesParams {
	suitability: Map<number, number>
	home: number
	coasts: Map<number, Coast>
	gaps: Map<number, number>
	xyz: Float32Array
}

export interface GoodHolder {
	l: number
	at: number
	own: number
	rest: number
}

export interface HoldersParams {
	options: LocationOptions
	goods: number[]
}

export interface ShareScaleParams {
	home: GoodHolder[]
	target: number
}

export interface Coast {
	points: number[]
	center: [number, number, number]
	radius: number
}

export interface CoastParams {
	points: number[]
	xyz: Float32Array
}

export interface CoastGapParams {
	from: Coast
	to: Coast
	xyz: Float32Array
}

export interface CoastGapBoundParams {
	from: Coast
	to: Coast
}
